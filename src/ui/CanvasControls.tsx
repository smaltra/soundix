// Toggles, checkboxes, sliders, text inputs, dropdowns and tabs on the canvas.
import { useEffect, useRef, useState } from 'react'
import { optionsOf, type UiElement, type UiTrigger } from '../core/layout'
import { boxStyle, EditFrame, type StartDrag } from './CanvasItem'
import { Icon } from './icons'

type Play = (el: UiElement, trigger: UiTrigger) => void

interface BodyProps {
  el: UiElement
  play: Play
  /** An open window lies over the element */
  covered?: boolean
}

function Toggle({ el, play }: BodyProps) {
  const [on, setOn] = useState(false)
  return (
    <button
      className={`w-ctl w-toggle ${el.color}${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={() => {
        setOn(!on)
        play(el, 'change')
      }}
    >
      <span className="w-track">
        <i />
      </span>
      {el.text && <span className="w-ctl-text">{el.text}</span>}
    </button>
  )
}

function Checkbox({ el, play }: BodyProps) {
  const [on, setOn] = useState(false)
  return (
    <button
      className={`w-ctl w-check ${el.color}${on ? ' on' : ''}`}
      role="checkbox"
      aria-checked={on}
      onClick={() => {
        setOn(!on)
        play(el, 'change')
      }}
    >
      <span className="w-box">{on && <Icon name="check" size={14} />}</span>
      {el.text && <span className="w-ctl-text">{el.text}</span>}
    </button>
  )
}

function Slider({ el, play }: BodyProps) {
  const [level, setLevel] = useState(5)
  return (
    <label className={`w-ctl w-slider ${el.color}`}>
      {el.text && <span className="w-ctl-text">{el.text}</span>}
      <input
        type="range"
        min={0}
        max={10}
        value={level}
        onChange={(e) => {
          setLevel(Number(e.target.value))
          play(el, 'change')
        }}
      />
    </label>
  )
}

function TextInput({ el, play }: BodyProps) {
  const [value, setValue] = useState('')
  // Typing plays on every change of the text: keys, Delete, paste, IME; not on Ctrl+A or arrows.
  return (
    <input
      className={`w-ctl w-input ${el.color}`}
      value={value}
      placeholder={el.text}
      onFocus={() => play(el, 'focus')}
      onChange={(e) => {
        setValue(e.target.value)
        play(el, 'type')
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
        play(el, 'submit')
        e.currentTarget.blur()
      }}
    />
  )
}

function Dropdown({ el, play, covered }: BodyProps) {
  const options = optionsOf(el.text)
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  // A press anywhere else closes the list, so it never stays over a window that opens.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])
  // A window opened any way (mouse or keyboard) covers the list: it closes.
  useEffect(() => {
    if (covered) setOpen(false)
  }, [covered])
  // Near the bottom of the canvas the list opens upwards.
  const up = el.y > 0.55
  return (
    <div ref={root} className={`w-ctl w-dropdown ${el.color}${up ? ' up' : ''}`}>
      <button
        className="w-dropdown-value"
        aria-expanded={open}
        onClick={() => {
          if (!open) play(el, 'open')
          setOpen(!open)
        }}
      >
        <span>{options[choice]}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="w-dropdown-list" role="listbox">
          {options.map((name, i) => (
            <button
              key={`${name}-${i}`}
              role="option"
              aria-selected={i === choice}
              onClick={() => {
                setChoice(i)
                setOpen(false)
                play(el, 'select')
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Tabs({ el, play }: BodyProps) {
  const [tab, setTab] = useState(0)
  return (
    <div className={`w-ctl w-tabs ${el.color}`} role="tablist">
      {optionsOf(el.text).map((name, i) => (
        <button
          key={`${name}-${i}`}
          role="tab"
          aria-selected={tab === i}
          onClick={() => {
            setTab(i)
            play(el, 'select')
          }}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

function Body(props: BodyProps) {
  switch (props.el.kind) {
    case 'toggle':
      return <Toggle {...props} />
    case 'checkbox':
      return <Checkbox {...props} />
    case 'slider':
      return <Slider {...props} />
    case 'input':
      return <TextInput {...props} />
    case 'dropdown':
      return <Dropdown {...props} />
    case 'tabs':
      return <Tabs {...props} />
    default:
      return null
  }
}

interface Props {
  el: UiElement
  editing: boolean
  selected: boolean
  startDrag: StartDrag
  play: Play
  covered: boolean
}

/** A control: live in Try mode, a draggable picture of itself in Edit mode. */
export function ControlItem({ el, editing, selected, startDrag, play, covered }: Props) {
  if (editing) {
    return (
      <EditFrame el={el} selected={selected} startDrag={startDrag} className="w-still">
        <Body el={el} play={() => undefined} />
      </EditFrame>
    )
  }
  return (
    <div className="w-item" style={boxStyle(el)}>
      <Body el={el} play={play} covered={covered} />
    </div>
  )
}
