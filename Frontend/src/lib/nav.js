// Cada ítem se muestra solo si el usuario tiene alguno de los permisos indicados.
export const NAV = [
  { to: '/', label: 'Documentos', perms: ['analyses.run'], end: true },
  { to: '/analisis', label: 'Análisis', perms: ['analyses.read'] },
  { to: '/historial', label: 'Historial', perms: ['analyses.read'] },
  { to: '/reportes', label: 'Reportes', perms: ['analyses.read'] },
  { to: '/admin', label: 'Administración', perms: ['users.manage', 'documents.manage', 'documents.upload'] },
]
