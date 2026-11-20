import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '../api/client'
import { AuthContext } from './context'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Si hay token guardado, se valida con /auth/me antes de mostrar nada.
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()))

  const logout = useCallback(async () => {
    try {
      if (tokenStore.get()) await api('/auth/logout', { method: 'POST' })
    } catch {
      /* la sesión puede haber expirado ya */
    }
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear()
      setUser(null)
    })
    if (!tokenStore.get()) return
    let cancelled = false
    api('/auth/me')
      .then((me) => !cancelled && setUser(me))
      .catch(() => tokenStore.clear())
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const { token } = await api('/auth/login', { method: 'POST', json: { email, password } })
    tokenStore.set(token)
    setUser(await api('/auth/me'))
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, can: (perm) => Boolean(user?.permissions?.includes(perm)) }),
    [user, loading, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
