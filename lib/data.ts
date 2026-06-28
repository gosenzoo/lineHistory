import type { Station, Line, RailwayEvent } from './types'

export const stations: Station[] = [
  { id: 'shin-nishi', name: '新西駅', x: 90,  y: 280 },
  { id: 'nishi',      name: '西駅',   x: 230, y: 280 },
  { id: 'chuo',       name: '中央駅', x: 430, y: 280 },
  { id: 'minami',     name: '南駅',   x: 540, y: 410 },
  { id: 'higashi',    name: '東駅',   x: 690, y: 280 },
  { id: 'kita',       name: '北駅',   x: 430, y: 120 },
]

export const lines: Line[] = [
  { id: 'tousen',     name: '東線',   color: '#EF4444' },
  { id: 'shin-tousen', name: '新東線', color: '#F97316' },
  { id: 'hokusen',   name: '北線',   color: '#3B82F6' },
]

export const events: RailwayEvent[] = [
  {
    id: 'e1',
    date: '1900',
    type: 'line_open',
    lineId: 'tousen',
    stationIds: ['nishi', 'chuo', 'higashi'],
    label: '東線 開業（西駅〜東駅）',
  },
  {
    id: 'e2',
    date: '1905',
    type: 'station_open',
    stationId: 'minami',
    lineId: 'tousen',
    afterStationId: 'chuo',
    label: '南駅 開業（東線・中央駅〜東駅間）',
  },
  {
    id: 'e3',
    date: '1910',
    type: 'line_extend',
    lineId: 'tousen',
    stationIds: ['shin-nishi'],
    direction: 'start',
    label: '東線 延伸（新西駅まで延伸）',
  },
  {
    id: 'e4',
    date: '1920',
    type: 'line_open',
    lineId: 'hokusen',
    stationIds: ['kita', 'chuo'],
    label: '北線 開業（北駅〜中央駅）',
  },
  {
    id: 'e5',
    date: '1935',
    type: 'section_replace',
    oldLineId: 'tousen',
    newLines: [
      { lineId: 'tousen',      stationIds: ['shin-nishi', 'nishi', 'chuo'] },
      { lineId: 'shin-tousen', stationIds: ['chuo', 'minami', 'higashi'] },
    ],
    label: '東線を分割改編：中央駅〜東駅間が新東線として独立',
  },
  {
    id: 'e6',
    date: '1950',
    type: 'station_close',
    stationId: 'minami',
    lineIds: ['shin-tousen'],
    label: '南駅 廃駅（新東線）',
  },
  {
    id: 'e7',
    date: '1960',
    type: 'line_close',
    lineId: 'hokusen',
    label: '北線 廃線',
  },
]

export const MIN_YEAR = 1895
export const MAX_YEAR = 1965
