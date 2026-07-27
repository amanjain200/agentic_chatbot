# Agentic Chatbot

A full-stack agentic AI chat application with a FastAPI backend, LangGraph agent orchestration, Gemini models, document RAG, web search, persistent chat history, and long-term memory. The React/Vite frontend provides a polished chat workspace with model selection, document uploads, markdown responses, conversation restore, and memory management.

## Key Features

- Agentic LangGraph loop with tool calling for calculator, Tavily web search, uploaded-document retrieval, and memory operations.
- Gemini-backed chat and embeddings through `langchain-google-genai`.
- Thread-scoped RAG over uploaded PDF, DOCX, TXT, Markdown, Python, and CSV files using Chroma.
- SQLite persistence for conversations, chat messages, long-term memories, and LangGraph checkpoints.
- FastAPI JSON API with health, model, chat, document upload, conversation, and memory endpoints.
- React chat UI with sidebar history, document attachment flow, markdown/GFM rendering, speech input where supported, and memory drawer controls.
- Dockerfile that builds the Vite frontend and serves it from the FastAPI app.
- GitHub Actions workflow for Docker image push to Amazon ECR and deployment on a self-hosted EC2 runner.

## Tech Stack

**Backend:** Python, FastAPI, LangGraph, LangChain, Google Gemini, Tavily, ChromaDB, SQLAlchemy, SQLite, Uvicorn

**Frontend:** React, Vite, lucide-react, react-markdown, remark-gfm

**Deployment:** Docker, GitHub Actions, Amazon ECR, EC2/self-hosted runner

## Setup

### 1. Backend

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Fill in at least:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
TAVILY_API_KEY=
```

Optional observability settings are already listed in `.env.example` for LangSmith tracing.

Run the API:

```bash
uvicorn app:app --reload
```

The API runs at `http://127.0.0.1:8000`.

### 2. Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

For local split frontend/backend development, set:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

The Vite app runs at `http://localhost:5173`.

## Usage Flow

1. Start the FastAPI backend and Vite frontend.
2. Open the frontend and send a message to create a conversation thread.
3. Upload supported documents from the composer; files are extracted, chunked, embedded, and stored in Chroma under the active thread.
4. Ask questions about the uploaded files to trigger document retrieval.
5. Ask for current information to trigger Tavily search.
6. Ask the assistant to remember useful facts, then view or delete saved memories from the memory panel.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Gemini API credentials used by chat and embeddings |
| `GEMINI_MODEL` | Default model exposed to the API and frontend |
| `TAVILY_API_KEY` | Enables web search tool calls |
| `LANGSMITH_TRACING` | Enables LangSmith tracing when configured |
| `LANGSMITH_ENDPOINT` | LangSmith endpoint |
| `LANGSMITH_API_KEY` | LangSmith API key |
| `LANGSMITH_PROJECT` | LangSmith project name |
| `DRAW_AGENT_GRAPH` | Writes `data/agent_graph.png` when enabled |
| `CORS_ORIGINS` | Comma-separated frontend origins for FastAPI CORS |
| `VITE_API_BASE_URL` | Frontend API base URL when not served from the same origin |

## API Overview

- `GET /api/health` - deployment health check.
- `GET /api/models` - returns supported model IDs.
- `POST /api/chat` - runs one non-streaming agent turn.
- `POST /api/documents` - uploads and indexes documents for a thread.
- `GET /api/conversations` - lists saved conversations.
- `GET /api/conversations/{thread_id}/messages` - restores a conversation.
- `GET /api/memories` - lists saved memories.
- `DELETE /api/memories` and `DELETE /api/memories/{memory_id}` - clears memory records.

## Build and Deployment

Build the frontend:

```bash
cd frontend
npm run build
```

When `frontend/dist` exists, FastAPI serves the built React app from `/` after the `/api` routes.

Build and run the Docker image:

```bash
docker build -t agentic-chatbot .
docker run --env-file .env -p 8080:8080 agentic-chatbot
```

The included GitHub Actions workflow builds the Docker image, pushes it to Amazon ECR, and redeploys the container on a self-hosted runner.

## Project Structure

```text
.
|-- app.py                  # FastAPI app and frontend static serving
|-- agent.py                # LangGraph agent, model selection, checkpointing
|-- tools.py                # Agent tools: search, RAG, memory, calculator
|-- rag.py                  # File extraction, chunking, embeddings, Chroma retrieval
|-- database.py             # SQLite persistence for chats and memories
|-- frontend/
|   |-- src/App.jsx         # Chat workspace UI
|   |-- src/api.js          # Frontend API client
|   `-- package.json        # Vite/React scripts and dependencies
|-- .github/workflows/      # ECR/EC2 deployment workflow
|-- Dockerfile              # Multi-stage frontend/backend container
`-- requirements.txt        # Python dependencies
```

## Notes

- Authentication is not implemented yet; the backend currently uses a `local_user` fallback.
- `test.py` is a manual agent streaming smoke test, not a formal automated test suite.
- Runtime data is written to `data/`, `uploads/`, and `chroma_db/`.
