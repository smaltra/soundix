import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { UiElement } from '../core/layout'
import { Icon } from './icons'
import { useApp } from './store'

export type DragMode = 'move' | 'resize'
export type StartDrag = (e: ReactPointerEvent, el: UiElement, mode: DragMode) => void

/** Absolute box in canvas fractions. */
export const boxStyle = (el: UiElement) => ({
  left: `${el.x * 100}%`,
  top: `${el.y * 100}%`,
  width: `${el.w * 100}%`,
  height: `${el.h * 100}%`,
})

/** A wide button lays emoji and text in a row, a squarish one in a column. */
const isWide = (el: UiElement) => (el.w * 16) / (el.h * 9) > 1.6

function Content({ el }: { el: UiElement }) {
  return (
    <>
      {el.emoji && <span className="w-emoji">{el.emoji}</span>}
      {el.text && <span className="w-text">{el.text}</span>}
    </>
  )
}

interface EditFrameProps {
  el: UiElement
  selected: boolean
  startDrag: StartDrag
  children: ReactNode
  className?: string
}

/** Edit mode: select, move by dragging, resize by the corner. */
export function EditFrame({ el, selected, startDrag, children, className = '' }: EditFrameProps) {
  return (
    <div
      className={`w-item ${className}${selected ? ' selected' : ''}`}
      style={boxStyle(el)}
      onPointerDown={(e) => startDrag(e, el, 'move')}
    >
      {children}
      {selected && (
        <span className="w-resize" aria-hidden onPointerDown={(e) => startDrag(e, el, 'resize')} />
      )}
    </div>
  )
}

interface ItemProps {
  el: UiElement
  editing: boolean
  selected: boolean
  startDrag: StartDrag
  onPress: (el: UiElement) => void
  onHover: (el: UiElement) => void
}

export function ButtonItem({ el, editing, selected, startDrag, onPress, onHover }: ItemProps) {
  const layout = isWide(el) ? 'row' : 'col'
  if (editing) {
    return (
      <EditFrame el={el} selected={selected} startDrag={startDrag}>
        <span className={`m w-button ${el.color} ${layout}`}>
          <Content el={el} />
        </span>
      </EditFrame>
    )
  }
  return (
    <button
      className={`m w-item w-button ${el.color} ${layout}`}
      style={boxStyle(el)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(el)}
      onClick={() => onPress(el)}
    >
      <Content el={el} />
    </button>
  )
}

export function LabelItem({
  el,
  editing,
  selected,
  startDrag,
}: Omit<ItemProps, 'onPress' | 'onHover'>) {
  const label = (
    <span className={`w-label ${el.color}`}>
      <Content el={el} />
    </span>
  )
  if (editing) {
    return (
      <EditFrame el={el} selected={selected} startDrag={startDrag}>
        {label}
      </EditFrame>
    )
  }
  return (
    <div className="w-item" style={boxStyle(el)}>
      {label}
    </div>
  )
}

interface WindowProps {
  el: UiElement
  /** Mock rows or cells; off when the window has its own elements */
  mock: boolean
  /** The title bar close button; off when the window has its own */
  closable: boolean
  onClose: () => void
  onSelect: () => void
}

/** Test mode: a window with mock rows or cells, or empty under its own elements. */
export function WindowItem({ el, mock, closable, onClose, onSelect }: WindowProps) {
  const { t } = useApp()
  const items = Array.from({ length: el.items ?? 12 }, (_, i) => i + 1)
  return (
    <div className="w-item w-window" style={boxStyle(el)} role="dialog" aria-label={el.text}>
      <div className={`w-window-head ${el.color}`}>
        <span>{el.text}</span>
        {closable && (
          <button className="m red w-close" aria-label={t.close} onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <div className={`w-window-body ${el.content ?? 'grid'}`}>
        {mock &&
          items.map((n) =>
            el.content === 'list' ? (
              <button key={n} className="w-row" onClick={onSelect}>
                <span>
                  {t.mockItem} {n}
                </span>
                <b>{n * 100}</b>
              </button>
            ) : (
              <button key={n} className={`w-cell ${el.color}`} onClick={onSelect}>
                {n}
              </button>
            ),
          )}
      </div>
    </div>
  )
}

/** Edit mode: a window as a dashed frame, dragged by its title. */
export function WindowFrame({
  el,
  selected,
  startDrag,
}: Omit<ItemProps, 'onPress' | 'onHover' | 'editing'>) {
  return (
    <EditFrame el={el} selected={selected} startDrag={startDrag} className="w-window-frame">
      <div className={`w-window-head ${el.color}`}>
        <span>{el.text}</span>
      </div>
      <div className="w-window-hint">
        {el.content === 'list' ? '≡' : '▦'} {el.items}
      </div>
    </EditFrame>
  )
}
