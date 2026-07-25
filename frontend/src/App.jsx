import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Archive,
  ArrowUp,
  Bot,
  Brain,
  Check,
  ChevronDown,
  FileText,
  Menu,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  PenLine,
  Plus,
  Search,
  Settings,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { api } from './api'

const MODELS = [
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', note: 'Default from backend .env' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', note: 'Quick everyday answers' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', note: 'Fastest lightweight model' },
]

const SUGGESTIONS = [
  { icon: Sparkles, title: 'Create something', text: 'Help me design a new project' },
  { icon: FileText, title: 'Analyze documents', text: 'Summarize an uploaded file' },
  { icon: Brain, title: 'Think it through', text: 'Break down a complex problem' },
]

const GROUPS = ['Today', 'Previous 7 days', 'Previous 30 days']

const createId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

const groupConversation = (updatedAt) => {
  if (!updatedAt) return 'Previous 30 days'
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  if (ageMs < dayMs) return 'Today'
  if (ageMs < 7 * dayMs) return 'Previous 7 days'
  return 'Previous 30 days'
}

const formatMemoryDate = (date) => {
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(date))
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [modelMenu, setModelMenu] = useState(false)
  const [model, setModel] = useState(MODELS[0])
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [memories, setMemories] = useState([])
  const [history, setHistory] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const fileInput = useRef(null)
  const textarea = useRef(null)
  const messagesEnd = useRef(null)
  const recognition = useRef(null)

  const filteredHistory = useMemo(
    () => history.filter((item) => item.title.toLowerCase().includes(search.toLowerCase())),
    [history, search],
  )

  useEffect(() => {
    let mounted = true

    async function loadSidebarData() {
      try {
        const [conversationItems, memoryItems] = await Promise.all([
          api.getConversations(),
          api.getMemories(),
        ])
        if (!mounted) return
        setHistory(conversationItems.map((item) => ({
          ...item,
          group: groupConversation(item.updatedAt),
        })))
        setMemories(memoryItems.map((item) => ({
          ...item,
          date: formatMemoryDate(item.date),
        })))
      } catch {
        // Keeps the UI usable while the FastAPI backend is still being wired.
      }
    }

    loadSidebarData()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const instance = new SpeechRecognition()
    instance.continuous = true
    instance.interimResults = true
    instance.lang = 'en-US'
    let finalText = ''
    instance.onstart = () => setListening(true)
    instance.onend = () => setListening(false)
    instance.onerror = () => setListening(false)
    instance.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) finalText += `${event.results[index][0].transcript} `
        else interim += event.results[index][0].transcript
      }
      setInput((previous) => {
        const base = previous.replace(/\s*\[listening:.*\]$/, '')
        return `${base}${base && finalText ? ' ' : ''}${finalText}${interim ? ` [listening: ${interim}]` : ''}`.trim()
      })
      if (finalText) finalText = ''
    }
    recognition.current = instance
    return () => instance.abort()
  }, [])

  const resizeTextarea = () => {
    requestAnimationFrame(() => {
      if (!textarea.current) return
      textarea.current.style.height = 'auto'
      textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 160)}px`
    })
  }

  const newChat = () => {
    setActiveChat(null)
    setMessages([])
    setInput('')
    setAttachments([])
    setMobileSidebar(false)
  }

  const openHistoryItem = async (item) => {
    setActiveChat(item.id)
    setMobileSidebar(false)
    setLoading(true)
    try {
      const restored = await api.getConversationMessages(item.id)
      setMessages(restored.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })))
    } catch {
      setMessages([
        { id: createId(), role: 'assistant', error: true, content: 'I could not load this chat from the backend.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const threadId = activeChat || createId()
    if (!activeChat) setActiveChat(threadId)
    try {
      const uploaded = await api.uploadDocuments(files, threadId)
      setAttachments((current) => [...current, ...uploaded])
    } catch {
      alert('Document upload failed. Check the backend and file type, then try again.')
    } finally {
      event.target.value = ''
    }
  }

  const toggleListening = () => {
    if (!recognition.current) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.')
      return
    }
    if (listening) recognition.current.stop()
    else recognition.current.start()
  }

  const sendMessage = async () => {
    const cleanInput = input.replace(/\s*\[listening:.*\]$/, '').trim()
    if ((!cleanInput && !attachments.length) || loading) return
    const conversationId = activeChat || createId()

    const userMessage = {
      id: createId(),
      role: 'user',
      content: cleanInput || 'Please review the attached document.',
      attachments,
    }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setAttachments([])
    setLoading(true)
    if (textarea.current) textarea.current.style.height = 'auto'

    const title = cleanInput.slice(0, 42) || attachments[0]?.name || 'New conversation'
    if (!activeChat) setActiveChat(conversationId)
    if (!messages.length) {
      setHistory((current) => {
        const existing = current.filter((item) => item.id !== conversationId)
        return [{ id: conversationId, title, group: 'Today' }, ...existing]
      })
    }

    try {
      const response = await api.sendMessage({
        message: cleanInput,
        model: model.id,
        conversationId,
        attachments: userMessage.attachments,
      })
      setMessages((current) => [...current, { id: response.id, role: 'assistant', content: response.content }])
    } catch {
      setMessages((current) => [...current, { id: createId(), role: 'assistant', error: true, content: 'I could not reach the backend. Check the API URL and try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const groupedHistory = GROUPS

  return (
    <div className="app-shell">
      {mobileSidebar && <button className="mobile-backdrop" aria-label="Close sidebar" onClick={() => setMobileSidebar(false)} />}

      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'} ${mobileSidebar ? 'mobile-open' : ''}`}>
        <div className="sidebar-head">
          <button className="brand" onClick={newChat} aria-label="Agentic Bot home">
            <span className="brand-mark"><Bot size={19} /></span>
            <span>Agentic Bot</span>
          </button>
          <button className="icon-button desktop-collapse" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar"><PanelLeftClose size={18} /></button>
          <button className="icon-button mobile-close" onClick={() => setMobileSidebar(false)} aria-label="Close sidebar"><X size={19} /></button>
        </div>

        <button className="new-chat" onClick={newChat}><PenLine size={17} /><span>New chat</span><kbd>Ctrl K</kbd></button>

        <label className="history-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" /></label>

        <div className="history-list">
          {groupedHistory.map((group) => {
            const items = filteredHistory.filter((item) => item.group === group)
            if (!items.length) return null
            return (
              <div className="history-group" key={group}>
                <p>{group}</p>
                {items.map((item) => (
                  <button className={`history-item ${activeChat === item.id ? 'active' : ''}`} onClick={() => openHistoryItem(item)} key={item.id}>
                    <MessageSquareText size={15} /><span>{item.title}</span><MoreHorizontal size={15} className="more" />
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        <div className="sidebar-footer">
          <button onClick={() => setMemoryOpen(true)}><Brain size={17} /><span>Memory</span><span className="memory-count">{memories.length}</span></button>
          <button><Settings size={17} /><span>Settings</span></button>
          <div className="profile"><span className="avatar">A</span><span><strong>Alex</strong><small>Personal workspace</small></span><MoreHorizontal size={17} /></div>
        </div>
      </aside>

      <main className={`main ${sidebarOpen ? '' : 'expanded'}`}>
        <header className="topbar">
          <div className="topbar-left">
            {!sidebarOpen && <button className="icon-button desktop-menu" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={20} /></button>}
            <button className="icon-button mobile-menu" onClick={() => setMobileSidebar(true)} aria-label="Open sidebar"><Menu size={20} /></button>
            <div className="model-wrap">
              <button className="model-trigger" onClick={() => setModelMenu((open) => !open)}>{model.name}<ChevronDown size={15} /></button>
              {modelMenu && (
                <div className="model-menu">
                  <p>Choose a model</p>
                  {MODELS.map((item) => (
                    <button key={item.id} onClick={() => { setModel(item); setModelMenu(false) }}>
                      <span className="model-icon"><Sparkles size={15} /></span>
                      <span><strong>{item.name}</strong><small>{item.note}</small></span>
                      {model.id === item.id && <Check size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button className="memory-top" onClick={() => setMemoryOpen(true)}><Brain size={17} /> Memory</button>
        </header>

        <section className={`chat-view ${messages.length ? 'has-messages' : ''}`}>
          {!messages.length ? (
            <div className="welcome">
              <div className="welcome-mark"><Bot size={27} /></div>
              <h1>What can I help you with?</h1>
              <p>Ask anything, explore an idea, or bring in a document.</p>
              <div className="suggestions">
                {SUGGESTIONS.map(({ icon: Icon, title, text }) => (
                  <button key={title} onClick={() => { setInput(text); textarea.current?.focus(); resizeTextarea() }}>
                    <span><Icon size={18} /></span><strong>{title}</strong><small>{text}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article className={`message ${message.role} ${message.error ? 'error' : ''}`} key={message.id}>
                  <div className="message-avatar">{message.role === 'assistant' ? <Bot size={17} /> : <UserRound size={17} />}</div>
                  <div className="message-body">
                    <strong>{message.role === 'assistant' ? 'Agentic Bot' : 'You'}</strong>
                    {message.attachments?.length > 0 && <div className="message-files">{message.attachments.map((file) => <span key={file.id}><FileText size={14} />{file.name}</span>)}</div>}
                    <div className="markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </article>
              ))}
              {loading && <article className="message assistant"><div className="message-avatar"><Bot size={17} /></div><div className="message-body"><strong>Agentic Bot</strong><div className="typing"><i /><i /><i /></div></div></article>}
              <div ref={messagesEnd} />
            </div>
          )}

          <div className="composer-wrap">
            <div className={`composer ${listening ? 'is-listening' : ''}`}>
              {attachments.length > 0 && (
                <div className="attachment-row">
                  {attachments.map((file) => <span key={file.id}><FileText size={15} /><em>{file.name}</em><button onClick={() => setAttachments((items) => items.filter((item) => item.id !== file.id))}><X size={13} /></button></span>)}
                </div>
              )}
              <textarea ref={textarea} value={input} onChange={(event) => { setInput(event.target.value); resizeTextarea() }} onKeyDown={onKeyDown} placeholder="Message Agentic Bot" rows={1} />
              <div className="composer-actions">
                <div>
                  <button className="tool-button" onClick={() => fileInput.current?.click()} title="Attach documents"><Paperclip size={18} /><span>Attach</span></button>
                  <input ref={fileInput} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.md,.csv" onChange={handleFiles} />
                </div>
                <div className="composer-right">
                  <button className={`mic-button ${listening ? 'active' : ''}`} onClick={toggleListening} title={listening ? 'Stop listening' : 'Speak'}>{listening ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}</button>
                  <button className="send-button" disabled={(!input.trim() && !attachments.length) || loading} onClick={sendMessage} aria-label="Send message"><ArrowUp size={19} /></button>
                </div>
              </div>
            </div>
            <p className="disclaimer">Agentic Bot can make mistakes. Check important information.</p>
          </div>
        </section>
      </main>

      {memoryOpen && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Memory">
          <button className="modal-backdrop" onClick={() => setMemoryOpen(false)} aria-label="Close memory" />
          <section className="memory-panel">
            <div className="memory-header">
              <div><span><Brain size={20} /></span><div><h2>Memory</h2><p>What Agentic Bot remembers about you</p></div></div>
              <button className="icon-button" onClick={() => setMemoryOpen(false)}><X size={19} /></button>
            </div>
            <div className="memory-info"><Sparkles size={17} /><p>Memories help personalize future responses. You stay in control and can remove any item.</p></div>
            <div className="memory-list">
              {memories.length ? memories.map((memory) => (
                <article key={memory.id}>
                  <div className="memory-item-icon"><Archive size={17} /></div>
                  <div><div className="memory-title"><strong>{memory.title}</strong><small>{memory.date}</small></div><p>{memory.detail}</p></div>
                  <button title="Delete memory" onClick={async () => { try { await api.deleteMemory(memory.id); setMemories((items) => items.filter((item) => item.id !== memory.id)) } catch { alert('Could not delete this memory.') } }}><Trash2 size={16} /></button>
                </article>
              )) : <div className="empty-memory"><Brain size={28} /><h3>No saved memories</h3><p>Useful details from your conversations will appear here.</p></div>}
            </div>
            {memories.length > 0 && <button className="clear-memory" onClick={async () => { try { await api.clearMemories(); setMemories([]) } catch { alert('Could not clear memories.') } }}>Clear all memories</button>}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
