import sys

from agent import get_agent
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, AIMessageChunk, AnyMessage
from langchain_core.utils.uuid import uuid7
from database import (
    init_db,
    save_chat_message,
    get_chat_history,
    create_or_update_conversation,
    list_conversations)

from rag import add_document_to_rag
# from tools import set_current_thread_id
# if hasattr(sys.stdout, "reconfigure"):
#     sys.stdout.reconfigure(encoding="utf-8")



init_db()

agent = get_agent("gemini-3.5-flash")


config = {
        "configurable": {
            "thread_id": str(uuid7()),
            "user_id": "local_user",
        }
    }

def _render_completed_message(message: AnyMessage) -> None:
    if isinstance(message, AIMessage) and message.tool_calls:
        print(f"Tool calls: {message.tool_calls}")
    if isinstance(message, ToolMessage):
        print(f"Tool response: {message.content_blocks}")

try:
    for stream_mode, data in agent.stream(
        {'messages': [HumanMessage(content="Tell me some recent AI related news")]},
        config=config,
        stream_mode=['messages', 'updates'],
    ):
        if stream_mode == 'messages':
            message_chunk, metadata = data
            if message_chunk.text:
                print(message_chunk.text, end="", flush=True)

        elif stream_mode == 'updates':
            for source, update in data.items():
                if source in ("chatbot", "tools") and update.get("messages"):
                    _render_completed_message(update["messages"][-1])
except Exception as e:
    print(f"\nError: {e}")
