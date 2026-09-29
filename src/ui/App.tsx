import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import { LAYOUT_PROMPT } from '../core/agent'
import { createEmpty, createExample, EXAMPLE_VERSION } from '../core/example'
import type { UiElement } from '../core/layout'
import { decodeShare, readShareHash, shareUrl, type ShareData } from '../core/share'
import { parseSoundixJson } from '../core/soundix-json'
import type { SoundEvent } from '../core/types'
import { AboutDialog } from './AboutDialog'
import { Canvas } from './Canvas'
import { Dialog } from './Dialog'
import { EventsPanel } from './EventsPanel'
import { ExportDialog } from './ExportDialog'
import { Header } from './Header'
import { importProject, isZipFile } from './importProject'
import { NewSetDialog, type SetKind } from './NewSetDialog'
import { RightPanel } from './RightPanel'
import type { Action } from './state'
import { StoreProvider, useApp, useServices } from './store'
import { Toasts } from './Toasts'

type DialogName = 'export' | 'about' | 'newSet' | null

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
const isJsonFile = (f: File) => /\.json$/i.test(f.name) || f.type === 'application/json'
/** A Soundix JSON or a project ZIP */
const isProjectFile = (f: File) => isJsonFile(f) || isZipFile(f)
const looksLikeJson = (text: string) => text.startsWith('{') || text.startsWith('[')

/** Drop audio files anywhere on the page to add them to My sounds. */
function useFileDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false)
  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setOver(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const overPage = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setOver(false)
      onFiles([...(e.dataTransfer?.files ?? [])])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', overPage)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', overPage)
      window.removeEventListener('drop', drop)
    }
  }, [onFiles])
  return over
}

const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'color', 'file'])

/** Text fields keep their own Ctrl+Z; everywhere else it undoes set edits. */
function isTextField(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el?.closest) return false
  if (el.closest('textarea, [contenteditable="true"]')) return true
  return el instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(el.type)
}

/** Ctrl+Z / Cmd+Z undo; Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y redo. */
function useUndoKeys(dispatch: Dispatch<Action>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return
      if (document.querySelector('dialog[open]')) return
      const redo = (e.code === 'KeyZ' && e.shiftKey) || (e.code === 'KeyY' && e.ctrlKey)
      if (e.code !== 'KeyZ' && !redo) return
      e.preventDefault()
      dispatch({ type: redo ? 'redo' : 'undo' })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dispatch])
}

