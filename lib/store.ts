import type { RailwayData, RailwayEvent } from './types'
import { stations as defaultStations, lines as defaultLines, events as defaultEvents } from './data'

const STORAGE_KEY = 'railway-data-v1'

function defaultData(): RailwayData {
  return {
    stations: [...defaultStations],
    lines: [...defaultLines],
    events: [...defaultEvents],
    geometries: [],
  }
}

// 旧フォーマット (年のみ "1950") を YYYY-MM-DD に変換し、orderIndex を付番
function migrateEvents(events: RailwayEvent[]): RailwayEvent[] {
  // 既存の順序を保ったまま date を正規化
  const normalized = events.map(e => ({
    ...e,
    date: /^\d{4}$/.test(e.date) ? `${e.date}-01-01` : e.date,
  }))
  // date → orderIndex でソート
  normalized.sort((a, b) => {
    const d = a.date.localeCompare(b.date)
    return d !== 0 ? d : (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
  })
  // orderIndex が欠けている場合は同日内での連番を振り直す
  const countByDate: Record<string, number> = {}
  return normalized.map(e => {
    if (e.orderIndex !== undefined) return e
    countByDate[e.date] = (countByDate[e.date] ?? 0)
    const idx = countByDate[e.date]++
    return { ...e, orderIndex: idx }
  })
}

export function loadData(): RailwayData {
  if (typeof window === 'undefined') return defaultData()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RailwayData>
      return {
        stations:   parsed.stations   ?? defaultData().stations,
        lines:      parsed.lines      ?? defaultData().lines,
        events:     parsed.events     ? migrateEvents(parsed.events as RailwayEvent[]) : defaultData().events,
        geometries: parsed.geometries ?? [],
        background: parsed.background,
        canvas:     parsed.canvas,
      }
    }
  } catch {}
  return defaultData()
}

export function saveData(data: RailwayData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function resetData(): void {
  localStorage.removeItem(STORAGE_KEY)
}
