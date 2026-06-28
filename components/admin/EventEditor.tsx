'use client'

import { useState } from 'react'
import type { RailwayData, RailwayEvent } from '@/lib/types'
import { computeMapState } from '@/lib/engine'

const TYPE_LABELS: Record<RailwayEvent['type'], string> = {
  line_open:       '路線開業',
  station_open:    '駅開業',
  line_extend:     '路線延伸',
  line_close:      '廃線',
  station_close:   '廃駅',
  section_replace: '区間改編',
}

const TYPE_BADGE: Record<RailwayEvent['type'], string> = {
  line_open:       'bg-green-800 text-green-200',
  station_open:    'bg-teal-800 text-teal-200',
  line_extend:     'bg-blue-800 text-blue-200',
  line_close:      'bg-red-900 text-red-200',
  station_close:   'bg-orange-900 text-orange-200',
  section_replace: 'bg-purple-800 text-purple-200',
}

// ── tiny UI parts ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-slate-400 mb-1">{children}</label>
}

function ToggleGroup<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex gap-2">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 text-sm py-1.5 rounded transition-colors
            ${value === o.value ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  event: RailwayEvent
  data: RailwayData
  onSave: (data: RailwayData) => void
  onCancel: () => void
}

export default function EventEditor({ event, data, onSave, onCancel }: Props) {
  const [date, setDate]   = useState(event.date)
  const [label, setLabel] = useState(event.label)

  // line_open: animation direction (stored in LineGeometry)
  const lineGeo   = event.type === 'line_open' ? data.geometries.find(g => g.lineId === event.lineId) : null
  const [animDir, setAnimDir] = useState<'start' | 'end'>(lineGeo?.animDirection ?? 'start')

  const loStationIds   = event.type === 'line_open' ? event.stationIds : []
  const startStName    = data.stations.find(s => s.id === loStationIds[0])?.name ?? '始点'
  const endStName      = data.stations.find(s => s.id === loStationIds[loStationIds.length - 1])?.name ?? '終点'

  // line_extend: extension direction
  const [extDir, setExtDir] = useState<'start' | 'end'>(
    event.type === 'line_extend' ? event.direction : 'end'
  )

  // station_open: after-station (insertion position)
  const [afterStationId, setAfterStationId] = useState<string | null>(
    event.type === 'station_open' ? event.afterStationId : null
  )

  // Stations on the relevant line just before this event, for afterStation dropdown
  const stationsBeforeEvent = (() => {
    if (event.type !== 'station_open') return []
    const yearBefore = parseInt(event.date) - 1
    const ms = computeMapState(data.stations, data.lines, data.events, yearBefore)
    const stationIds = ms.activeLines.find(al => al.line.id === event.lineId)?.stationIds ?? []
    return stationIds.map(id => data.stations.find(s => s.id === id)).filter(Boolean) as typeof data.stations
  })()

  function handleSave() {
    const year = parseInt(date)
    if (!date || isNaN(year) || year < 1800 || year > 2200) {
      alert('年を正しく入力してください')
      return
    }

    // Build updated event (type cannot change)
    let updatedEvent: RailwayEvent
    switch (event.type) {
      case 'line_open':
        updatedEvent = { ...event, date, label }
        break
      case 'station_open':
        updatedEvent = { ...event, date, label, afterStationId }
        break
      case 'line_extend':
        updatedEvent = { ...event, date, label, direction: extDir }
        break
      default:
        updatedEvent = { ...event, date, label }
    }

    const newEvents = data.events
      .map(e => e.id === event.id ? updatedEvent : e)
      .sort((a, b) => a.date.localeCompare(b.date))

    // Update LineGeometry.animDirection when editing line_open
    let newGeometries = data.geometries
    if (event.type === 'line_open') {
      const exists = data.geometries.some(g => g.lineId === event.lineId)
      newGeometries = exists
        ? data.geometries.map(g => g.lineId === event.lineId ? { ...g, animDirection: animDir } : g)
        : [...data.geometries, { lineId: event.lineId, segments: [], animDirection: animDir }]
    }

    onSave({ ...data, events: newEvents, geometries: newGeometries })
  }

  const lineName    = event.type === 'line_open' || event.type === 'line_extend' || event.type === 'line_close'
    ? data.lines.find(l => l.id === event.lineId)?.name
    : null
  const stationName = event.type === 'station_open' || event.type === 'station_close'
    ? data.stations.find(s => s.id === (event.type === 'station_open' ? event.stationId : event.stationId))?.name
    : null

  return (
    <div className="flex flex-col gap-5 text-slate-200">

      {/* Type badge + read-only info */}
      <div className="flex items-center gap-3">
        <span className={`text-xs px-2 py-1 rounded font-medium ${TYPE_BADGE[event.type]}`}>
          {TYPE_LABELS[event.type]}
        </span>
        {lineName    && <span className="text-sm text-slate-400">路線: <span className="text-white">{lineName}</span></span>}
        {stationName && <span className="text-sm text-slate-400">駅: <span className="text-white">{stationName}</span></span>}
      </div>

      {/* Date + label (always editable) */}
      <div className="flex gap-3">
        <div className="w-28 shrink-0">
          <Label>年</Label>
          <input
            type="text"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:border-blue-400 outline-none"
          />
        </div>
        <div className="flex-1">
          <Label>説明</Label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:border-blue-400 outline-none"
          />
        </div>
      </div>

      {/* line_open: animation direction */}
      {event.type === 'line_open' && (
        <div>
          <Label>アニメーション開始端</Label>
          <ToggleGroup
            value={animDir}
            onChange={setAnimDir}
            options={[
              { value: 'start', label: startStName },
              { value: 'end',   label: endStName },
            ]}
          />
        </div>
      )}

      {/* line_extend: extension direction */}
      {event.type === 'line_extend' && (
        <div>
          <Label>延伸方向</Label>
          <ToggleGroup
            value={extDir}
            onChange={setExtDir}
            options={[
              { value: 'start', label: '始点方向に延伸' },
              { value: 'end',   label: '終点方向に延伸' },
            ]}
          />
        </div>
      )}

      {/* station_open: insertion position */}
      {event.type === 'station_open' && (
        <div>
          <Label>挿入位置（直前の駅）</Label>
          <select
            value={afterStationId ?? ''}
            onChange={e => setAfterStationId(e.target.value || null)}
            className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:border-blue-400 outline-none"
          >
            <option value="">先頭に追加</option>
            {stationsBeforeEvent.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg py-2"
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          className="flex-1 text-sm bg-green-600 hover:bg-green-500 rounded-lg py-2 font-medium"
        >
          保存
        </button>
      </div>
    </div>
  )
}
