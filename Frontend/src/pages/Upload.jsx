import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Card, PageHead, StatusBadge } from '../components/ui'
import { fmtBytes } from '../lib/format'
import { useFetch } from '../lib/useFetch'

const EXT_COLOR = { PDF: '#dc2626', DOC: '#2563eb', DOCX: '#2563eb', XLS: '#15803d', XLSX: '#15803d', TXT: '#475569' }
const ACCEPT = '.pdf,.doc,.docx,.txt'
const ext = (name) => (name.split('.').pop() || '').toUpperCase().slice(0, 4)
const isFinal = (a) => a?.analysis?.status === 'completado' || a?.analysis?.status === 'error'

/** Una fila ya enviada: consulta el estado del análisis hasta que termina. */
function SentRow({ item, onRemove }) {
  const { data } = useFetch((signal) => api(`/analyses/${item.analysisId}`, { signal }), [item.analysisId], { intervalMs: 5000, stopWhen: isFinal })
  const status = data?.analysis?.status ?? 'pendiente'
  return (
    <Row item={item} onRemove={onRemove} removable={isFinal(data)}>
      <StatusBadge status={status} />
      {status === 'completado' && <Link className="btn sm" to={`/analisis/${item.analysisId}`}>Ver resultado</Link>}
      {status === 'error' && <span className="small" style={{ color: 'var(--red)' }}>{data.analysis.errorMessage}</span>}
    </Row>
  )
}

function Row({ item, onRemove, removable = true, children }) {
  return (
    <div className="file-row">
      <div className="file-ext" style={{ background: EXT_COLOR[ext(item.file.name)] ?? '#475569' }}>{ext(item.file.name)}</div>
      <div className="file-info">
        <b title={item.file.name}>{item.file.name}</b>
        <span className="muted small">{fmtBytes(item.file.size)}</span>
      </div>
      {children}
      {removable && (
        <button className="icon-btn" onClick={() => onRemove(item.key)} aria-label="Quitar archivo">✕</button>
      )}
    </div>
  )
}

export default function Upload() {
  const [items, setItems] = useState([])
  const [over, setOver] = useState(false)
  const [sending, setSending] = useState(false)
  const nextKey = useRef(1)
  const pending = items.filter((i) => !i.analysisId)

  const add = (list) => {
    const files = Array.from(list ?? []).map((file) => ({ key: nextKey.current++, file, error: null, analysisId: null }))
    setItems((prev) => [...prev, ...files])
    setOver(false)
  }
  const remove = (key) => setItems((prev) => prev.filter((i) => i.key !== key))
  const patch = (key, p) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)))

  async function start() {
    setSending(true)
    for (const item of pending) {
      patch(item.key, { error: null })
      try {
        const form = new FormData()
        form.append('file', item.file)
        const r = await api('/analyses', { method: 'POST', form })
        patch(item.key, { analysisId: r.analysisId })
      } catch (err) {
        patch(item.key, { error: err.message })
      }
    }
    setSending(false)
  }

  return (
    <main className="page">
      <PageHead
        eyebrow="Nuevo análisis"
        title="Subir documentos a revisar"
        actions={<div className="pills"><span className="pill">Modelo local activo</span><span className="pill">Revisión humana obligatoria</span></div>}
      >
        Carga los documentos de la empresa cliente. Privacy IA los analizará contra la Ley N° 21.719 y citará la fuente de cada hallazgo.
      </PageHead>

      <div className="layout-2">
        <div className="stack">
          <label
            className={`dropzone ${over ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files) }}
          >
            <input type="file" multiple accept={ACCEPT} aria-label="Seleccionar archivos para analizar" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
            <div className="title">{over ? 'Suelta los archivos aquí' : 'Arrastra y suelta tus documentos aquí'}</div>
            <div className="muted">o haz clic para buscarlos en tu equipo</div>
            <span className="btn primary">Seleccionar archivos</span>
            <div className="muted small">PDF, DOCX o TXT · hasta 50 MB por archivo</div>
          </label>

          <Card title="Archivos en cola" aside={<span>{items.length} {items.length === 1 ? 'archivo' : 'archivos'}</span>}>
            <div className="stack">
              {items.length === 0 && <div className="empty">Aún no hay archivos. Arrastra documentos a la zona superior.</div>}
              {items.map((item) =>
                item.analysisId ? (
                  <SentRow key={item.key} item={item} onRemove={remove} />
                ) : (
                  <Row key={item.key} item={item} onRemove={remove} removable={!sending}>
                    {item.error ? <span className="small" style={{ color: 'var(--red)' }}>{item.error}</span> : <span className="pill">Listo para analizar</span>}
                  </Row>
                ),
              )}
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Configuración del análisis">
            <div className="kv"><span>Normativa de referencia</span><b>Ley N° 21.719</b></div>
            <div className="kv"><span>Riesgos y brechas</span><b>Siempre</b></div>
            <div className="kv"><span>Mitigaciones</span><b>Desde el análisis</b></div>
            <div className="kv"><span>Borrador de DPIA</span><b>Desde Reportes</b></div>
            <button className="btn primary" style={{ width: '100%', marginTop: 16 }} disabled={sending || pending.length === 0} onClick={start}>
              {sending ? 'Enviando…' : `Iniciar análisis${pending.length ? ` (${pending.length})` : ''}`}
            </button>
            <p className="muted small" style={{ marginTop: 10 }}>Los análisis se procesan de a uno y pueden tardar varios minutos.</p>
          </Card>
          <Card title="Cómo funciona">
            <p className="small"><b>1.</b> Subes los documentos.<br /><b>2.</b> La IA detecta riesgos y brechas citando la ley.<br /><b>3.</b> Un revisor humano valida cada hallazgo.</p>
          </Card>
        </div>
      </div>
    </main>
  )
}
