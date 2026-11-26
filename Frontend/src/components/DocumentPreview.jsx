import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { SEVERITY } from '../lib/format'
import { indexText, locate } from '../lib/locate'
import { renderDocument } from '../lib/renderDocument'
import { Card, Loading } from './ui'

const canHighlight = typeof window !== 'undefined' && Boolean(window.Highlight && window.CSS?.highlights)
// Las omisiones no están en ninguna parte del texto: no se pueden marcar.
const isWholeDocument = (f) => f.location === 'Todo el documento'

/**
 * Vista previa del archivo analizado con los hallazgos marcados según su gravedad.
 * Si no hay archivo que mostrar, se usa `fallback`. Montar con `key` por análisis.
 */
export default function DocumentPreview({ analysisId, filename, findings, selected, onSelect, fallback }) {
  const [view, setView] = useState({ root: null, error: null })
  const [zoom, setZoom] = useState(1)
  const boxRef = useRef(null)
  const sheetsRef = useRef(null)
  const scrolledRef = useRef(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const root = document.createElement('div')
    sheetsRef.current.append(root)
    const load = async () => {
      try {
        const blob = await api(`/analyses/${analysisId}/file`, { blob: true, signal: ctrl.signal })
        if (ctrl.signal.aborted) return
        await renderDocument(blob, filename, root, ctrl.signal)
        if (!ctrl.signal.aborted) setView({ root, error: null })
      } catch (error) {
        if (!ctrl.signal.aborted) setView({ root: null, error })
      }
    }
    load()
    return () => {
      ctrl.abort()
      root.remove()
    }
  }, [analysisId, filename])

  // Dónde quedó cada hallazgo en el documento dibujado.
  const found = useMemo(() => {
    const map = new Map()
    if (!view.root) return map
    const index = indexText(view.root)
    const pages = view.root.querySelectorAll('.pdf-page')
    for (const f of findings) {
      if (isWholeDocument(f) || f.status === 'rechazado') continue
      const ranges = locate(index, f, pages[f.page - 1])
      if (ranges.length) map.set(f.id, ranges)
    }
    return map
  }, [view.root, findings])

  useEffect(() => {
    if (!canHighlight) return
    const groups = { alto: [], medio: [], leve: [], activo: [] }
    for (const f of findings) {
      const ranges = found.get(f.id)
      if (ranges) groups[f.id === selected ? 'activo' : f.severity].push(...ranges)
    }
    for (const [name, ranges] of Object.entries(groups)) {
      const highlight = new window.Highlight(...ranges)
      if (name === 'activo') highlight.priority = 1
      window.CSS.highlights.set(`hallazgo-${name}`, highlight)
    }
    return () => Object.keys(groups).forEach((name) => window.CSS.highlights.delete(`hallazgo-${name}`))
  }, [found, findings, selected])

  // Al elegir un hallazgo, el documento se desplaza hasta su marca (una vez por elección, no en cada refresco).
  useEffect(() => {
    const range = found.get(selected)?.[0]
    if (!range || scrolledRef.current === selected) return
    scrolledRef.current = selected
    const box = boxRef.current
    const top = box.scrollTop + range.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 3
    box.scrollTo({ top, behavior: 'smooth' })
  }, [found, selected])

  function onClick(e) {
    for (const [id, ranges] of found) {
      const hit = ranges.some((range) =>
        [...range.getClientRects()].some((r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom),
      )
      if (hit) return onSelect(id)
    }
  }

  const numbered = findings.map((f, i) => ({ ...f, n: i + 1 }))
  const whole = numbered.filter((f) => isWholeDocument(f) && f.status !== 'rechazado')
  const missed = view.root ? numbered.filter((f) => !isWholeDocument(f) && f.status !== 'rechazado' && !found.has(f.id)) : []
  const chips = (list) =>
    list.map((f) => (
      <button
        key={f.id}
        type="button"
        className={`finding-chip ${selected === f.id ? 'sel' : ''}`}
        style={{ background: SEVERITY[f.severity].bg, color: SEVERITY[f.severity].fg }}
        onClick={() => onSelect(f.id)}
        aria-label={`Ver hallazgo ${f.n}, gravedad ${SEVERITY[f.severity].label}`}
      >
        {f.n}
      </button>
    ))

  if (view.error) {
    return (
      <div className="stack">
        <div className="alert info small">Sin vista previa: {view.error.message}</div>
        {fallback}
      </div>
    )
  }

  return (
    <div className="preview">
      <Card
        title="Documento"
        aside={
          <div className="preview-zoom" role="group" aria-label="Tamaño del documento">
            <button type="button" className="btn sm" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} disabled={zoom <= 1} aria-label="Reducir">−</button>
            <span className="small">{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn sm" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} disabled={zoom >= 2.5} aria-label="Ampliar">+</button>
          </div>
        }
      >
        <div className="preview-legend">
          {Object.entries(SEVERITY).map(([k, v]) => (
            <span key={k} className="badge" style={{ background: v.bg, color: v.fg }}>{findings.filter((f) => f.severity === k).length} · {v.label}</span>
          ))}
        </div>
        {whole.length > 0 && <div className="preview-note">Aplican a todo el documento (algo que falta): {chips(whole)}</div>}
        {missed.length > 0 && <div className="preview-note">No se pudieron ubicar en el texto: {chips(missed)}</div>}
        {!canHighlight && <div className="alert info small">Este navegador no permite marcar el texto. Actualízalo para ver los hallazgos resaltados.</div>}
        <div className="preview-box" ref={boxRef} onClick={onClick}>
          {!view.root && <Loading text="Abriendo el documento…" />}
          {/* 100% = ajustado al ancho de la columna. Las marcas siguen al texto al ampliar. */}
          <div ref={sheetsRef} style={{ zoom }} />
        </div>
      </Card>
    </div>
  )
}
