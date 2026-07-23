"""FastAPI contract for the Agentic Bot React frontend.

Chat, RAG uploads, history, and memory routes live here. Authentication is
pending: replace the local_user fallback before multi-user deployment.
"""
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
import re
import uuid

import certifi
from dotenv import load_dotenv

load_dotenv()
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field

from agent import ALLOWED_MODELS, DEFAULT_MODEL, get_agent, normalize_model_name
from database import (
    create_or_update_conversation,
    delete_memories,
    delete_memory_by_id,
    get_chat_history,
    init_db,
    list_conversations,
    list_memories,
    save_chat_message,
)
from rag import add_document_to_rag

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_UPLOAD_SUFFIXES = {".pdf", ".docx", ".txt", ".md", ".py", ".csv"}
logger = logging.getLogger("agentic_bot.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Create storage and database tables once at API startup."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
    init_db()
    yield


app = FastAPI(title="Agentic Bot API", version="0.1.0", lifespan=lifespan)

# Vite uses port 5173. Set CORS_ORIGINS to a comma-separated production allowlist.
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


class AttachmentReference(BaseModel):
    """Metadata only; actual bytes go to /api/documents first."""
    id: str
    name: str


class ChatRequest(BaseModel):
    """JSON body expected from api.sendMessage in React."""
    message: str = Field(min_length=1, max_length=50_000)
    model: str = DEFAULT_MODEL
    conversation_id: str | None = Field(default=None, alias="conversationId")
    user_id: str = Field(default="local_user", alias="userId")
    attachments: list[AttachmentReference] = Field(default_factory=list)
    model_config = {"populate_by_name": True}


class ChatResponse(BaseModel):
    id: str
    conversationId: str
    content: str


def _assistant_text(result: dict) -> str:
    """Extract the final text message from a LangGraph result."""
    for message in reversed(result.get("messages", [])):
        if isinstance(message, AIMessage) and not message.tool_calls:
            if isinstance(message.content, str):
                return message.content
            parts = [
                block.get("text", "")
                for block in message.content
                if isinstance(block, dict) and block.get("type") == "text"
            ]
            if parts:
                return "".join(parts)
    raise RuntimeError("The agent completed without a textual response.")


@app.get("/api/health", tags=["system"])
def health() -> dict:
    """Cheap endpoint for deployment health probes."""
    return {"status": "ok"}


@app.get("/api/models", tags=["chat"])
def get_models() -> dict:
    """Expose valid model IDs so the frontend need not guess them."""
    return {"default": DEFAULT_MODEL, "models": sorted(ALLOWED_MODELS)}


@app.post("/api/chat", response_model=ChatResponse, tags=["chat"])
def chat(payload: ChatRequest) -> ChatResponse:
    """Run one agent turn and return completed JSON.

    conversationId is the LangGraph thread ID, preserving context. This is
    non-streaming because api.js expects one object; use SSE later if needed.
    """
    thread_id = payload.conversation_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id, "user_id": payload.user_id}}
    create_or_update_conversation(thread_id, payload.message)
    save_chat_message(thread_id, "user", payload.message)

    try:
        result = get_agent(normalize_model_name(payload.model)).invoke(
            {"messages": [HumanMessage(content=payload.message)]}, config=config
        )
        content = _assistant_text(result)
    except Exception as exc:
        # Never expose API keys, prompts, or provider tracebacks to the browser.
        logger.exception("Chat request failed for thread_id=%s model=%s", thread_id, payload.model)
        raise HTTPException(status_code=502, detail="The AI provider failed. Check backend logs for the exact cause.") from exc

    save_chat_message(thread_id, "assistant", content)
    return ChatResponse(id=str(uuid.uuid4()), conversationId=thread_id, content=content)


def _safe_upload_name(original_name: str) -> str:
    """Remove path/control characters and prevent filename collisions."""
    plain_name = Path(original_name).name
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(plain_name).stem).strip("._")
    return f"{uuid.uuid4().hex}_{stem or 'document'}{Path(plain_name).suffix.lower()}"


@app.post("/api/documents", status_code=status.HTTP_201_CREATED, tags=["documents"])
async def upload_documents(
    files: list[UploadFile] = File(...),
    thread_id: str = Form(...),
    user_id: str = Form("local_user"),
) -> dict:
    """Index multipart files for a thread.

    Use the same thread ID as conversationId in /api/chat so RAG can find them.
    """
    del user_id  # Reserved for a future user-scoped vector-store migration.
    uploaded = []

    for upload in files:
        original_name = upload.filename or "document"
        suffix = Path(original_name).suffix.lower()
        if suffix not in ALLOWED_UPLOAD_SUFFIXES:
            raise HTTPException(status_code=415, detail=f"Unsupported type: {suffix or 'none'}")

        destination = UPLOAD_DIR / _safe_upload_name(original_name)
        size = 0
        try:
            with destination.open("wb") as output:
                while chunk := await upload.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise HTTPException(status_code=413, detail="File exceeds 20 MB.")
                    output.write(chunk)
            rag_result = add_document_to_rag(str(destination), thread_id)
            uploaded.append({
                "id": uuid.uuid4().hex,
                "name": original_name,
                "chunks": rag_result["chunks"],
            })
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        finally:
            await upload.close()

    return {"documents": uploaded}


@app.get("/api/conversations", tags=["conversations"])
def get_conversations(user_id: str = Query("local_user")) -> dict:
    """Return newest-first sidebar entries; storage is currently single-user."""
    del user_id  # Reserved for a future Conversation.user_id migration.
    return {"conversations": [{
        "id": item.thread_id,
        "title": item.title,
        "createdAt": item.created_at.isoformat(),
        "updatedAt": item.updated_at.isoformat(),
    } for item in list_conversations()]}


@app.get("/api/conversations/{thread_id}/messages", tags=["conversations"])
def get_conversation_messages(thread_id: str) -> dict:
    """Restore messages when a sidebar conversation is selected."""
    return {"messages": [{
        "id": str(item.id),
        "role": item.role,
        "content": item.content,
        "createdAt": item.created_at.isoformat(),
    } for item in get_chat_history(thread_id)]}


@app.get("/api/memories", tags=["memory"])
def get_memories(user_id: str = Query("local_user")) -> dict:
    """List the current user's long-term memories, newest first."""
    return {"memories": [{
        "id": str(item.id),
        "title": "Saved memory",
        "detail": item.memory,
        "date": item.created_at.isoformat(),
    } for item in list_memories(user_id)]}


@app.delete("/api/memories", tags=["memory"])
def clear_memories(user_id: str = Query("local_user")) -> dict:
    """Clear all long-term memories for the current user."""
    return {"ok": True, "deleted": delete_memories(user_id)}


@app.delete("/api/memories/{memory_id}", tags=["memory"])
def delete_memory(memory_id: int, user_id: str = Query("local_user")) -> dict:
    """Delete only a memory belonging to the current user."""
    if not delete_memory_by_id(user_id, memory_id):
        raise HTTPException(status_code=404, detail="Memory not found.")
    return {"ok": True}


if FRONTEND_DIST.exists():
    # Serve the built React app from FastAPI. Keep this after /api routes.
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/", include_in_schema=False)
    def serve_frontend() -> FileResponse | dict:
        """Tell local developers what to do when dist/ has not been built."""
        return {"detail": "Frontend build not found. Run: cd frontend && npm run build"}


if __name__ == "__main__":
    # Development convenience. Production: uvicorn app:app --host 0.0.0.0
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
