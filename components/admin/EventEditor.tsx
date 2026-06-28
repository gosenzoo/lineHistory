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

function prevDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d - 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
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
  const [date, setDate]           = useState(event.date)
  const [orderIndex, setOrderIndex] = useState(event.orderIndex)
  const [label, setLabel]         = useState(event.label)

  // line_open: animation direction (stored in LineGeometry)
  const lineGeo   = event.type === 'line_open' ? data.geometries.find(g => g.lineId === event.lineId) : null
  const [animDir, setAnimDir] = useState<'start' | 'end'>(lineGeo?.animDirection ?? 'start')

  const loStationIds   = event.type === 'line_open' ? event.stationIds : []
  const startStName    = data.stations.find(s => s.id === loStationIds[0])?.name ?? '始点'
  const endStName      = data.stations.find(s => s.id === loStationIds[loStationIds.length - 1])?.name ?? '終点'

  // line_extend: extension direction + anim from
  const [extDir, setExtDir] = useState<'start' | 'end'>(
    event.type === 'line_extend' ? event.direction : 'end'
  )
  const extGeo = event.type === 'line_extend' ? data.geometries.find(g => g.lineId === event.lineId) : null
  const [extAnimFrom, setExtAnimFrom] = useState<'junction' | 'tip'>(extGeo?.extAnimFrom ?? 'junction')

  // line_close: anim direction
  const clGeo = event.type === 'line_close' ? data.geometries.find(g => g.lineId === event.lineId) : null
  const [closeAnimDir, setCloseAnimDir] = useState<'start' | 'end'>(clGeo?.closeAnimDirection ?? 'end')

  // station names for extend anim UI (use event's own date as preview basis)
  const extLineStationIds = event.type === 'line_extend'
    ? (() => {
        const ms = computeMapState(data.stations, data.lines, data.events, prevDay(event.date))
        return ms.activeLines.find(al => al.line.id === event.lineId)?.stationIds ?? []
      })()
    : []
  const junctionStName = event.type === 'line_extend'
    ? data.stations.find(s => s.id === (extDir === 'end'
        ? extLineStationIds[extLineStationIds.length - 1]
        : extLineStationIds[0]))?.name ?? '接続点'
    : ''
  const tipStName = event.type === 'line_extend'
    ? data.stations.find(s => s.id === event.stationIds[extDir === 'end' ? event.stationIds.length - 1 : 0])?.name ?? '新端駅'
    : ''

  // station names for close anim UI
  const clLineStationIds = event.type === 'line_close'
    ? (() => {
        const ms = computeMapState(data.stations, data.lines, data.events, prevDay(event.date))
        return ms.activeLines.find(al => al.line.id === event.lineId)?.stationIds ?? []
      })()
    : []
  const clStartStName = data.stations.find(s => s.id === clLineStationIds[0])?.name ?? '始点'
  const clEndStName   = data.stations.find(s => s.id === clLineStationIds[clLineStationIds.length - 1])?.name ?? '終点'

  // station_open: after-station (insertion position)
  const [afterStationId, setAfterStationId] = useState<string | null>(
    event.type === 'station_open' ? event.afterStationId : null
  )

  const stationsBeforeEvent = (() => {
    if (event.type !== 'station_open') return []
    const ms = computeMapState(data.stations, data.lines, data.events, prevDay(event.date))
    const stationIds = ms.activeLines.find(al => al.line.id === event.lineId)?.stationIds ?? []
    return stationIds.map(id => data.stations.find(s => s.id === id)).filter(Boolean) as typeof data.stations
  })()

  function handleSave() {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      alert('日付を正しく入力してください')
      return
    }

    let updatedEvent: RailwayEvent
    switch (event.type) {
      case 'line_open':
        updatedEvent = { ...event, date, orderIndex, label }
        break
      case 'station_open':
        updatedEvent = { ...event, date, orderIndex, label, afterStationId }
        break
      case 'line_extend':
        updatedEvent = { ...event, date, orderIndex, label, direction: extDir }
        break
      default:
        updatedEvent = { ...event, date, orderIndex, label }
    }

    const newEvents = data.events
      .map(e => e.id === event.id ? updatedEvent : e)
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date)
        return d !== 0 ? d : a.orderIndex - b.orderIndex
      })

    let newGeometries = data.geometries
    const updateGeo = (lineId: string, patch: Partial<import('@/lib/types').LineGeometry>) => {
      const exists = newGeometries.some(g => g.lineId === lineId)
      newGeometries = exists
        ? newGeometries.map(g => g.lineId === lineId ? { ...g, ...patch } : g)
        : [...newGeometries, { lineId, segments: [], ...patch }]
    }
    if (event.type === 'line_open')   updateGeo(event.lineId, { animDirection: animDir })
    if (event.type === 'line_extend') updateGeo(event.lineId, { extAnimFrom })
    if (event.type === 'line_close')  updateGeo(event.lineId, { closeAnimDirection: closeAnimDir })

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

      {/* Date + orderIndex + label */}
      <div className="flex gap-3">
        <div className="w-40 shrink-0">
          <Label>日付</Label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:border-blue-400 outline-none"
          />
        </div>
        <div className="w-20 shrink-0">
          <Label>順番</Label>
          <input
            type="number"
            min={0}
            value={orderIndex}
            onChange={e => setOrderIndex(Math.max(0, parseInt(e.target.value) || 0))}
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

      {/* line_extend: extension direction + anim */}
      {event.type === 'line_extend' && (
        <>
          <div>
            <Label>延伸方向</Label>
            <ToggleGroup value={extDir} onChange={setExtDir}
              options={[
                { value: 'start', label: '始点方向に延伸' },
                { value: 'end',   label: '終点方向に延伸' },
              ]} />
          </div>
          <div>
            <Label>アニメーション開始端</Label>
            <ToggleGroup value={extAnimFrom} onChange={setExtAnimFrom}
              options={[
                { value: 'junction', label: junctionStName },
                { value: 'tip',      label: tipStName },
              ]} />
          </div>
        </>
      )}

      {/* line_close: anim direction */}
      {event.type === 'line_close' && (
        <div>
          <Label>消去開始端</Label>
          <ToggleGroup value={closeAnimDir} onChange={setCloseAnimDir}
            options={[
              { value: 'start', label: clStartStName },
              { value: 'end',   label: clEndStName },
            ]} />
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
