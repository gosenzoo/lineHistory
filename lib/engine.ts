import type { Station, Line, RailwayEvent, MapState, ActiveLine } from './types'

function sortEvents(events: RailwayEvent[]): RailwayEvent[] {
  return [...events].sort((a, b) => {
    const d = a.date.localeCompare(b.date)
    return d !== 0 ? d : a.orderIndex - b.orderIndex
  })
}

// upToDate: YYYY-MM-DD inclusive
// upToOrderIndex: same-date events with orderIndex > this value are excluded (undefined = include all)
export function computeMapState(
  _stations: Station[],
  lines: Line[],
  events: RailwayEvent[],
  upToDate: string,
  upToOrderIndex?: number
): MapState {
  const lineMap = new Map(lines.map(l => [l.id, l]))

  const filtered = sortEvents(events.filter(e => {
    if (e.date < upToDate) return true
    if (e.date === upToDate) return upToOrderIndex === undefined || e.orderIndex <= upToOrderIndex
    return false
  }))

  const activeLinesMap = new Map<string, string[]>()

  for (const event of filtered) {
    switch (event.type) {
      case 'line_open':
        activeLinesMap.set(event.lineId, [...event.stationIds])
        break

      case 'station_open': {
        const list = activeLinesMap.get(event.lineId)
        if (list) {
          if (event.afterStationId === null) {
            list.unshift(event.stationId)
          } else {
            const idx = list.indexOf(event.afterStationId)
            if (idx !== -1) list.splice(idx + 1, 0, event.stationId)
          }
        }
        break
      }

      case 'line_extend': {
        const list = activeLinesMap.get(event.lineId)
        if (list) {
          if (event.direction === 'end') {
            list.push(...event.stationIds)
          } else {
            list.unshift(...event.stationIds)
          }
        }
        break
      }

      case 'line_close':
        activeLinesMap.delete(event.lineId)
        break

      case 'station_close': {
        const targetLines = event.lineIds ?? [...activeLinesMap.keys()]
        for (const lineId of targetLines) {
          const list = activeLinesMap.get(lineId)
          if (list) {
            const idx = list.indexOf(event.stationId)
            if (idx !== -1) list.splice(idx, 1)
          }
        }
        break
      }

      case 'section_replace': {
        activeLinesMap.delete(event.oldLineId)
        for (const { lineId, stationIds } of event.newLines) {
          activeLinesMap.set(lineId, [...stationIds])
        }
        break
      }
    }
  }

  const activeStationIds = new Set<string>()
  activeLinesMap.forEach(stationIds => stationIds.forEach(id => activeStationIds.add(id)))

  const activeLines: ActiveLine[] = []
  activeLinesMap.forEach((stationIds, lineId) => {
    const line = lineMap.get(lineId)
    if (line) activeLines.push({ line, stationIds })
  })

  return { activeLines, activeStationIds }
}

export function getEventsForYear(events: RailwayEvent[], year: number): RailwayEvent[] {
  return sortEvents(events.filter(e => e.date.slice(0, 4) === String(year)))
}