function Main() {
  const { state, dispatch, t } = useApp()
  const { own, variants, copies, toast } = useServices()
  const [dialog, setDialog] = useState<DialogName>(null)
  const [linked, setLinked] = useState<ShareData | null>(null)

  const replaceSet = (events: SoundEvent[], ui: UiElement[], message: string, example?: number) => {
    dispatch({ type: 'replace', events, ui, example })
    toast(message, {
      label: t.restorePrevious,
      run: () => {
        dispatch({ type: 'restore' })
        toast(t.restored)
      },
    })
  }

  useUndoKeys(dispatch)

  // A shared link opens only after the person agrees to replace the current set.
  useEffect(() => {
    const data = readShareHash(location.hash)
    if (data === null) return
    history.replaceState(null, '', location.pathname + location.search)
    const decoded = decodeShare(data)
    if (decoded) setLinked(decoded)
    else toast(t.linkBroken)
    // Runs once on start.
  }, [])

  const share = async () => {
    const url = shareUrl(location.origin + location.pathname, {
      events: state.events,
      ui: state.ui,
    })
    const leftOut = state.events.some((e) => e.sound && e.sound.kind !== 'library')
    try {
      await navigator.clipboard.writeText(url)
      toast(leftOut ? t.linkOwnLeftOut : t.linkCopied)
    } catch {
      window.prompt(t.copyLink, url)
    }
  }

  const importText = (text: string) => {
    const result = parseSoundixJson(text, state.events)
    if (result.ok) replaceSet(result.events, result.ui, t.imported)
    else toast(`${t.importFailed} ${t.importErrors[result.error]}`)
  }
  // Drop and paste handlers are set up once; they call the latest import.
  const latestImport = useRef(importText)
  latestImport.current = importText

  const importFile = async (file: File) => {
    if (isZipFile(file)) {
      const result = await importProject(file, state.events, own, variants, copies)
      if (result.ok) {
        replaceSet(
          result.events,
          result.ui,
          t.importedProject(result.own, result.variants, result.refused),
        )
      } else toast(`${t.importFailed} ${t.importErrors[result.error]}`)
      return
    }
    try {
      latestImport.current(await file.text())
    } catch {
      toast(`${t.importFailed} ${t.importErrors['not-json']}`)
    }
  }
  const latestImportFile = useRef(importFile)
  latestImportFile.current = importFile

  const pasteJson = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (looksLikeJson(text)) importText(text)
      else toast(t.clipboardEmpty)
    } catch {
      toast(t.clipboardBlocked)
    }
  }

  // Ctrl+V / Cmd+V outside text fields imports Soundix JSON: copied text or a copied .json file.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTextField(e.target) || document.querySelector('dialog[open]')) return
      const file = [...(e.clipboardData?.files ?? [])].find(isProjectFile)
      const text = e.clipboardData?.getData('text/plain').trim() ?? ''
      if (file) void latestImportFile.current(file)
      else if (looksLikeJson(text)) latestImport.current(text)
      else return
      e.preventDefault()
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const pickSet = (kind: SetKind) => {
    setDialog(null)
    if (kind === 'example') {
      const set = createExample('en')
      replaceSet(set.events, set.ui, t.setReplaced, EXAMPLE_VERSION)
    } else {
      const set = createEmpty('en')
      replaceSet(set.events, set.ui, t.setReplaced)
    }
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(LAYOUT_PROMPT)
      toast(t.promptCopied)
    } catch {
      window.prompt(t.agentPrompt, LAYOUT_PROMPT)
    }
  }

  const addOwn = useCallback(
    async (files: File[]) => {
      if (!files.length) return
      const { added, failed, refused } = await own.add(files)
      if (failed.length) toast(t.unreadable(failed.join(', ')))
      if (refused.length) toast(t.notSaved(refused.join(', ')))
      if (added) toast(t.addedOwn(added))
    },
    [own, toast, t],
  )
  // Dropped .json files are imported; everything else goes to My sounds.
  const dropFiles = useCallback(
    (files: File[]) => {
      const json = files.find(isProjectFile)
      if (json) void latestImportFile.current(json)
      void addOwn(files.filter((f) => !isProjectFile(f)))
    },
    [addOwn],
  )
  const dropping = useFileDrop(dropFiles)

  return (
    <div className="app">
      <Header
        onShare={share}
        onImportFile={importFile}
        onExport={() => setDialog('export')}
        onAbout={() => setDialog('about')}
        onPrompt={copyPrompt}
        onPaste={pasteJson}
      />
      <main className="cols">
        <EventsPanel onNewSet={() => setDialog('newSet')} />
        <Canvas />
        <RightPanel onAddOwn={addOwn} />
      </main>
      <ExportDialog open={dialog === 'export'} onClose={() => setDialog(null)} />
      <AboutDialog open={dialog === 'about'} onClose={() => setDialog(null)} />
      <NewSetDialog open={dialog === 'newSet'} onClose={() => setDialog(null)} onPick={pickSet} />
      <Dialog open={linked !== null} title={t.openLinkTitle} onClose={() => setLinked(null)}>
        <p>{t.openLinkText}</p>
        <div className="dialog-actions">
          <button className="btn" onClick={() => setLinked(null)}>
            {t.cancel}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (linked) replaceSet(linked.events, linked.ui, t.setReplaced)
              setLinked(null)
            }}
          >
            {t.open}
          </button>
        </div>
      </Dialog>
      {dropping && <div className="drop">{t.dropHint}</div>}
      <Toasts />
    </div>
  )
}

export function App() {
  return (
    <StoreProvider>
      <Main />
    </StoreProvider>
  )
}
