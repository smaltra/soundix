import { Inspector } from './Inspector'
import { LibraryPanel } from './LibraryPanel'
import type { Panel } from './state'
import { useApp } from './store'

/** Sound tab: the library for the current event. Element tab: the selected element. */
export function RightPanel({ onAddOwn }: { onAddOwn: (files: File[]) => void }) {
  const { state, dispatch, t } = useApp()
  const selected = state.ui.find((el) => el.id === state.selectedId)
  const tabs: [Panel, string][] = [
    ['sound', t.panelSound],
    ['element', t.panelElement],
  ]

  return (
    <aside className="col right">
      <div className="tabs-bar" role="tablist">
        {tabs.map(([panel, label]) => (
          <button
            key={panel}
            role="tab"
            aria-selected={state.panel === panel}
            onClick={() => dispatch({ type: 'panel', panel })}
          >
            {label}
          </button>
        ))}
      </div>
      {state.panel === 'sound' ? (
        <LibraryPanel onAddOwn={onAddOwn} />
      ) : selected ? (
        <Inspector el={selected} />
      ) : (
        <p className="empty panel-hint">{t.selectElementHint}</p>
      )}
    </aside>
  )
}
