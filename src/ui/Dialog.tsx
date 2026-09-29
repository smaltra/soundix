import { useEffect, useRef, type ReactNode } from 'react'
import { useApp } from './store'
import { Icon } from './icons'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

/** Native modal <dialog>: Esc and a click on the backdrop close it. */
export function Dialog({ open, title, onClose, children, wide }: Props) {
  const { t } = useApp()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' wide' : ''}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="dialog-body">
          <div className="dialog-head">
            <h2>{title}</h2>
            <button className="x" aria-label={t.close} onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
