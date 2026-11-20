import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import { useAuth } from './auth/context'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import { NAV } from './lib/nav'
import Admin from './pages/Admin'
import Analysis, { AnalysisIndex } from './pages/Analysis'
import History from './pages/History'
import Login from './pages/Login'
import Reports from './pages/Reports'
import Upload from './pages/Upload'

/** Exige sesión y, opcionalmente, alguno de los permisos indicados. */
function Guard({ perms, children }) {
  const { user, loading, can } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (perms && !perms.some(can)) {
    // Sin permiso para esta pantalla: se lleva al usuario a la primera que sí puede ver.
    const home = NAV.find((i) => i.perms.some(can))
    return home && home.to !== window.location.pathname ? <Navigate to={home.to} replace /> : <main className="page"><div className="card empty">No tienes permisos para ver esta sección.</div></main>
  }
  return children
}

const guarded = (perms, el) => <Guard perms={perms}>{el}</Guard>

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Guard><Layout /></Guard>}>
            <Route index element={guarded(['analyses.run'], <Upload />)} />
            <Route path="analisis" element={guarded(['analyses.read'], <AnalysisIndex />)} />
            <Route path="analisis/:id" element={guarded(['analyses.read'], <Analysis />)} />
            <Route path="historial" element={guarded(['analyses.read'], <History />)} />
            <Route path="reportes" element={guarded(['analyses.read'], <Reports />)} />
            <Route path="admin" element={guarded(['users.manage', 'documents.manage', 'documents.upload'], <Admin />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
