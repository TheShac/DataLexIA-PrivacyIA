import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/context'
import FeedbackWidget from './FeedbackWidget'

const SUGGESTIONS = ['¿Qué plazos de conservación exige la ley?', '¿Cómo debe informarse el ejercicio de derechos?']

/** Chat normativo (CU-10/CU-11). Usa POST /api/chat/ask, que guarda la conversación y devuelve las fuentes. */
export default function ChatPanel({ open, onClose }) {
  const { can } = useAuth()
  const [msgs, setMsgs] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs, busy, open])

  // Al abrir el chat el cursor queda listo en el campo de texto.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function reset() {
    setMsgs([])
    setConversationId(null)
    setDraft('')
  }

  async function ask(question) {
    const q = question.trim()
    if (!q || busy) return
    setMsgs((m) => [...m, { me: true, text: q }])
    setDraft('')
    setBusy(true)
    try {
      const r = await api('/chat/ask', { method: 'POST', json: { question: q, ...(conversationId && { conversationId }) } })
      setConversationId(r.conversationId)
      setMsgs((m) => [...m, { id: r.message.id, text: r.message.content, sources: r.message.sources, lowConfidence: r.message.lowConfidence }])
    } catch (err) {
      setMsgs((m) => [...m, { text: `No se pudo responder: ${err.message}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside id="chat-panel" className="chat" aria-label="Chat normativo" hidden={!open} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <header>
        <div>
          <b>Preguntar a la normativa</b>
          <div className="muted small">Responde citando la fuente</div>
        </div>
        <div className="btn-row" style={{ flexWrap: 'nowrap' }}>
          {msgs.length > 0 && <button className="btn sm" onClick={reset} disabled={busy}>Nueva</button>}
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar chat">✕</button>
        </div>
      </header>
      <div className="chat-body">
        {msgs.length === 0 && (
          <div className="stack">
            <div className="eyebrow">Preguntas sugeridas</div>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.me ? 'me' : ''}`}>
            <div>
              {m.text}
              {m.lowConfidence && <div className="alert info small" style={{ marginTop: 8 }}>Sin fuentes que respalden esta respuesta: tómala con cautela.</div>}
              {m.sources?.length > 0 && (
                <details className="box blue sources" style={{ marginTop: 10 }}>
                  <summary>Fuentes ({m.sources.length})</summary>
                  {m.sources.map((s, j) => (
                    <blockquote key={j}>
                      <b>{s.label ?? s.filename}</b>
                      <div className="small">{s.content}</div>
                    </blockquote>
                  ))}
                </details>
              )}
              {m.id && <div className="small muted" style={{ marginTop: 8 }}>Un revisor humano debe validar esta respuesta.</div>}
              {m.id && can('feedback.create') && <div style={{ marginTop: 8 }}><FeedbackWidget messageId={m.id} /></div>}
            </div>
          </div>
        ))}
        {busy && <div className="muted small">Consultando… (el modelo local puede tardar un minuto)</div>}
        <div ref={endRef} />
      </div>
      <footer>
        <input
          ref={inputRef}
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(draft)}
          placeholder="Escribe tu pregunta..."
          aria-label="Escribe tu pregunta"
        />
        <button className="btn primary" onClick={() => ask(draft)} disabled={busy || !draft.trim()}>Enviar</button>
      </footer>
    </aside>
  )
}
