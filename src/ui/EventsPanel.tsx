import { useState } from 'react'
import { EventCard } from './EventCard'
import { useApp } from './store'
import { Icon } from './icons'

export function EventsPanel({ onNewSet }: { onNewSet: () => void }) {
  const { state, dispatch, t } = useApp()
  const [name, setName] = useState('')

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    dispatch({ type: 'add', name })
    setName('')
  }

  return (
    <aside className="col events" aria-label={t.events}>
      <div className="col-head">
        <h2>{t.events}</h2>
        <button className="btn small" onClick={onNewSet}>
          <Icon name="layers" size={14} />
          {t.newSet}
        </button>
      </div>
      <div className="event-list">
        {state.events.length === 0 && <p className="empty">{t.emptySet}</p>}
        {state.events.map((event) => (
          <EventCard key={event.key} event={event} current={event.key === state.currentKey} />
        ))}
      </div>
      <form className="add-event" onSubmit={add}>
        <input
          value={name}
          maxLength={60}
          placeholder={t.addEventPlaceholder}
          aria-label={t.addEventPlaceholder}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn">
          <Icon name="plus" size={14} />
          {t.addEvent}
        </button>
      </form>
    </aside>
  )
}
