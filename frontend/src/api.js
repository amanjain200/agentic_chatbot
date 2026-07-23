// Central FastAPI contract used by the React UI.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      message = body.detail || message
    } catch {
      // Keep the status-based message if the response is not JSON.
    }
    throw new Error(message)
  }
  return response.json()
}

export const api = {
  async sendMessage({ message, model, conversationId, attachments }) {
    return request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, model, conversationId, attachments }),
    })
  },

  async uploadDocuments(files, threadId) {
    const body = new FormData()
    Array.from(files).forEach((file) => body.append('files', file))
    body.append('thread_id', threadId)
    const result = await request('/api/documents', { method: 'POST', body })
    return result.documents
  },

  async getConversations() {
    const result = await request('/api/conversations')
    return result.conversations
  },

  async getConversationMessages(threadId) {
    const result = await request(
      `/api/conversations/${encodeURIComponent(threadId)}/messages`,
    )
    return result.messages
  },

  async getMemories() {
    const result = await request('/api/memories')
    return result.memories
  },

  async clearMemories() {
    return request('/api/memories', { method: 'DELETE' })
  },

  async deleteMemory(memoryId) {
    return request(`/api/memories/${encodeURIComponent(memoryId)}`, {
      method: 'DELETE',
    })
  },
}
