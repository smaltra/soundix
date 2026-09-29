import { useMemo, useState } from 'react'
import { buildZip, downloadBlob } from '../adapters/zip'
import { extOf } from '../core/entries'
import { planExport, zipName, type ExportFormat } from '../core/export'
import { copyOf } from '../core/variant-copy'
import { Dialog } from './Dialog'
import { useApp, useServices } from './store'

const FORMATS: ExportFormat[] = ['original', 'ogg']
const ROBLOX_EXTS = new Set(['mp3', 'ogg', 'wav', 'flac'])

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, t } = useApp()
  const { library, own, variants, toast } = useServices()
  const [format, setFormat] = useState<ExportFormat>('original')
  const [withVariants, setWithVariants] = useState(false)
  const [busy, setBusy] = useState(false)

  // Variants of the events in this set; they travel only when asked for.
  const setVariants = useMemo(() => {
    const ids = new Set(state.events.map((e) => e.file))
    return variants.list.filter((v) => ids.has(v.event))
  }, [state.events, variants.list])

  const plan = useMemo(
    () =>
      planExport(
        state.events,
        state.ui,
        library.library,
        format,
        (id) => {
          const sound = own.list.find((s) => s.id === id)
          return sound ? sound.blob.type || sound.type : null
        },
        withVariants
          ? setVariants.map((v) => {
              const copy = copyOf(v, own.list)
              return {
                id: v.id,
                event: v.event,
                n: v.n,
                type: v.blob.type,
                generated: v.generated,
                // Any event of the set may play it: the shared pool lends variants across events.
                usedBy: copy
                  ? state.events
                      .filter((e) => e.sound?.kind === 'own' && e.sound.id === copy.id)
                      .map((e) => e.file)
                  : [],
              }
            })
          : [],
      ),
    [state.events, state.ui, library, format, own.list, withVariants, setVariants],
  )
  const soundFiles = plan.files.filter((f) => 'url' in f || 'own' in f)
  const hasOwn = soundFiles.some((f) => 'own' in f)
  const notForRoblox = soundFiles.map((f) => f.path).filter((path) => !ROBLOX_EXTS.has(extOf(path)))

  const download = async () => {
    setBusy(true)
    try {
      const blob = await buildZip(
        plan.files,
        (id) => own.list.find((s) => s.id === id)?.blob,
        (id) => variants.list.find((v) => v.id === id)?.blob,
      )
      downloadBlob(blob, zipName(new Date()))
      onClose()
    } catch {
      toast(t.exportFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} title={t.export} onClose={onClose}>
      <p className="muted">{t.exportText}</p>
      <fieldset className="formats">
        <legend>{t.format}</legend>
        <div className="seg">
          {FORMATS.map((f) => (
            <button key={f} aria-pressed={format === f} onClick={() => setFormat(f)}>
              {f === 'original' ? t.formatOriginal : t.formatOgg}
            </button>
          ))}
        </div>
      </fieldset>
      {setVariants.length > 0 && (
        <label className="gen-check">
          <input
            type="checkbox"
            checked={withVariants}
            onChange={(e) => setWithVariants(e.target.checked)}
          />
          {t.includeVariants(setVariants.length)}
        </label>
      )}
      <ul className="warnings">
        {plan.skipped.length > 0 && (
          <li>{t.skipped(plan.skipped.map((e) => e.file).join(', '))}</li>
        )}
        {hasOwn && <li>{t.ownAsIs}</li>}
        {notForRoblox.length > 0 && <li>{t.robloxFormats(notForRoblox.join(', '))}</li>}
      </ul>
      <div className="dialog-actions">
        {soundFiles.length === 0 && <span className="muted">{t.nothingToExport}</span>}
        <button className="btn primary" disabled={busy} onClick={download}>
          {busy ? t.building : t.download}
        </button>
      </div>
    </Dialog>
  )
}
