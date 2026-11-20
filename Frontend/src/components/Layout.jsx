import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { ROLE_LABEL, initials } from '../lib/format'
import { NAV } from '../lib/nav'

export default function Layout() {
  const { user, logout, can } = useAuth()
  const items = NAV.filter((i) => i.perms.some(can))

  return (
    <>
      <div className="topbar no-print">
        <span>Privacy IA · Apoyo a la detección de riesgos y brechas de la Ley N° 21.719</span>
        <span>
          Entorno de desarrollo · <button onClick={logout}>Cerrar sesión</button>
        </span>
      </div>
      <header className="header no-print">
        <NavLink to={items[0]?.to ?? '/'}>
          <img className="logo" src="/logo.png" alt="DataLexIA Compliance & Solutions · Privacy IA" />
        </NavLink>
        <nav className="nav" aria-label="Principal">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="userchip">
          <div className="avatar" aria-hidden="true">{initials(user.fullName)}</div>
          <div>
            <b>{user.fullName}</b>
            <small>Rol: {ROLE_LABEL[user.role] ?? user.role}</small>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  )
}
