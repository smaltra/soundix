import { useEffect, useState } from 'react'
import { TRIGGERS, UI_COLORS, type UiElement } from '../core/layout'
import { Icon } from './icons'
import { useStep } from './step'
import { useApp } from './store'
import { TriggerSelect } from './TriggerSelect'

const CLOSES = '\u0000closes'

/** Field that commits on blur or Enter; the id field is cleaned by the reducer. */
function CommitInput({
  value,
  onCommit,
  className,
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (v: string) => {
    setDraft(value)
    onCommit(v)
  }
  return (
    <input
      className={className}
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)}
    />
  )
}

export function Inspector({ el }: { el: UiElement }) {
  const { state, dispatch, t } = useApp()
  const update = (patch: Partial<Omit<UiElement, 'id'>>, step?: number) =>
    dispatch({ type: 'updateElement', id: el.id, patch, step })
  const text = useStep()
  const emoji = useStep()
  const items = useStep()
  const windows = state.ui.filter((w) => w.kind === 'window')

  return (
    <div className="inspector">
      <h3>{t.kindNames[el.kind]}</h3>
      <label className="field">
        <span>{t.elementId}</span>
        <CommitInput
          className="mono"
          value={el.id}
          onCommit={(raw) => dispatch({ type: 'elementId', id: el.id, raw })}
        />
        <small>{t.elementIdHint}</small>
      </label>
      <div className="field-row">
        <label className="field grow">
          <span>{t.textNames[el.kind]}</span>
          <input
            value={el.text}
            maxLength={80}
            {...text.field}
            onChange={(e) => update({ text: e.target.value }, text.step())}
          />
        </label>
        {(el.kind === 'button' || el.kind === 'label') && (
          <label className="field emoji">
            <span>{t.elementEmoji}</span>
            <input
              value={el.emoji ?? ''}
              maxLength={16}
              {...emoji.field}
              onChange={(e) => update({ emoji: e.target.value.trim() || undefined }, emoji.step())}
            />
          </label>
        )}
      </div>
      <div className="field">
        <span>{t.color}</span>
        <span className="swatches" role="radiogroup" aria-label={t.color}>
          {UI_COLORS.map((color) => (
            <button
              key={color}
              className={`swatch ${color}`}
              role="radio"
              aria-checked={el.color === color}
              aria-label={t.colorNames[color]}
              title={t.colorNames[color]}
              onClick={() => update({ color })}
            />
          ))}
        </span>
      </div>
      {el.kind !== 'window' && (
        <label className="field">
          <span>{t.insideWindow}</span>
          <select
            value={el.parent ?? ''}
            onChange={(e) => update({ parent: e.target.value || undefined, closes: undefined })}
          >
            <option value="">{t.onScreen}</option>
            {windows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.text || w.id}
              </option>
            ))}
          </select>
        </label>
      )}
      {el.kind === 'button' && (
        <label className="field">
          <span>{t.opens}</span>
          <select
            value={el.closes ? CLOSES : (el.opens ?? '')}
            onChange={(e) => {
              const v = e.target.value
              if (v === CLOSES) update({ closes: true, opens: undefined })
              else update({ closes: undefined, opens: v || undefined })
            }}
          >
            <option value="">{t.opensNothing}</option>
            {el.parent && <option value={CLOSES}>{t.closesWindow}</option>}
            {windows
              .filter((w) => w.id !== el.parent)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.text || w.id}
                </option>
              ))}
          </select>
        </label>
      )}
      {el.kind === 'window' && (
        <div className="field-row">
          <div className="field grow">
            <span>{t.content}</span>
            <div className="seg">
              {(['grid', 'list'] as const).map((c) => (
                <button
                  key={c}
                  aria-pressed={(el.content ?? 'grid') === c}
                  onClick={() => update({ content: c })}
                >
                  {c === 'grid' ? t.contentGrid : t.contentList}
                </button>
              ))}
            </div>
          </div>
          <label className="field items">
            <span>{t.items}</span>
            <input
              type="number"
              min={1}
              max={60}
              value={el.items ?? 12}
              {...items.field}
              onChange={(e) =>
                update(
                  { items: Math.min(60, Math.max(1, Math.round(Number(e.target.value) || 1))) },
                  items.step(),
                )
              }
            />
          </label>
        </div>
      )}
      {TRIGGERS[el.kind].length > 0 && (
        <div className="triggers">
          <span className="triggers-title">{t.sounds}</span>
          {TRIGGERS[el.kind].map((trigger) => (
            <TriggerSelect
              key={trigger}
              caption={t.triggerNames[trigger]}
              file={el.sounds[trigger]}
              onChange={(file) => update({ sounds: { ...el.sounds, [trigger]: file } })}
            />
          ))}
        </div>
      )}
      <div className="inspector-actions">
        <button
          className="btn small"
          onClick={() => dispatch({ type: 'duplicateElement', id: el.id })}
        >
          <Icon name="plus" size={14} />
          {t.duplicate}
        </button>
        <button
          className="btn small danger"
          onClick={() => dispatch({ type: 'removeElement', id: el.id })}
        >
          <Icon name="trash" size={14} />
          {t.deleteElement}
        </button>
      </div>
    </div>
  )
}
