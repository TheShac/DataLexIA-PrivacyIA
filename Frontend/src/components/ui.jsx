import { ANALYSIS_STATUS, SEVERITY } from '../lib/format'

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Cargando" />
}

export function Loading({ text = 'Cargando…' }) {
  return (
    <div className="center">
      <Spinner /> {text}
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="alert error" role="alert">
      {error.message ?? String(error)}
      {onRetry && (
        <>
          {' '}
          <button className="btn sm" onClick={onRetry}>
            Reintentar
          </button>
        </>
      )}
    </div>
  )
}

export function PageHead({ eyebrow, title, children, actions }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions}
    </div>
  )
}

export function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

export function Card({ title, aside, children }) {
  return (
    <section className="card">
      {title && (
        <div className="card-title">
          <span>{title}</span>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

export function Badge({ bg, fg, children }) {
  return (
    <span className="badge" style={{ background: bg, color: fg }}>
      {children}
    </span>
  )
}

export const SeverityBadge = ({ severity }) => {
  const s = SEVERITY[severity] ?? { label: severity, bg: '#e2e8f0', fg: '#334155' }
  return <Badge bg={s.bg} fg={s.fg}>{s.label}</Badge>
}

export const StatusBadge = ({ status }) => {
  const s = ANALYSIS_STATUS[status] ?? { label: status, bg: '#e2e8f0', fg: '#334155' }
  return <Badge bg={s.bg} fg={s.fg}>{s.label}</Badge>
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
