import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/context'
import FeedbackWidget from '../components/FeedbackWidget'
import ReviewModal from '../components/ReviewModal'
import { ErrorBox, Loading, SeverityBadge, StatusBadge, Card } from '../components/ui'
import { FINDING_STATUS, SEVERITY, fmtDate } from '../lib/format'
import { useFetch } from '../lib/useFetch'

/** /analisis sin id: abre el análisis más reciente. */
export function AnalysisIndex() {
  const { data, loading, error } = useFetch((signal) => api('/analyses', { signal }))
  if (loading) return <Loading />
  if (error) return <main className="page"><ErrorBox error={error} /></main>
  if (data?.length) return <Navigate to={`/analisis/${data[0].id}`} replace />
  return (
    <main className="page">
      <div className="card empty">Todavía no hay análisis. <Link to="/" style={{ color: 'var(--blue)', fontWeight: 700 }}>Sube un documento</Link> para empezar.</div>
    </main>
  )
}

const inProgress = (d) => d?.analysis?.status === 'pendiente' || d?.analysis?.status === 'en_proceso'
const settled = (d) => !inProgress(d) && !d?.mitigationsPending

const DECISION_LABEL = { aprobado: 'Aprobó', modificado: 'Modificó', rechazado: 'Rechazó', segunda_revision: 'Envió a segunda revisión' }
const FIELD_LABEL = { severity: 'gravedad', explanation: 'explicación', mitigation: 'mitigación' }

function ReviewHistory({ f }) {
  const { data } = useFetch((signal) => api(`/findings/${f.id}/reviews`, { signal }), [f.id, f.updatedAt])
  if (!data?.length) return null
  return (
    <details className="box grey sources">
      <summary>Historial de revisión ({data.length})</summary>
      {data.map((r) => (
        <blockquote key={r.id}>
          <b>{r.reviewer}</b> {DECISION_LABEL[r.decision]} · <span className="muted">{fmtDate(r.createdAt, true)}</span>
          {r.changes && <div className="small">Cambió: {Object.keys(r.changes).map((k) => FIELD_LABEL[k] ?? k).join(', ')}</div>}
          {r.comment && <div className="small">«{r.comment}»</div>}
        </blockquote>
      ))}
    </details>
  )
}

function Finding({ f, index, selected, onSelect, onChanged }) {
  const { can } = useAuth()
  const [modal, setModal] = useState(null) // 'modificado' | 'rechazado' | 'segunda_revision'
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const sources = f.sources ?? []

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      await api(`/findings/${f.id}/review`, { method: 'POST', json: { decision: 'aprobado' } })
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`finding ${selected ? 'sel' : ''} ${f.status === 'rechazado' ? 'rejected' : ''}`} id={`finding-${f.id}`}>
      <button className="finding-head" onClick={onSelect} aria-expanded={selected}>
        <span className="t">{index}. {f.location}</span>
        <span className="btn-row">
          {f.status !== 'pendiente' && <span className="badge" style={{ background: '#e0e7ff', color: '#312e81' }}>{FINDING_STATUS[f.status]}</span>}
          <SeverityBadge severity={f.severity} />
        </span>
      </button>
      {selected && (
        <>
          <div className="small" style={{ color: 'var(--soft)', lineHeight: 1.55 }}>{f.explanation}</div>
          <div className="box blue">
            <b>Fuente:</b> Ley N° 21.719 · {f.articles?.length ? f.articles.join(', ') : 'sin artículo identificado'}
            {sources.length > 0 && (
              <details className="sources" style={{ marginTop: 6 }}>
                <summary>Ver pasajes de la ley ({sources.length})</summary>
                {sources.map((s, i) => (
                  <blockquote key={i}>
                    <b>{s.label ?? s.filename}</b>
                    <div>{s.content}</div>
                  </blockquote>
                ))}
              </details>
            )}
          </div>
          <div className="box grey">
            <b>Mitigación propuesta:</b>
            <pre>{f.mitigation ?? 'Aún no se generó. Usa «Proponer mitigaciones».'}</pre>
          </div>
          <ReviewHistory f={f} />
          {can('findings.review') && (
            <div className="btn-row">
              <button className="btn primary sm" disabled={busy || f.status === 'aprobado'} onClick={approve}>Aprobar</button>
              <button className="btn sm" onClick={() => setModal('modificado')}>Modificar</button>
              <button className="btn sm danger" disabled={f.status === 'rechazado'} onClick={() => setModal('rechazado')}>Rechazar</button>
              <button className="btn sm" onClick={() => setModal('segunda_revision')}>Segunda revisión</button>
            </div>
          )}
          <ErrorBox error={error} />
          {can('feedback.create') && <FeedbackWidget findingId={f.id} />}
        </>
      )}
      {modal && <ReviewModal finding={f} decision={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); onChanged() }} />}
    </div>
  )
}

