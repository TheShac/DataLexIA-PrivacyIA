import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Carga datos con `fn(signal)` al montar y cuando cambian `deps`.
 * `reload()` vuelve a pedirlos. Con `intervalMs` repite la consulta hasta que `stopWhen(data)` sea true.
 */
export function useFetch(fn, deps = [], { intervalMs, stopWhen } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  const stopRef = useRef(stopWhen)
  useEffect(() => {
    fnRef.current = fn
    stopRef.current = stopWhen
  })

  useEffect(() => {
    const ctrl = new AbortController()
    let timer
    const run = async () => {
      try {
        const data = await fnRef.current(ctrl.signal)
        setState({ data, error: null, loading: false })
        if (intervalMs && !(stopRef.current && stopRef.current(data))) timer = setTimeout(run, intervalMs)
      } catch (error) {
        if (error.name === 'AbortError') return
        setState((s) => ({ ...s, error, loading: false }))
      }
    }
    run()
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, intervalMs, ...deps])

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
    setTick((t) => t + 1)
  }, [])

  return { ...state, reload }
}
