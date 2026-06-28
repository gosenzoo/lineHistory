'use client'

import type { RailwayEvent } from '@/lib/types'

const TYPE_LABELS: Record<RailwayEvent['type'], string> = {
  line_open:       '路線開業',
  station_open:    '駅開業',
  line_extend:     '路線延伸',
  line_close:      '廃線',
  station_close:   '廃駅',
  section_replace: '区間改編',
}

const TYPE_COLORS: Record<RailwayEvent['type'], string> = {
  line_open:       'bg-green-700 text-green-100',
  station_open:    'bg-teal-700 text-teal-100',
  line_extend:     'bg-blue-700 text-blue-100',
  line_close:      'bg-red-800 text-red-100',
  station_close:   'bg-orange-800 text-orange-100',
  section_replace: 'bg-purple-700 text-purple-100',
}

interface Props {
  events: RailwayEvent[]
  currentYear: number
}

export default function EventLog({ events, currentYear }: Props) {
  const yearEvents = events.filter(e => parseInt(e.date.slice(0, 4)) === currentYear)

  return (
    <aside className="w-64 bg-slate-900 border-l border-slate-700 flex flex-col">
      <div className="px-4 py-3 border-b border-slate-700">
        <h2 className="text-slate-100 font-bold">{currentYear}年</h2>
        <p className="text-slate-400 text-xs mt-0.5">
          {yearEvents.length === 0 ? 'イベントなし' : `${yearEvents.length}件のイベント`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {yearEvents.map(event => (
          <div key={event.id} className="bg-slate-800 rounded-lg p-3 space-y-1.5">
            <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${TYPE_COLORS[event.type]}`}>
              {TYPE_LABELS[event.type]}
            </span>
            <p className="text-slate-200 text-sm leading-snug">{event.label}</p>
          </div>
        ))}
      </div>
    </aside>
  )
}
