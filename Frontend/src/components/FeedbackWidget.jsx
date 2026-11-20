import { useState } from 'react'
import { api } from '../api/client'
import { useFetch } from '../lib/useFetch'
import { ErrorBox } from './ui'

/**
 * CU-13. Califica (1-5) y opcionalmente corrige o comenta una respuesta de la IA.
 * Se usa con `findingId` (hallazgo) o `messageId` (respuesta del chat).
 */
export default function FeedbackWidget({ findingId, messageId }) {
  const query = findingId ? `findingId=${findingId}` : `messageId=${messageId}`
  const { data: fetched, loading } = useFetch((signal) => api(`/feedback?${query}`, { signal }), [query])
  const [draft, setDraft] = useState(null) // cambios locales aún no guardados
  const [justSaved, setJustSaved] = useState(null) // respuesta del último guardado
  const saved = justSaved ?? fetched
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const cur = {
    rating: draft?.rating ?? saved?.rating ?? null,
    correction: draft?.correction ?? saved?.correction ?? '',
    comment: draft?.comment ?? saved?.comment ?? '',
  }
  const edit = (patch) => {
    setDone(false)
    setDraft((d) => ({ ...(d ?? {}), ...patch }))
  }
  const dirty = draft !== null
  const valid = cur.rating !== null || cur.correction.trim() || cur.comment.trim()

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const result = await api('/feedback', {
        method: 'POST',
        json: {
          ...(findingId ? { findingId } : { messageId }),
          ...(cur.rating !== null && { rating: cur.rating }),
          ...(cur.correction.trim() && { correction: cur.correction.trim() }),
          ...(cur.comment.trim() && { comment: cur.comment.trim() }),
        },
      })
      setJustSaved(result)
      setDraft(null)
      setDone(true)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (loading && saved === null) return null
  return (
    <div className="feedback" aria-label="Calificar respuesta de la IA">
      <div className="btn-row" style={{ alignItems: 'center' }}>
        <span className="small muted">¿Fue útil?</span>
        <span className="stars" role="radiogroup" aria-label="Puntaje de 1 a 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={cur.rating === n} aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} className={cur.rating >= n ? 'on' : ''} onClick={() => edit({ rating: n })}>
              ★
            </button>
          ))}
        </span>
        <button type="button" className="btn sm" onClick={() => setOpen((o) => !o)}>{open ? 'Ocultar' : 'Corregir o comentar'}</button>
        {dirty && <button type="button" className="btn primary sm" disabled={busy || !valid} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>}
        {done && !dirty && <span className="small" style={{ color: '#15803d' }}>Guardado ✓</span>}
      </div>
      {open && (
        <div className="stack" style={{ marginTop: 8, gap: 8 }}>
          <textarea className="input" rows={2} placeholder="¿Qué debió decir la IA? (corrección)" value={cur.correction} onChange={(e) => edit({ correction: e.target.value })} maxLength={5000} />
          <textarea className="input" rows={2} placeholder="Comentario (opcional)" value={cur.comment} onChange={(e) => edit({ comment: e.target.value })} maxLength={2000} />
        </div>
      )}
      <ErrorBox error={error} />
    </div>
  )
}
