'use client';

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  sources?: { title: string; slug: string }[];
}

interface WikiItem {
  name: string;
  slug: string;
  title: string;
  type: 'file' | 'folder';
}

interface EditorState {
  open: boolean;
  mode: 'create' | 'edit';
  type: 'file' | 'folder';
  path: string;
  content: string;
  originalName: string;
}

interface MoveState {
  dragging: string | null;
  dragOver: string | null;
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
  const [wikiItems, setWikiItems] = useState<WikiItem[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const [editor, setEditor] = useState<EditorState>({
    open: false, mode: 'create', type: 'file', path: '', content: '', originalName: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [move, setMove] = useState<MoveState>({ dragging: null, dragOver: null });
  const [currentPath, setCurrentPath] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [showIntegrate, setShowIntegrate] = useState(false);
  const [folderList, setFolderList] = useState<WikiItem[]>([]);
  const [showFolderSelect, setShowFolderSelect] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const res = await fetch('/api/index');
      const data = await res.json();
      const folders = (data.items || []).filter((i: WikiItem) => i.type === 'folder');
      setFolderList(folders);
    } catch {}
  };

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
      const body: any = { question: textToSend };
      if (selectedFolder) body.folder = selectedFolder;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const loadIndex = async (path = '') => {
    setShowIndex(true);
    setIndexLoading(true);
    setCurrentPath(path);
    try {
      const res = await fetch(`/api/index${path ? '?path=' + encodeURIComponent(path) : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWikiItems(data.items || []);
    } catch (err: any) {
      setWikiItems([]);
    } finally {
      setIndexLoading(false);
    }
  };

  const selectFolder = (folder: WikiItem) => {
    setSelectedFolder(folder.slug);
    setShowIndex(false);
    setShowFolderSelect(false);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'bot',
      content: `📂 <strong>Cuaderno seleccionado:</strong> ${folder.title}<br>Todas las preguntas ahora usan solo este cuaderno.`,
    }]);
  };

  const clearFolder = () => {
    setSelectedFolder('');
    setShowFolderSelect(false);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'bot',
      content: `🌐 <strong>Modo global:</strong> Buscando en todos los documentos.`,
    }]);
  };

  const openFolderSelect = () => {
    setShowFolderSelect(true);
    loadFolders();
  };

  const openCreateFile = (inFolder = '') => {
    const folderPrefix = inFolder ? inFolder + '/' : '';
    setEditor({ open: true, mode: 'create', type: 'file', path: folderPrefix, content: '# ', originalName: '' });
  };

  const openCreateFolder = (inFolder = '') => {
    const folderPrefix = inFolder ? inFolder + '/' : '';
    setEditor({ open: true, mode: 'create', type: 'folder', path: folderPrefix, content: '', originalName: '' });
  };

  const openEditFile = async (item: WikiItem) => {
    try {
      const res = await fetch(`/api/wiki/file?path=${item.name}`);
      const data = await res.json();
      setEditor({ open: true, mode: 'edit', type: 'file', path: item.name, content: data.content || '', originalName: item.name });
    } catch {
      setError('No se pudo abrir el archivo');
    }
  };

  const saveEditor = async () => {
    setSaving(true);
    try {
      if (editor.type === 'folder') {
        await fetch('/api/wiki/folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editor.path }),
        });
      } else {
        await fetch(`/api/wiki/file?path=${editor.path}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editor.content }),
        });
      }
      setEditor({ ...editor, open: false });
      loadIndex(currentPath);
      loadFolders();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const isFolder = !deleteConfirm.endsWith('.md') && deleteConfirm.includes('/') === false;
      if (isFolder) {
        await fetch(`/api/wiki/folder?name=${deleteConfirm}`, { method: 'DELETE' });
      } else {
        await fetch(`/api/wiki/file?path=${deleteConfirm}`, { method: 'DELETE' });
      }
      setDeleteConfirm(null);
      loadIndex(currentPath);
      loadFolders();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDragStart = (e: DragEvent, itemName: string) => {
    setMove({ ...move, dragging: itemName });
    e.dataTransfer.setData('text/plain', itemName);
  };

  const handleDragOver = (e: DragEvent, folderName: string) => {
    e.preventDefault();
    setMove({ ...move, dragOver: folderName });
  };

  const handleDragLeave = () => {
    setMove({ ...move, dragOver: null });
  };

  const handleDrop = async (e: DragEvent, targetFolder: string) => {
    e.preventDefault();
    const fileName = e.dataTransfer.getData('text/plain');
    if (!fileName || fileName === targetFolder) {
      setMove({ dragging: null, dragOver: null });
      return;
    }
    try {
      const res = await fetch(`/api/wiki/file?path=${fileName}`);
      const data = await res.json();
      const destPath = targetFolder + '/' + fileName.split('/').pop();
      await fetch(`/api/wiki/file?path=${destPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: data.content }),
      });
      await fetch(`/api/wiki/file?path=${fileName}`, { method: 'DELETE' });
      loadIndex(currentPath);
    } catch (err: any) {
      setError(err.message);
    }
    setMove({ dragging: null, dragOver: null });
  };

  const openFolder = (folderName: string) => {
    setCurrentPath(folderName);
    loadIndex(folderName);
  };

  const goUp = () => {
    const parts = currentPath.split('/');
    parts.pop();
    const parent = parts.join('/');
    setCurrentPath(parent);
    loadIndex(parent);
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Solo archivos PDF');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', currentPath);

    try {
      const res = await fetch('/api/wiki/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setError('');
      loadIndex(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isFolder = (item: WikiItem) => item.type === 'folder';

  const suggestions = [
    { label: '¿Qué documentos hay?', q: '¿Qué documentos hay disponibles?' },
    { label: 'Resumen', q: 'Dame un resumen del documento' },
    { label: '📂 Cambiar cuaderno', action: 'folder' },
  ];

  return (
    <main className="chat-container">
      <header className="chat-header">
        <h1>🤖 Hermes Wiki Chat</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="header-btn" onClick={() => loadIndex()} title="Índice">📚</button>
          <button className="header-btn" onClick={() => { setShowIntegrate(true); loadFolders(); }} title="Integración">🔗</button>
          <span className="status">● Conectado</span>
        </div>
      </header>

      {selectedFolder && (
        <div className="folder-banner">
          <span>📂 <strong>Cuaderno:</strong> {selectedFolder}</span>
          <button className="folder-change" onClick={openFolderSelect}>🔄 Cambiar</button>
          <button className="folder-clear" onClick={clearFolder}>✕ Modo global</button>
        </div>
      )}

      {showFolderSelect && (
        <div className="folder-select-overlay" onClick={() => setShowFolderSelect(false)}>
          <div className="folder-select-modal" onClick={(e) => e.stopPropagation()}>
            <div className="folder-select-header">
              <h3>📂 Seleccionar Cuaderno</h3>
              <button onClick={() => setShowFolderSelect(false)}>✕</button>
            </div>
            <div className="folder-select-body">
              {folderList.length === 0 ? (
                <p className="folder-empty">No hay cuadernos. Creá uno primero.</p>
              ) : (
                <div className="folder-grid">
                  {folderList.map(f => (
                    <button key={f.name} className="folder-option" onClick={() => selectFolder(f)}>
                      📁 {f.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="folder-select-footer">
              <button className="toolbar-btn cancel" onClick={() => { setShowFolderSelect(false); clearFolder(); }}>
                🌐 Usar todos los documentos
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`msg msg-${msg.role}`}>
            <div className="msg-content" dangerouslySetInnerHTML={{ __html: msg.content }} />
            {msg.sources && msg.sources.length > 0 && (
              <div className="msg-sources">
                📄 Fuentes: {msg.sources.map((s, i) => (
                  <span key={i} className="source-link">{s.title}</span>
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
              onClick={() => s.action === 'folder' ? openFolderSelect() : sendMessage(s.q)}
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
              <h2>📂 {currentPath ? currentPath : 'Raíz'}</h2>
              <button className="index-close" onClick={() => setShowIndex(false)}>✕</button>
            </div>
            <div className="index-toolbar">
              {currentPath && <button className="toolbar-btn" onClick={goUp}>⬆️ Volver</button>}
              <button className="toolbar-btn" onClick={() => openCreateFile(currentPath)}>+ Archivo</button>
              <button className="toolbar-btn" onClick={() => openCreateFolder(currentPath)}>+ Carpeta</button>
              <label className="toolbar-btn upload-btn">
                {uploading ? '⏳ Subiendo...' : '📤 Subir PDF'}
                <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
            <div className="index-body">
              {indexLoading ? (
                <div className="index-loading">Cargando...</div>
              ) : wikiItems.length === 0 ? (
                <div className="index-empty">Vacío. Subí un PDF o creá archivos.</div>
              ) : (
                <ul className="index-list">
                  {wikiItems.map((item) => (
                    <li
                      key={item.name}
                      className={`index-item ${move.dragOver === item.name ? 'drag-over' : ''} ${move.dragging === item.name ? 'dragging' : ''}`}
                      draggable={item.type === 'file'}
                      onDragStart={(e) => handleDragStart(e, item.name)}
                      onDragOver={(e) => isFolder(item) && handleDragOver(e, item.name)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => isFolder(item) && handleDrop(e, item.name)}
                    >
                      <span className="index-icon" onClick={() => isFolder(item) && openFolder(item.name)} style={{ cursor: isFolder(item) ? 'pointer' : 'default' }}>
                        {isFolder(item) ? '📁' : '📄'}
                      </span>
                      <span className="index-title" onClick={() => !isFolder(item) && openEditFile(item)} style={{ cursor: isFolder(item) ? 'default' : 'pointer' }}>
                        {item.title}
                      </span>
                      <button className="item-delete" onClick={() => setDeleteConfirm(item.name)} title="Eliminar">🗑️</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="index-footer">
              <small style={{ color: '#666' }}>📁 Arrastrá archivos a carpetas · 📤 PDF se sube directo</small>
            </div>
          </div>
        </div>
      )}

      {showIntegrate && (
        <div className="index-overlay" onClick={() => setShowIntegrate(false)}>
          <div className="index-modal integrate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="index-header">
              <h2>🔗 Integración por Cuaderno</h2>
              <button className="index-close" onClick={() => setShowIntegrate(false)}>✕</button>
            </div>
            <div className="index-body">
              {folderList.length === 0 ? (
                <div className="index-empty">No hay cuadernos creados.</div>
              ) : (
                <div className="integrate-list">
                  {folderList.map(folder => (
                    <div key={folder.name} className="integrate-item">
                      <h3>📁 {folder.title}</h3>
                      <div className="integrate-endpoints">
                        <div className="integrate-row">
                          <span className="integrate-label">Índice:</span>
                          <code>{`http://85.31.230.163:3001/api/public/index?path=${folder.slug}`}</code>
                        </div>
                        <div className="integrate-row">
                          <span className="integrate-label">Preguntar:</span>
                          <code>{`POST http://85.31.230.163:3001/api/public/ask`}</code>
                        </div>
                        <div className="integrate-row">
                          <span className="integrate-label">Body ask:</span>
                          <code>{`{"question":"...","folder":"${folder.slug}"}`}</code>
                        </div>
                        <div className="integrate-row">
                          <span className="integrate-label">Archivo:</span>
                          <code>{`http://85.31.230.163:3001/api/public/file?path=${folder.slug}/archivo.md`}</code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editor.open && (
        <div className="index-overlay" onClick={() => setEditor({ ...editor, open: false })}>
          <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="editor-header">
              <h2>{editor.mode === 'create' ? (editor.type === 'folder' ? '📁 Nueva Carpeta' : '📄 Nuevo Archivo') : '✏️ Editar'}</h2>
              <button className="index-close" onClick={() => setEditor({ ...editor, open: false })}>✕</button>
            </div>
            <div className="editor-body">
              {editor.type === 'folder' ? (
                <input
                  className="editor-input"
                  placeholder="nombre-de-la-carpeta"
                  value={editor.path.split('/').pop() || ''}
                  onChange={(e) => setEditor({ ...editor, path: (currentPath ? currentPath + '/' : '') + e.target.value })}
                  autoFocus
                />
              ) : (
                <>
                  <input
                    className="editor-input"
                    placeholder="nombre-del-archivo (sin .md)"
                    value={editor.path.split('/').pop()?.replace('.md', '') || ''}
                    onChange={(e) => setEditor({ ...editor, path: (currentPath ? currentPath + '/' : '') + e.target.value + '.md' })}
                    autoFocus
                  />
                  <textarea
                    className="editor-textarea"
                    value={editor.content}
                    onChange={(e) => setEditor({ ...editor, content: e.target.value })}
                    placeholder="# Título&#10;&#10;Contenido..."
                  />
                </>
              )}
            </div>
            <div className="editor-footer">
              <button className="toolbar-btn cancel" onClick={() => setEditor({ ...editor, open: false })}>Cancelar</button>
              <button className="toolbar-btn save" onClick={saveEditor} disabled={saving || !editor.path.split('/').pop()}>
                {saving ? 'Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="index-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Confirmar eliminación</h3>
            <p>¿Eliminar <strong>{deleteConfirm}</strong>?</p>
            <div className="confirm-btns">
              <button className="toolbar-btn cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="toolbar-btn delete" onClick={confirmDelete}>🗑️ Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-bar">
          ⚠️ {error}
          <button className="error-close" onClick={() => setError('')}>✕</button>
        </div>
      )}

      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={selectedFolder ? `Preguntá sobre ${selectedFolder}...` : 'Escribí tu pregunta...'}
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
        .header-btn {
          background: #0f3460;
          border: none;
          border-radius: 6px;
          width: 32px;
          height: 32px;
          color: #e0e0e0;
          cursor: pointer;
          font-size: 14px;
        }
        .header-btn:hover { background: #e94560; }
        .status {
          font-size: 12px;
          color: #4ade80;
          margin-left: 8px;
        }
        .folder-banner {
          background: #0f3460;
          padding: 8px 20px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .folder-banner strong { color: #e94560; }
        .folder-change {
          background: rgba(233, 69, 96, 0.2);
          border: 1px solid #e94560;
          border-radius: 6px;
          padding: 3px 10px;
          font-size: 11px;
          color: #e94560;
          cursor: pointer;
        }
        .folder-change:hover { background: #e94560; color: #fff; }
        .folder-clear {
          background: none;
          border: 1px solid #555;
          border-radius: 6px;
          padding: 3px 10px;
          font-size: 11px;
          color: #888;
          cursor: pointer;
          margin-left: auto;
        }
        .folder-clear:hover { border-color: #e94560; color: #e94560; }
        .folder-select-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }
        .folder-select-modal {
          background: #16213e;
          border: 1px solid #e94560;
          border-radius: 12px;
          width: 90%;
          max-width: 420px;
          display: flex;
          flex-direction: column;
        }
        .folder-select-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #0f3460;
        }
        .folder-select-header h3 { margin: 0; font-size: 15px; color: #e94560; }
        .folder-select-header button {
          background: none;
          border: none;
          color: #888;
          font-size: 18px;
          cursor: pointer;
        }
        .folder-select-body {
          padding: 16px 20px;
        }
        .folder-empty {
          text-align: center;
          color: #888;
          padding: 10px;
        }
        .folder-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .folder-option {
          background: #1a1a2e;
          border: 1px solid #0f3460;
          border-radius: 8px;
          padding: 12px 16px;
          text-align: left;
          font-size: 14px;
          color: #e0e0e0;
          cursor: pointer;
        }
        .folder-option:hover {
          border-color: #e94560;
          color: #e94560;
        }
        .folder-select-footer {
          padding: 12px 20px;
          border-top: 1px solid #0f3460;
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
        .msg-content :global(strong) { color: #e94560; }
        .msg-content :global(a) { color: #e94560; }
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
          align-items: center;
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
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .error-close {
          background: none;
          border: none;
          color: #e74c3c;
          cursor: pointer;
          font-size: 14px;
          padding: 0 4px;
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
        .input-area input:focus { border-color: #e94560; }
        .input-area input:disabled { opacity: 0.5; }
        .input-area button {
          background: #e94560;
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          color: #fff;
          font-size: 16px;
          cursor: pointer;
        }
        .input-area button:disabled { background: #555; cursor: not-allowed; }
        .input-area button:not(:disabled):hover { background: #c73e54; }
        .typing { color: #e94560; font-style: italic; }
        .index-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
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
        .integrate-modal {
          max-width: 650px;
        }
        .index-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #0f3460;
        }
        .index-header h2 { font-size: 16px; color: #e94560; margin: 0; }
        .index-close {
          background: none;
          border: none;
          color: #888;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .index-close:hover { background: #0f3460; color: #fff; }
        .index-toolbar {
          display: flex;
          gap: 8px;
          padding: 12px 20px;
          border-bottom: 1px solid #0f3460;
          flex-wrap: wrap;
        }
        .toolbar-btn {
          background: #0f3460;
          border: 1px solid #e94560;
          border-radius: 8px;
          padding: 6px 14px;
          font-size: 12px;
          color: #e94560;
          cursor: pointer;
        }
        .toolbar-btn:hover { background: #e94560; color: #fff; }
        .upload-btn {
          background: #27ae60;
          border-color: #27ae60;
          color: #fff;
          display: inline-flex;
          align-items: center;
        }
        .upload-btn:hover { background: #219a52; }
        .toolbar-btn.save { background: #e94560; color: #fff; border-color: #e94560; }
        .toolbar-btn.save:hover { background: #c73e54; }
        .toolbar-btn.save:disabled { background: #555; border-color: #555; cursor: not-allowed; }
        .toolbar-btn.cancel { border-color: #555; color: #888; }
        .toolbar-btn.cancel:hover { background: #555; color: #fff; }
        .toolbar-btn.delete { background: #c0392b; border-color: #c0392b; color: #fff; }
        .toolbar-btn.delete:hover { background: #a93226; }
        .index-body {
          padding: 16px 20px;
          overflow-y: auto;
          flex: 1;
        }
        .index-loading, .index-empty {
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
          transition: all 0.15s;
        }
        .index-item.drag-over {
          border-color: #e94560;
          background: rgba(233, 69, 96, 0.15);
        }
        .index-item.dragging {
          opacity: 0.5;
        }
        .index-icon { font-size: 16px; }
        .index-title {
          flex: 1;
          font-size: 13px;
          color: #e0e0e0;
        }
        .index-title:hover { color: #e94560; }
        .item-delete {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          opacity: 0.5;
          padding: 4px;
        }
        .item-delete:hover { opacity: 1; }
        .index-footer {
          padding: 10px 20px;
          border-top: 1px solid #0f3460;
          text-align: center;
        }
        .integrate-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .integrate-item {
          background: #1a1a2e;
          border: 1px solid #0f3460;
          border-radius: 8px;
          padding: 14px;
        }
        .integrate-item h3 {
          margin: 0 0 10px;
          font-size: 14px;
          color: #e94560;
        }
        .integrate-endpoints {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .integrate-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
        }
        .integrate-label {
          color: #888;
          min-width: 70px;
        }
        .integrate-row code {
          background: #0a0a1a;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 10px;
          color: #4ade80;
          word-break: break-all;
        }
        .editor-modal {
          background: #16213e;
          border: 1px solid #0f3460;
          border-radius: 12px;
          width: 90%;
          max-width: 600px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
        }
        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #0f3460;
        }
        .editor-header h2 { font-size: 16px; color: #e94560; margin: 0; }
        .editor-body {
          padding: 16px 20px;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .editor-input {
          background: #1a1a2e;
          border: 1px solid #0f3460;
          border-radius: 8px;
          padding: 10px 14px;
          color: #fff;
          font-size: 14px;
          outline: none;
          width: 100%;
        }
        .editor-input:focus { border-color: #e94560; }
        .editor-textarea {
          background: #1a1a2e;
          border: 1px solid #0f3460;
          border-radius: 8px;
          padding: 10px 14px;
          color: #fff;
          font-size: 13px;
          font-family: 'Courier New', monospace;
          outline: none;
          width: 100%;
          min-height: 300px;
          resize: vertical;
          line-height: 1.5;
        }
        .editor-textarea:focus { border-color: #e94560; }
        .editor-footer {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          padding: 12px 20px;
          border-top: 1px solid #0f3460;
        }
        .confirm-modal {
          background: #16213e;
          border: 1px solid #c0392b;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          max-width: 360px;
        }
        .confirm-modal h3 { color: #e74c3c; margin: 0 0 12px; }
        .confirm-modal p { color: #e0e0e0; margin: 0 0 20px; }
        .confirm-btns { display: flex; gap: 10px; justify-content: center; }
      `}</style>
    </main>
  );
}
