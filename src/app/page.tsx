'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  sources?: { title: string; slug: string }[];
}

interface WikiPage {
  slug: string;
  title: string;
  file: string;
  folder: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'bot',
      content: 'Hola, soy Hermes. Consultame sobre los documentos cargados y te respondo con información precisa.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showIndex, setShowIndex] = useState(false);
  const [indexPages, setIndexPages] = useState<WikiPage[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const textToSend = text || input.trim();
    if (!textToSend) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: textToSend }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error del servidor');
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: data.answer,
        sources: data.sources,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setError(err.message);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: `❌ Error: ${err.message}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const loadIndex = async () => {
    setShowIndex(true);
    setIndexLoading(true);
    try {
      const res = await fetch('/api/index');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIndexPages(data.pages || []);
    } catch (err: any) {
      setIndexPages([]);
    } finally {
      setIndexLoading(false);
    }
  };

  const suggestions = [
    { label: '¿Qué documentos hay?', q: '¿Qué documentos hay disponibles?' },
    { label: 'Resumen', q: 'Dame un resumen del documento' },
    { label: 'Ver índice', action: 'index' },
  ];

  return (
    <main className="chat-container">
      <header className="chat-header">
        <h1>🤖 Hermes Wiki Chat</h1>
        <span className="status">● Conectado</span>
      </header>

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`msg msg-${msg.role}`}>
            <div className="msg-content" dangerouslySetInnerHTML={{ __html: msg.content }} />
            {msg.sources && msg.sources.length > 0 && (
              <div className="msg-sources">
                📄 Fuentes: {msg.sources.map((s, i) => (
                  <span key={i} className="source-link">
                    {s.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="msg msg-bot">
            <div className="msg-content typing">⏳ Hermes está pensando...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && (
        <div className="suggestions">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="suggestion-btn"
              onClick={() => s.action === 'index' ? loadIndex() : sendMessage(s.q)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {showIndex && (
        <div className="index-overlay" onClick={() => setShowIndex(false)}>
          <div className="index-modal" onClick={(e) => e.stopPropagation()}>
            <div className="index-header">
              <h2>📚 Índice de Documentos</h2>
              <button className="index-close" onClick={() => setShowIndex(false)}>✕</button>
            </div>
            <div className="index-body">
              {indexLoading ? (
                <div className="index-loading">Cargando...</div>
              ) : indexPages.length === 0 ? (
                <div className="index-empty">No hay documentos</div>
              ) : (
                <ul className="index-list">
                  {indexPages.map((page) => (
                    <li key={page.slug} className="index-item">
                      <span className="index-icon">📄</span>
                      <span className="index-title">{page.title}</span>
                      {page.folder && page.folder !== 'root' && (
                        <span className="index-folder">📁 {page.folder}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-bar">⚠️ {error}</div>}

      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Escribí tu pregunta..."
          disabled={loading}
        />
        <button onClick={() => sendMessage()} disabled={loading || !input.trim()}>
          ▶
        </button>
      </div>

      <style jsx>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #1a1a2e;
          color: #e0e0e0;
          font-family: 'Google Sans', Arial, sans-serif;
        }

        .chat-header {
          background: #16213e;
          padding: 12px 20px;
          border-bottom: 1px solid #0f3460;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .chat-header h1 {
          font-size: 16px;
          color: #e94560;
          margin: 0;
        }

        .status {
          font-size: 12px;
          color: #4ade80;
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .msg {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.5;
        }

        .msg-user {
          align-self: flex-end;
          background: #0f3460;
          color: #fff;
        }

        .msg-bot {
          align-self: flex-start;
          background: #16213e;
          border: 1px solid #0f3460;
        }

        .msg-content {
          word-break: break-word;
        }

        .msg-content :global(strong) {
          color: #e94560;
        }

        .msg-content :global(a) {
          color: #e94560;
        }

        .msg-content :global(pre) {
          background: #0a0a1a;
          padding: 8px;
          border-radius: 6px;
          overflow-x: auto;
          font-size: 12px;
        }

        .msg-content :global(code) {
          background: #0a0a1a;
          padding: 2px 5px;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-size: 13px;
        }

        .msg-sources {
          margin-top: 8px;
          font-size: 11px;
          color: #888;
        }

        .source-link {
          background: #0f3460;
          color: #e94560;
          padding: 2px 8px;
          border-radius: 10px;
          margin-right: 6px;
        }

        .suggestions {
          display: flex;
          gap: 8px;
          padding: 0 20px 12px;
          flex-wrap: wrap;
        }

        .suggestion-btn {
          background: #0f3460;
          border: 1px solid #e94560;
          border-radius: 14px;
          padding: 5px 14px;
          font-size: 12px;
          color: #e94560;
          cursor: pointer;
          transition: all 0.15s;
        }

        .suggestion-btn:hover {
          background: #e94560;
          color: #fff;
        }

        .error-bar {
          padding: 8px 20px;
          background: rgba(231, 76, 60, 0.2);
          color: #e74c3c;
          font-size: 13px;
          text-align: center;
        }

        .input-area {
          background: #16213e;
          padding: 12px 20px;
          border-top: 1px solid #0f3460;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .input-area input {
          flex: 1;
          background: #1a1a2e;
          border: 1px solid #0f3460;
          border-radius: 20px;
          padding: 10px 16px;
          color: #fff;
          font-size: 14px;
          outline: none;
        }

        .input-area input:focus {
          border-color: #e94560;
        }

        .input-area input:disabled {
          opacity: 0.5;
        }

        .input-area button {
          background: #e94560;
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          color: #fff;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .input-area button:disabled {
          background: #555;
          cursor: not-allowed;
        }

        .input-area button:not(:disabled):hover {
          background: #c73e54;
        }

        .typing {
          color: #e94560;
          font-style: italic;
        }

        .index-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .index-modal {
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
        }

        .index-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #0f3460;
        }

        .index-header h2 {
          font-size: 16px;
          color: #e94560;
          margin: 0;
        }

        .index-close {
          background: none;
          border: none;
          color: #888;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .index-close:hover {
          background: #0f3460;
          color: #fff;
        }

        .index-body {
          padding: 16px 20px;
          overflow-y: auto;
          flex: 1;
        }

        .index-loading,
        .index-empty {
          text-align: center;
          color: #888;
          padding: 20px;
        }

        .index-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .index-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: #1a1a2e;
          border-radius: 8px;
          border: 1px solid #0f3460;
        }

        .index-icon {
          font-size: 16px;
        }

        .index-title {
          flex: 1;
          font-size: 13px;
          color: #e0e0e0;
        }

        .index-folder {
          font-size: 11px;
          color: #888;
          background: #0f3460;
          padding: 2px 8px;
          border-radius: 10px;
        }
      `}</style>
    </main>
  );
}
