import { useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/context'
import { Badge, Card, ErrorBox, Loading, Modal, PageHead } from '../components/ui'
import { ROLE_LABEL, fmtBytes, fmtDate } from '../lib/format'
import { useFetch } from '../lib/useFetch'

/* ---------------------------------------------------------------- Usuarios (CU-02) */

function NewUserModal({ roles, onClose, onCreated }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', roleId: roles[0]?.id ?? '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/users', { method: 'POST', json: { ...form, roleId: Number(form.roleId) } })
      onCreated()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field"><label htmlFor="n-name">Nombre completo</label><input id="n-name" required value={form.fullName} onChange={set('fullName')} /></div>
        <div className="field"><label htmlFor="n-email">Correo</label><input id="n-email" type="email" required value={form.email} onChange={set('email')} /></div>
        <div className="field"><label htmlFor="n-pass">Contraseña (mín. 8 caracteres)</label><input id="n-pass" type="password" minLength={8} required value={form.password} onChange={set('password')} /></div>
        <div className="field">
          <label htmlFor="n-role">Rol</label>
          <select id="n-role" value={form.roleId} onChange={set('roleId')}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <ErrorBox error={error} />
        <div className="btn-row">
          <button className="btn primary" disabled={busy}>Crear usuario</button>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

function Users() {
  const { user: me } = useAuth()
  const users = useFetch((signal) => api('/users', { signal }))
  const roles = useFetch((signal) => api('/users/roles', { signal }))
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  async function patch(id, body) {
    setError(null)
    try {
      await api(`/users/${id}`, { method: 'PATCH', json: body })
      users.reload()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Card title="Usuarios y roles" aside={<button className="btn primary sm" onClick={() => setCreating(true)} disabled={!roles.data}>Nuevo usuario</button>}>
      <ErrorBox error={users.error ?? roles.error} onRetry={users.reload} />
      <ErrorBox error={error} />
      {users.loading && !users.data ? <Loading /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {users.data?.map((u) => {
                const self = u.id === me.id
                return (
                  <tr key={u.id}>
                    <td><b>{u.fullName}</b><div className="muted small">{u.email}</div></td>
                    <td>
                      <select className="input" style={{ minHeight: 36, padding: '6px 10px' }} value={u.roleId} disabled={self || !roles.data} onChange={(e) => patch(u.id, { roleId: Number(e.target.value) })} aria-label={`Rol de ${u.fullName}`}>
                        {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>) ?? <option>{ROLE_LABEL[u.role]}</option>}
                      </select>
                    </td>
                    <td>{u.status === 'activo' ? <Badge bg="#dcfce7" fg="#14532d">Activo</Badge> : <Badge bg="#e2e8f0" fg="#334155">Desactivado</Badge>}</td>
                    <td>
                      <button className="btn sm" disabled={self} onClick={() => patch(u.id, { status: u.status === 'activo' ? 'desactivado' : 'activo' })}>
                        {u.status === 'activo' ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {creating && roles.data && <NewUserModal roles={roles.data} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); users.reload() }} />}
    </Card>
  )
}

/* ---------------------------------------------------------------- Base de conocimiento (CU-03/04) */

const DOC_STATUS = {
  cargado: ['#e2e8f0', '#334155'], procesando: ['#dbeafe', '#1e3a8a'], indexado: ['#dcfce7', '#14532d'], error: ['#fee2e2', '#7f1d1d'], archivado: ['#e2e8f0', '#64748b'],
}

function Knowledge() {
  const { can } = useAuth()
  const docs = useFetch((signal) => api('/documents', { signal }))
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [kind, setKind] = useState('')
  const [notice, setNotice] = useState(null)

  // Los documentos subidos solo para analizar (categoría "analisis") no son fuentes: se ocultan aquí.
  const rows = (docs.data ?? []).filter((d) => d.category !== 'analisis')

  async function run(fn) {
    setError(null)
    try {
      await fn()
      docs.reload()
    } catch (err) {
      setError(err)
    }
  }

  async function upload(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setNotice(null)
    await run(async () => {
      const form = new FormData()
      form.append('file', file)
      if (kind) form.append('category', kind)
      const r = await api('/documents', { method: 'POST', form })
      setNotice(r.warning ?? `Indexado: ${r.rag.chunks} fragmentos.`)
    })
    setUploading(false)
  }

  const manage = can('documents.manage')

  return (
    <Card
      title="Base de conocimiento"
      aside={can('documents.upload') && (
        <div className="btn-row">
          <select className="input" style={{ minHeight: 36, padding: '4px 10px', width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo de documento">
            <option value="">Documento</option>
            <option value="ley">Ley</option>
          </select>
          <label className={`btn primary sm ${uploading ? 'disabled' : ''}`} style={{ cursor: 'pointer' }}>
            {uploading ? 'Indexando…' : 'Subir'}
            <input type="file" hidden disabled={uploading} accept=".pdf,.doc,.docx,.txt" onChange={upload} />
          </label>
        </div>
      )}
    >
      {notice && <div className="alert ok" style={{ marginBottom: 12 }}>{notice}</div>}
      <ErrorBox error={docs.error} onRetry={docs.reload} />
      <ErrorBox error={error} />
      {docs.loading && !docs.data ? <Loading /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Documento</th><th>Versión</th><th>Estado</th><th>Fuente</th>{manage && <th />}</tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.title}</b><div className="muted small">{d.filename} · {fmtBytes(d.sizeBytes)} · {fmtDate(d.createdAt)}{d.category === 'ley' ? ' · ley' : ''}</div></td>
                  <td>v{d.version}</td>
                  <td><Badge bg={DOC_STATUS[d.status][0]} fg={DOC_STATUS[d.status][1]}>{d.status}</Badge></td>
                  <td>{d.isEnabledSource ? <Badge bg="#dbeafe" fg="#1e3a8a">Autorizado</Badge> : <span className="muted small">No autorizado</span>}</td>
                  {manage && (
                    <td>
                      <div className="btn-row">
                        {d.status === 'indexado' && (
                          <button className="btn sm" onClick={() => run(() => api(`/documents/${d.id}/${d.isEnabledSource ? 'disable' : 'enable'}`, { method: 'POST' }))}>
                            {d.isEnabledSource ? 'Desautorizar' : 'Autorizar'}
                          </button>
                        )}
                        {d.status !== 'archivado' && (
                          <button className="btn sm danger" onClick={() => window.confirm(`¿Archivar «${d.title}»? Se quitará del índice.`) && run(() => api(`/documents/${d.id}`, { method: 'DELETE' }))}>
                            Archivar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No hay documentos en la base de conocimiento.</div>}
        </div>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- Estado del sistema */

function SystemStatus() {
  const { data, error, loading, reload } = useFetch((signal) => api('/rag/health', { signal }))
  const ok = (v) => (v === 'ok' ? <Badge bg="#dcfce7" fg="#14532d">ok</Badge> : <Badge bg="#fee2e2" fg="#7f1d1d">{String(v)}</Badge>)
  return (
    <Card title="Estado del sistema" aside={<button className="btn sm" onClick={reload}>Actualizar</button>}>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <>
          <div className="kv"><span>FastAPI</span>{ok(data.status)}</div>
          <div className="kv"><span>PostgreSQL</span>{ok(data.postgres)}</div>
          <div className="kv"><span>Ollama</span>{ok(data.ollama)}</div>
          {Object.entries(data.models ?? {}).map(([m, s]) => <div className="kv" key={m}><span>Modelo {m}</span>{ok(s)}</div>)}
        </>
      )}
    </Card>
  )
}

export default function Admin() {
  const { can, user } = useAuth()
  return (
    <main className="page">
      <PageHead eyebrow="Panel de administración" title="Administración" actions={<span className="pill">Acceso: {ROLE_LABEL[user.role] ?? user.role}</span>}>
        Gestiona usuarios y roles, la base de conocimiento de la ley y revisa el estado del sistema.
      </PageHead>
      {can('users.manage') && <Users />}
      <div className="layout-2">
        {(can('documents.manage') || can('documents.upload')) && <Knowledge />}
        <SystemStatus />
      </div>
    </main>
  )
}
