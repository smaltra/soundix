import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { UI_KINDS, type UiElement, type UiKind, type UiTrigger } from '../core/layout'
import { ControlItem } from './CanvasControls'
import { ButtonItem, LabelItem, WindowFrame, WindowItem, type DragMode } from './CanvasItem'
import { Icon } from './icons'
import { isFreeKey } from './LibraryPanel'
import { newStep } from './state'
import { useApp, useServices } from './store'

type Mode = 'test' | 'edit'

/** Windows shown in edit mode: the selected one, the one it sits in, the one it opens. */
function editWindows(ui: UiElement[], selectedId: string | null) {
  const selected = ui.find((el) => el.id === selectedId)
  const shown = new Set([selected?.id, selected?.opens, selected?.parent])
  return ui.filter((el) => el.kind === 'window' && shown.has(el.id))
}

export function Canvas() {
  const { state, dispatch, t } = useApp()
  const { player } = useServices()
  const [mode, setMode] = useState<Mode>('test')
  const [openId, setOpenId] = useState<string | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const editing = mode === 'edit'

  const play = (el: UiElement, trigger: UiTrigger) => {
    const id = el.sounds[trigger]
    const event = id ? state.events.find((e) => e.file === id) : undefined
    if (event) player.playEvent(event)
  }

  const closeWindow = (win: UiElement) => {
    setOpenId(null)
    play(win, 'close')
  }

  const press = (el: UiElement) => {
    play(el, 'press')
    const home = state.ui.find((w) => w.id === el.parent)
    if (el.closes && home) return closeWindow(home)
    const target = state.ui.find((w) => w.id === el.opens && w.kind === 'window')
    if (target && openId !== target.id) {
      const current = state.ui.find((w) => w.id === openId)
      if (current) play(current, 'close')
      setOpenId(target.id)
      play(target, 'open')
    }
  }

  /** One element in the current mode; windows are drawn separately. */
  const item = (el: UiElement) =>
    el.kind === 'button' ? (
      <ButtonItem
        key={el.id}
        el={el}
        editing={editing}
        selected={el.id === state.selectedId}
        startDrag={startDrag}
        onPress={press}
        onHover={(b) => play(b, 'hover')}
      />
    ) : el.kind === 'label' ? (
      <LabelItem
        key={el.id}
        el={el}
        editing={editing}
        selected={el.id === state.selectedId}
        startDrag={startDrag}
      />
    ) : (
      <ControlItem
        key={el.id}
        el={el}
        editing={editing}
        selected={el.id === state.selectedId}
        startDrag={startDrag}
        play={play}
        covered={!editing && !!openId && el.parent !== openId}
      />
    )

  const startDrag = (e: ReactPointerEvent, el: UiElement, dragMode: DragMode) => {
    if (e.button !== 0 || !stage.current) return
    e.stopPropagation()
    e.preventDefault()
    dispatch({ type: 'selectElement', id: el.id })
    const rect = stage.current.getBoundingClientRect()
    const start = { px: e.clientX, py: e.clientY, ...el }
    const step = newStep() // the whole drag is one undo step
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId || ev.buttons === 0) return
      const dx = (ev.clientX - start.px) / rect.width
      const dy = (ev.clientY - start.py) / rect.height
      const patch =
        dragMode === 'move'
          ? { x: start.x + dx, y: start.y + dy }
          : { w: start.w + dx, h: start.h + dy }
      dispatch({ type: 'updateElement', id: el.id, patch, step })
    }
    // The gesture ends on release, and also when the system takes the pointer away
    // (app switch, screen rotation, a rejected touch): the element must not keep following it.
    const ENDS = ['pointerup', 'pointercancel', 'lostpointercapture'] as const
    const end = (ev: PointerEvent) => {
      // Another finger lifting or cancelling does not end this drag.
      if (ev.pointerId !== e.pointerId) return
      target.removeEventListener('pointermove', move)
      ENDS.forEach((type) => target.removeEventListener(type, end))
    }
    target.addEventListener('pointermove', move)
    ENDS.forEach((type) => target.addEventListener(type, end))
  }

  // Delete removes the selected element while editing.
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (!isFreeKey(e) || !state.selectedId) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        dispatch({ type: 'removeElement', id: state.selectedId })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editing, state.selectedId, dispatch])

  const add = (kind: UiKind) => dispatch({ type: 'addElement', kind, text: t.newElement[kind] })
  const windows = state.ui.filter((el) => el.kind === 'window')
  const open = state.ui.find((el) => el.id === openId && el.kind === 'window')
  // Elements on the screen itself; those inside a window show with their window.
  const flat = state.ui.filter((el) => el.kind !== 'window' && !el.parent)
  const inside = (win: UiElement) => state.ui.filter((el) => el.parent === win.id)

  return (
    <section className="col canvas-col" aria-label={t.canvas}>
      <div className="canvas-bar">
        <div className="seg" role="group" aria-label={t.canvas}>
          {(['test', 'edit'] as Mode[]).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m)
                setOpenId(null)
              }}
            >
              <Icon name={m === 'test' ? 'play' : 'pencil'} size={13} />
              {m === 'test' ? t.modeTest : t.modeEdit}
            </button>
          ))}
        </div>
        {editing && (
          <>
            <select
              className="add-pick"
              value=""
              aria-label={t.addElement}
              onChange={(e) => add(e.target.value as UiKind)}
            >
              <option value="" disabled>
                + {t.addElement}
              </option>
              {UI_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t.kindNames[kind]}
                </option>
              ))}
            </select>
            {windows.length > 0 && (
              <select
                className="window-pick"
                value=""
                aria-label={t.windows}
                onChange={(e) => dispatch({ type: 'selectElement', id: e.target.value })}
              >
                <option value="" disabled>
                  {t.windows}
                </option>
                {windows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.text || w.id}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
      <div
        ref={stage}
        className={`stage2${editing ? ' editing' : ''}`}
        onPointerDown={() => editing && dispatch({ type: 'selectElement', id: null })}
      >
        {state.ui.length === 0 && <p className="stage-empty">{t.canvasEmpty}</p>}
        {flat.map(item)}
        {editing &&
          editWindows(state.ui, state.selectedId).map((w) => (
            <div key={w.id} className="w-layer">
              <WindowFrame el={w} selected={w.id === state.selectedId} startDrag={startDrag} />
              {inside(w).map(item)}
            </div>
          ))}
        {!editing && open && (
          <>
            {/* The rest of the screen blurs behind an open window; a click on it closes the window. */}
            <div className="w-backdrop" aria-hidden onClick={() => closeWindow(open)} />
            <div className="w-layer">
              <WindowItem
                el={open}
                mock={inside(open).length === 0}
                closable={!inside(open).some((el) => el.closes)}
                onClose={() => closeWindow(open)}
                onSelect={() => play(open, 'select')}
              />
              {inside(open).map(item)}
            </div>
          </>
        )}
      </div>
      <p className="canvas-note">{editing ? t.editHint : t.hoverNote}</p>
    </section>
  )
}
