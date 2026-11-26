import { useState } from 'react'
import { useAuth } from '../auth/context'
import ChatPanel from './ChatPanel'

const Icon = ({ children }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

/**
 * Burbuja fija en la esquina inferior derecha que abre el chat normativo desde cualquier pantalla.
 * El panel queda montado aunque esté cerrado, así la conversación se conserva al cerrarlo y al cambiar de página.
 */
export default function ChatWidget() {
  const { can } = useAuth()
  const [open, setOpen] = useState(false)
  if (!can('chat.use')) return null

  return (
    <div className="chat-widget no-print">
      <ChatPanel open={open} onClose={() => setOpen(false)} />
      <button
        type="button"
        className={`chat-fab ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="chat-panel"
        aria-label={open ? 'Cerrar el chat normativo' : 'Abrir el chat normativo'}
        title={open ? 'Cerrar chat' : 'Preguntar a la normativa'}
      >
        {open ? (
          <Icon><path d="M18 6 6 18M6 6l12 12" /></Icon>
        ) : (
          <Icon><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.3A8.4 8.4 0 1 1 21 11.5Z" /></Icon>
        )}
      </button>
    </div>
  )
}
