import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { ErrorBox } from '../components/ui'

export default function Login() {
  const { user, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <section className="login-form">
        <img className="logo" src="/logo.png" alt="DataLexIA Compliance & Solutions · Privacy IA" />
        <form onSubmit={submit}>
          <div>
            <div className="eyebrow">Acceso a la plataforma</div>
            <h1>Iniciar sesión</h1>
            <p className="muted">Ingresa con tu cuenta de DataLexIA para continuar.</p>
          </div>
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input id="email" type="email" autoComplete="username" required placeholder="nombre@datalexia.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" autoComplete="current-password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <ErrorBox error={error} />
          <button className="btn primary" style={{ minHeight: 50 }} disabled={busy}>
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
          <div className="muted small" style={{ textAlign: 'center' }}>¿Olvidaste tu contraseña? Contacta al administrador.</div>
        </form>
      </section>
      <section className="login-hero">
        <div className="eyebrow" style={{ color: '#bfdbfe' }}>Privacy IA</div>
        <h2>Detecta riesgos y brechas de la Ley N° 21.719 con respaldo de la fuente</h2>
        <ul>
          <li>Cada hallazgo cita el artículo y el pasaje del documento.</li>
          <li>Revisión humana obligatoria antes de cualquier reporte.</li>
          <li>Acceso por roles y registro de auditoría de cada acción.</li>
        </ul>
      </section>
    </div>
  )
}
