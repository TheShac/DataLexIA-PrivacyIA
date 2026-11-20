import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { Badge, Card, ErrorBox, Loading, PageHead, SeverityBadge, Stat } from '../components/ui'
import { fmtDate } from '../lib/format'
import { useFetch } from '../lib/useFetch'

function Report({ id }) {
  const [dlError, setDlError] = useState(null)
  const detail = useFetch((signal) => api(`/analyses/${id}`, { signal }), [id])
  const dpia = useFetch((signal) => api(`/analyses/${id}/dpia`, { signal }), [id])

  async function download() {
    setDlError(null)
    try {
      const blob = await api(`/analyses/${id}/dpia?format=md`, { blob: true })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dpia-analisis-${id}.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setDlError(err)
    }
  }

  if (detail.loading && !detail.data) return <Loading />
  if (detail.error) return <ErrorBox error={detail.error} onRetry={detail.reload} />
  const { analysis: a, document: doc, findings } = detail.data
  const live = findings.filter((f) => f.status !== 'rechazado')

  return (
    <>
      <div className="stats">
        <Stat label="Hallazgos" value={live.length} />
        <Stat label="Altos" value={a.countHigh ?? 0} />
        <Stat label="Medios" value={a.countMedium ?? 0} />
        <Stat label="Con medida propuesta" value={`${live.filter((f) => f.mitigation).length} / ${live.length}`} />
      </div>
      <div className="layout-2 even">
        <Card title="Vista previa del reporte">
          <div className="stack">
            <div>
              <b style={{ fontSize: 18 }}>Reporte resumen de cumplimiento</b>
              <div className="muted small">{doc.filename} · Ley N° 21.719 · {fmtDate(a.finishedAt)}</div>
            </div>
            <Badge bg="#fef9c3" fg="#713f12">Borrador</Badge>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Prio.</th><th>Hallazgo</th><th>Gravedad</th><th>Artículos</th></tr></thead>
                <tbody>
                  {live.map((f) => (
                    <tr key={f.id}>
                      <td>{f.priority ?? '—'}</td>
                      <td>{f.location}<div className="muted small">{f.explanation.slice(0, 140)}{f.explanation.length > 140 ? '…' : ''}</div></td>
                      <td><SeverityBadge severity={f.severity} /></td>
                      <td className="small">{(f.articles ?? []).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {live.length === 0 && <div className="empty">Sin incumplimientos.</div>}
            </div>
            <div className="box grey"><b>Nota:</b> el análisis es un apoyo y no reemplaza la revisión humana.</div>
          </div>
        </Card>

        <Card title="Borrador de DPIA" aside={<Badge bg="#fef9c3" fg="#713f12">Borrador</Badge>}>
          {dpia.loading && !dpia.data && <Loading />}
          <ErrorBox error={dpia.error} onRetry={dpia.reload} />
          {dpia.data && (
            <div className="stack">
              <div className="md"><Markdown remarkPlugins={[remarkGfm]}>{dpia.data.markdown}</Markdown></div>
              <ErrorBox error={dlError} />
              <div className="btn-row no-print">
                <button className="btn primary" onClick={download}>Descargar DPIA (.md)</button>
                <button className="btn" onClick={() => window.print()}>Imprimir / guardar PDF</button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

export default function Reports() {
  const [params, setParams] = useSearchParams()
  const list = useFetch((signal) => api('/analyses?status=completado', { signal }))
  const id = params.get('analysis') ?? (list.data?.[0] ? String(list.data[0].id) : null)

  return (
    <main className="page">
      <PageHead eyebrow="Salidas del análisis" title="Reportes">Reporte resumen y borrador de DPIA generados a partir de los hallazgos del análisis.</PageHead>
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Loading /> : list.data?.length === 0 ? (
        <div className="card empty">Aún no hay análisis completados.</div>
      ) : (
        <>
          <div className="card no-print" style={{ maxWidth: 520 }}>
            <div className="field">
              <label htmlFor="analysis">Análisis</label>
              <select id="analysis" value={id ?? ''} onChange={(e) => setParams({ analysis: e.target.value })}>
                {list.data?.map((r) => (
                  <option key={r.id} value={r.id}>#{r.id} · {r.documentTitle} · {fmtDate(r.createdAt)}</option>
                ))}
              </select>
            </div>
          </div>
          {id && <Report key={id} id={id} />}
        </>
      )}
    </main>
  )
}
