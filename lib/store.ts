import type { RailwayData } from './types'
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

export function loadData(): RailwayData {
  if (typeof window === 'undefined') return defaultData()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RailwayData>
      return {
        stations:   parsed.stations   ?? defaultData().stations,
        lines:      parsed.lines      ?? defaultData().lines,
        events:     parsed.events     ?? defaultData().events,
        geometries: parsed.geometries ?? [],
        background: parsed.background,
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
