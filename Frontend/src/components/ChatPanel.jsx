import { useEffect, useRef, useState } from 'react'
import { apiStream } from '../api/client'
import { useAuth } from '../auth/context'
import FeedbackWidget from './FeedbackWidget'

const SUGGESTIONS = ['¿Qué plazos de conservación exige la ley?', '¿Cómo debe informarse el ejercicio de derechos?']

const TICK_MS = 30

/**
 * Reparte el texto que llega en trozos pequeños, a un ritmo que se puede seguir leyendo aunque el modelo
 * escriba muy rápido. Mientras más texto haya acumulado, más rápido avanza.
 */
function pacedWriter(write, signal) {
  let buffer = ''
  const take = (n) => {
    if (!buffer) return
    const piece = buffer.slice(0, n)
    buffer = buffer.slice(n)
    write(piece)
  }
  // En una pestaña oculta los temporizadores se frenan: ahí se entrega todo de una vez.
  const timer = setInterval(() => take(document.hidden ? buffer.length : Math.max(2, Math.ceil(buffer.length / 40))), TICK_MS)
  return {
    push: (text) => {
      buffer += text
    },
    flush: () => take(buffer.length),
    drain: () =>
      new Promise((resolve) => {
        const check = () => (buffer && !signal.aborted ? setTimeout(check, TICK_MS) : resolve())
        check()
      }),
    stop: () => clearInterval(timer),
  }
}

/**
 * Chat normativo (CU-10/CU-11). Usa POST /api/chat/ask/stream: la respuesta se muestra a medida que el modelo
 * la escribe; las fuentes y la calificación aparecen cuando termina (y queda guardada).
 */
export default function ChatPanel({ open, onClose }) {
  const { can } = useAuth()
  const [msgs, setMsgs] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef(null)
  const stickRef = useRef(true) // seguir el final mientras llega texto, salvo que el usuario haya subido a leer
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const keyRef = useRef(0)

  useEffect(() => {
    const el = bodyRef.current
    if (open && el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [msgs, open])

  // Si el chat se desmonta (cerrar sesión), se corta la respuesta en curso.
  useEffect(() => () => abortRef.current?.abort(), [])

  const onScroll = (e) => {
    const el = e.currentTarget
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  // Al abrir el chat el cursor queda listo en el campo de texto.
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true })
  }, [open])

  function reset() {
    setMsgs([])
    setConversationId(null)
    setDraft('')
  }

  async function ask(question) {
    const q = question.trim()
    if (!q || busy) return
    const key = (keyRef.current += 2)
    const patch = (change) => setMsgs((m) => m.map((x) => (x.key === key ? { ...x, ...change(x) } : x)))
    stickRef.current = true
    setMsgs((m) => [...m, { key: key - 1, me: true, text: q }, { key, text: '', streaming: true }])
    setDraft('')
    setBusy(true)
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    let sources = []
    let done = null
    const writer = pacedWriter((piece) => patch((x) => ({ text: x.text + piece })), signal)
    try {
      await apiStream('/chat/ask/stream', {
        json: { question: q, ...(conversationId && { conversationId }) },
        signal,
        onEvent: (e) => {
          if (e.type === 'sources') sources = e.sources
          else if (e.type === 'delta') writer.push(e.text)
          else if (e.type === 'error') throw new Error(e.error)
          else if (e.type === 'done') done = e
        },
      })
      if (!done) throw new Error('La respuesta se interrumpió antes de terminar')
      setConversationId(done.conversationId)
      await writer.drain() // las fuentes aparecen cuando el texto ya se escribió entero
      patch(() => ({ id: done.messageId, sources, lowConfidence: done.lowConfidence, streaming: false }))
    } catch (err) {
      writer.flush()
      if (err.name !== 'AbortError') patch(() => ({ error: `No se pudo completar la respuesta: ${err.message}`, streaming: false }))
    } finally {
      writer.stop()
      setBusy(false)
    }
  }

  return (
    // Cerrado no se quita del DOM (así puede animarse la salida); `inert` impide enfocarlo o hacer clic.
    <aside id="chat-panel" className={`chat ${open ? 'open' : ''}`} aria-label="Chat normativo" inert={!open} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
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
      <div className="chat-body" ref={bodyRef} onScroll={onScroll} role="log" aria-busy={busy}>
        {msgs.length === 0 && (
          <div className="stack">
            <div className="eyebrow">Preguntas sugeridas</div>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.key} className={`msg ${m.me ? 'me' : ''}`}>
            <div>
              {m.streaming && !m.text ? (
                <span className="typing" role="status" aria-label="Consultando la normativa"><i /><i /><i /></span>
              ) : (
                <span className={m.streaming ? 'writing' : undefined}>{m.text}</span>
              )}
              {m.error && <div className="alert error small" style={{ marginTop: m.text ? 8 : 0 }}>{m.error}</div>}
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
