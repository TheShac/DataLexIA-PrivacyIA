const TOKEN_KEY = 'privacyia.token'

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* almacenamiento no disponible */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* almacenamiento no disponible */
    }
  },
}

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

// El backend responde { error: "texto" } o { error: { fieldErrors, formErrors } } (zod).
function messageFrom(data, fallback) {
  const e = data?.error
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const parts = [...(e.formErrors ?? []), ...Object.entries(e.fieldErrors ?? {}).map(([k, v]) => `${k}: ${v.join(', ')}`)]
    if (parts.length) return parts.join(' · ')
  }
  return fallback
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn
}

async function request(path, { method, json, form, signal }) {
  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'

  try {
    return await fetch(`/api${path}`, { method, headers, body: form ?? (json !== undefined ? JSON.stringify(json) : undefined), signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, 'No se pudo conectar con el servidor')
  }
}

/**
 * Llamada al backend. `json` envía JSON, `form` envía FormData, `blob` devuelve un Blob.
 * Un 401 fuera del login cierra la sesión.
 */
export async function api(path, { method = 'GET', json, form, blob = false, signal } = {}) {
  const res = await request(path, { method, json, form, signal })

  if (res.status === 204) return null
  if (res.ok && blob) return res.blob()
  return readBody(path, res)
}

async function readBody(path, res) {

  const text = await res.text()
  let data = text
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* respuesta no JSON */
  }

  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized()
    throw new ApiError(res.status, messageFrom(data, `Error ${res.status}`), data)
  }
  return data
}

/**
 * POST cuya respuesta llega por partes (NDJSON): llama a `onEvent` con cada objeto apenas se recibe.
 */
export async function apiStream(path, { json, onEvent, signal }) {
  const res = await request(path, { method: 'POST', json, signal })
  if (!res.ok) return readBody(path, res) // lanza el ApiError correspondiente

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { value, done } = await reader.read()
    pending += decoder.decode(value, { stream: !done })
    const lines = pending.split('\n')
    pending = done ? '' : lines.pop() // la última puede estar a medias
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line))
    if (done) return
  }
}
