import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Card, ErrorBox, Loading, PageHead, Stat, StatusBadge } from '../components/ui'
import { fmtDate } from '../lib/format'
import { useFetch } from '../lib/useFetch'

export default function History() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFetch((signal) => api('/analyses', { signal }), [], {
    intervalMs: 10000,
    stopWhen: (rows) => !rows.some((r) => r.status === 'pendiente' || r.status === 'en_proceso'),
  })

  const rows = data ?? []
  const findings = rows.reduce((n, r) => n + (r.countHigh ?? 0) + (r.countMedium ?? 0) + (r.countLow ?? 0), 0)

  return (
    <main className="page">
      <PageHead eyebrow="Trazabilidad" title="Historial de análisis">Consulta los análisis realizados y abre su resultado.</PageHead>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          <div className="stats">
            <Stat label="Análisis" value={rows.length} />
            <Stat label="Documentos analizados" value={new Set(rows.map((r) => r.documentId)).size} />
            <Stat label="Hallazgos" value={findings} />
            <Stat label="Completados" value={`${rows.filter((r) => r.status === 'completado').length} / ${rows.length}`} />
          </div>
          <div className="layout-2">
            <Card title="Análisis recientes">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Documento</th><th>Fecha</th><th>Solicitó</th><th>Hallazgos</th><th>Estado</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="clickable" onClick={() => navigate(`/analisis/${r.id}`)}>
                        <td><b>{r.documentTitle}</b></td>
                        <td>{fmtDate(r.createdAt, true)}</td>
                        <td>{r.requestedBy}</td>
                        <td>{r.status === 'completado' ? (r.countHigh ?? 0) + (r.countMedium ?? 0) + (r.countLow ?? 0) : '—'}</td>
                        <td><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && <div className="empty">Aún no hay análisis.</div>}
              </div>
            </Card>
            <Card title="Registro de auditoría">
              {/* El backend registra audit_log pero todavía no expone un endpoint de lectura. */}
              <div className="empty">Pendiente: el backend aún no expone el registro de auditoría.</div>
            </Card>
          </div>
        </>
      )}
    </main>
  )
}