export default function Analysis() {
  const { id } = useParams()
  const { can } = useAuth()
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const { data, loading, error, reload } = useFetch((signal) => api(`/analyses/${id}`, { signal }), [id], { intervalMs: 5000, stopWhen: settled })

  if (loading && !data) return <Loading />
  if (error && !data) return <main className="page"><ErrorBox error={error} onRetry={reload} /></main>

  const { analysis: a, document: doc, findings } = data
  const sel = selected ?? findings[0]?.id

  async function mitigations() {
    setBusy(true)
    setActionError(null)
    try {
      await api(`/analyses/${id}/mitigations`, { method: 'POST' })
      reload()
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  const choose = (fid) => {
    setSelected(fid)
    document.getElementById(`finding-${fid}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <>
      <div className="analysis-head">
        <div>
          <h1>{doc.filename}</h1>
          <div className="muted small">Análisis N.º {a.id} · {data.requestedBy} · Contra Ley N° 21.719</div>
        </div>
        <div className="btn-row">
          <Link className="btn primary" to="/">Subir</Link>
        </div>
      </div>

      <main className="page">
        {actionError && <ErrorBox error={actionError} />}
        {inProgress(data) && (
          <div className="alert info"><span className="spinner" /> {a.status === 'pendiente' ? 'En cola, esperando su turno…' : 'Analizando el documento. Puede tardar varios minutos; esta página se actualiza sola.'}</div>
        )}
        {a.status === 'error' && <div className="alert error">El análisis falló: {a.errorMessage}</div>}
        {data.mitigationsPending && <div className="alert info"><span className="spinner" /> Generando medidas de mitigación…</div>}

        {a.status === 'completado' && (
          <div className="layout-2 even" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr) 320px' }}>
            <Card title="Partes marcadas" aside={<span className="small">Haz clic para ver el hallazgo</span>}>
              <div className="btn-row" style={{ marginBottom: 12 }}>
                {Object.entries(SEVERITY).map(([k, v]) => (
                  <span key={k} className="badge" style={{ background: v.bg, color: v.fg }}>{findings.filter((f) => f.severity === k).length} · {v.label}</span>
                ))}
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {findings.length === 0 && <div className="empty">No se encontraron incumplimientos.</div>}
                {findings.map((f, i) => (
                  <button key={f.id} className={`mark ${sel === f.id ? "sel" : ""} ${f.status === "rechazado" ? "rejected" : ""}`} style={{ background: SEVERITY[f.severity].bg }} onClick={() => choose(f.id)}>
                    <div className="small muted">{f.location}{f.page ? ` · pág. ${f.page}` : ''}</div>
                    {f.quote || f.fragment || 'Aplica a todo el documento'}
                    <sup>{i + 1}</sup>
                  </button>
                ))}
              </div>
            </Card>

            <div className="stack">
              {findings.map((f, i) => (
                <Finding key={f.id} f={f} index={i + 1} selected={sel === f.id} onSelect={() => setSelected(f.id)} onChanged={reload} />
              ))}
            </div>

            <div className="stack">
              <Card title="Datos extraídos">
                <div className="kv"><span>Resultado</span><b>{a.overall === 'cumple' ? 'Cumple' : 'No cumple'}</b></div>
                <div className="kv"><span>Estado</span><StatusBadge status={a.status} /></div>
                <div className="kv"><span>Hallazgos</span><b>{findings.length}</b></div>
                <div className="kv"><span>Modelos</span><b>{a.config?.models ? Object.keys(a.config.models).join(', ') : '—'}</b></div>
              </Card>
              <div className="stack">
                {can('analyses.run') && (
                  <button className="btn primary" onClick={mitigations} disabled={busy || data.mitigationsPending || findings.length === 0}>
                    Proponer mitigaciones
                  </button>
                )}
                <Link className="btn" to={`/reportes?analysis=${a.id}`}>Ver reporte y DPIA</Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
