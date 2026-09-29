import { useMemo } from 'react'
import { Dialog } from './Dialog'
import { useApp, useServices } from './store'

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp()
  const { library } = useServices()
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of library.library.sounds) map.set(s.pack, (map.get(s.pack) ?? 0) + 1)
    return map
  }, [library])

  return (
    <Dialog open={open} title={t.about} onClose={onClose} wide>
      <p>{t.aboutText}</p>
      <div className="table-wrap">
        <table className="packs">
          <thead>
            <tr>
              <th>{t.pack}</th>
              <th>{t.author}</th>
              <th className="num">{t.soundsCol}</th>
              <th>{t.license}</th>
            </tr>
          </thead>
          <tbody>
            {library.library.packs.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {p.name}
                  </a>
                </td>
                <td>{p.author}</td>
                <td className="num">{counts.get(p.id) ?? 0}</td>
                <td>{p.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">{t.codeLicense}</p>
    </Dialog>
  )
}
