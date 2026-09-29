import { useApp, useServices } from './store'
import { Icon } from './icons'

export function Toasts() {
  const { t } = useApp()
  const { toasts, dismiss } = useServices()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="btn small"
              onClick={() => {
                toast.action?.run()
                dismiss(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button className="x" aria-label={t.close} onClick={() => dismiss(toast.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
