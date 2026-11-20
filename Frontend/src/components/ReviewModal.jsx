import { useState } from 'react'
import { api } from '../api/client'
import { ErrorBox, Modal } from './ui'
import { SEVERITY } from '../lib/format'

const COPY = {
  modificado: { title: 'Modificar hallazgo', button: 'Guardar modificación', commentRequired: false },
  rechazado: { title: 'Rechazar hallazgo', button: 'Rechazar', commentRequired: true },
  segunda_revision: { title: 'Enviar a segunda revisión', button: 'Enviar', commentRequired: true },
}

/** Decisiones que piden datos: modificar (con cambios), rechazar y segunda revisión (con comentario). */
export default function ReviewModal({ finding, decision, onClose, onDone }) {
  const copy = COPY[decision]
  const [severity, setSeverity] = useState(finding.severity)
  const [explanation, setExplanation] = useState(finding.explanation)
  const [mitigation, setMitigation] = useState(finding.mitigation ?? '')
  const [comment, setComment] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Solo se envía lo que cambió respecto del hallazgo actual.
    const changes = {}
    if (decision === 'modificado') {
      if (severity !== finding.severity) changes.severity = severity
      if (explanation.trim() !== finding.explanation) changes.explanation = explanation.trim()
      if (mitigation.trim() && mitigation.trim() !== (finding.mitigation ?? '')) changes.mitigation = mitigation.trim()
    }
    try {
      await api(`/findings/${finding.id}/review`, {
        method: 'POST',
        json: { decision, ...(comment.trim() && { comment: comment.trim() }), ...(decision === 'modificado' && { changes }) },
      })
      onDone()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title={copy.title} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {decision === 'modificado' && (
          <>
            <div className="field">
              <label htmlFor="r-sev">Gravedad</label>
              <select id="r-sev" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="r-exp">Explicación</label><textarea id="r-exp" rows={4} required value={explanation} onChange={(e) => setExplanation(e.target.value)} /></div>
            <div className="field"><label htmlFor="r-mit">Mitigación</label><textarea id="r-mit" rows={4} value={mitigation} onChange={(e) => setMitigation(e.target.value)} /></div>
          </>
        )}
        <div className="field">
          <label htmlFor="r-com">Comentario{copy.commentRequired ? ' (obligatorio)' : ' (opcional)'}</label>
          <textarea id="r-com" rows={3} required={copy.commentRequired} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
        </div>
        <ErrorBox error={error} />
        <div className="btn-row">
          <button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : copy.button}</button>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
