import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import { useApp } from './store'

interface Props {
  onShare: () => void
  onImportFile: (file: File) => void
  onExport: () => void
  onAbout: () => void
  onPrompt: () => void
  onPaste: () => void
}

/** "⋯" menu for the rarer actions; closes on a click outside or Esc. */
interface MenuProps {
  onImport: () => void
  onAbout: () => void
  onPrompt: () => void
  onPaste: () => void
}

function MoreMenu({ onImport, onAbout, onPrompt, onPaste }: MenuProps) {
  const { t } = useApp()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const pick = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div className="menu" ref={box}>
      <button
        className="btn icon-only"
        aria-label={t.more}
        aria-expanded={open}
        title={t.more}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu-list" role="menu">
          <button role="menuitem" onClick={pick(onImport)}>
            <Icon name="upload" />
            {t.import}
          </button>
          <button role="menuitem" onClick={pick(onPaste)}>
            <Icon name="code" />
            {t.pasteJson}
          </button>
          <button role="menuitem" onClick={pick(onPrompt)}>
            <Icon name="code" />
            {t.agentPrompt}
          </button>
          <button role="menuitem" onClick={pick(onAbout)}>
            <Icon name="info" />
            {t.about}
          </button>
        </div>
      )}
    </div>
  )
}

export function Header({ onShare, onImportFile, onExport, onAbout, onPrompt, onPaste }: Props) {
  const { state, dispatch, t } = useApp()
  const fileInput = useRef<HTMLInputElement>(null)
  const listen = Math.round(state.listenVolume * 100)

  return (
    <header className="top">
      <div className="brand">
        <span className="logo">Soundix</span>
        <span className="tagline">{t.tagline}</span>
      </div>
      <label className="listen" title={`${t.listenVolume}: ${listen} %`}>
        <Icon name="volume" />
        <input
          type="range"
          min={0}
          max={100}
          value={listen}
          aria-label={t.listenVolume}
          onChange={(e) => dispatch({ type: 'listenVolume', value: Number(e.target.value) / 100 })}
        />
      </label>
      <nav className="actions">
        <button className="btn" onClick={onShare}>
          <Icon name="link" />
          {t.share}
        </button>
        <button className="btn primary" onClick={onExport}>
          <Icon name="download" />
          {t.export}
        </button>
        <MoreMenu
          onImport={() => fileInput.current?.click()}
          onAbout={onAbout}
          onPrompt={onPrompt}
          onPaste={onPaste}
        />
      </nav>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json,.zip,application/zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onImportFile(file)
        }}
      />
    </header>
  )
}
