// Gravedad del backend (alto/medio/leve) -> etiqueta y colores del mockup.
export const SEVERITY = {
  alto: { label: 'Alta', bg: '#fee2e2', fg: '#7f1d1d' },
  medio: { label: 'Media', bg: '#ffedd5', fg: '#7c2d12' },
  leve: { label: 'Leve', bg: '#fef9c3', fg: '#713f12' },
}

export const ANALYSIS_STATUS = {
  pendiente: { label: 'En cola', bg: '#e2e8f0', fg: '#334155' },
  en_proceso: { label: 'Analizando', bg: '#dbeafe', fg: '#1e3a8a' },
  completado: { label: 'Completado', bg: '#dcfce7', fg: '#14532d' },
  error: { label: 'Error', bg: '#fee2e2', fg: '#7f1d1d' },
}

export const FINDING_STATUS = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  modificado: 'Modificado',
  rechazado: 'Rechazado',
  segunda_revision: 'Segunda revisión',
}

export const ROLE_LABEL = {
  admin: 'Administrador',
  analista: 'Analista',
  gestor: 'Gestor documental',
  revisor: 'Revisor',
  auditor: 'Auditor',
  direccion: 'Dirección',
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

export function fmtBytes(b) {
  return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
}

export function fmtDate(value, withTime = false) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CL', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' })
}
