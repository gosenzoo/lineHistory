'use client'

import { useLayoutEffect, useRef } from 'react'
import type { MapState, Station, LineGeometry } from '@/lib/types'
import { buildLinePoints, catmullRomPath } from '@/lib/geometry'
import params from '@/paramSettings'

// ── animation helpers ─────────────────────────────────────────────────────────

const ANIM_MS           = params.animDurationMs
const STATION_APPEAR_MS = params.stationAppearMs
const STATION_ARRIVE_MS = params.stationArriveMs

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

// Find the arc-length along `path` closest to (x, y).
function findDistOnPath(path: SVGPathElement, x: number, y: number): number {
  const total = path.getTotalLength()
  const N = 300
  let best = 0
  let bestSq = Infinity
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * total
    const p = path.getPointAtLength(d)
    const sq = (p.x - x) ** 2 + (p.y - y) ** 2
    if (sq < bestSq) { bestSq = sq; best = d }
  }
  let lo = Math.max(0, best - total / N)
  let hi = Math.min(total, best + total / N)
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    const p1 = path.getPointAtLength(m1)
    const p2 = path.getPointAtLength(m2)
    if ((p1.x - x) ** 2 + (p1.y - y) ** 2 < (p2.x - x) ** 2 + (p2.y - y) ** 2) hi = m2
    else lo = m1
  }
  return (lo + hi) / 2
}

// Scale a station <g> around its center point using SVG transform.
function stationScaleTransform(x: number, y: number, scale: number): string {
  if (scale >= 1) return ''
  return `translate(${x},${y}) scale(${scale}) translate(${-x},${-y})`
}

// ── types ─────────────────────────────────────────────────────────────────────

interface StationPos { x: number; y: number }

interface LineAnim {
  startTime: number
  totalLength: number
  animDirection: 'start' | 'end'
  forwardPathD: string
  // Phase A: start station
  startStationId: string
  phaseAMs: number                         // 0 if start station is not new
  // Phase B: intermediate / end stations
  stationPositions: Map<string, StationPos>
  newStationIds: Set<string>
  stationDistances: Map<string, number>
  stationAppearTimes: Map<string, number>  // filled during RAF as line reaches each station
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  stations: Station[]
  mapState: MapState
  geometries: LineGeometry[]
  animated?: boolean
}

export default function MapView({ stations, mapState, geometries, animated = false }: Props) {
  const stationMap = new Map(stations.map(s => [s.id, s]))

  const pathRefs    = useRef<Map<string, SVGPathElement>>(new Map())
  const stationRefs = useRef<Map<string, SVGGElement>>(new Map())

  const lineAnimRef       = useRef<Map<string, LineAnim>>(new Map())
  const prevLineIdsRef    = useRef<Set<string>>(new Set())
  const prevStationIdsRef = useRef<Set<string>>(new Set())
  const rafRef            = useRef<number | null>(null)

  // ── RAF loop ────────────────────────────────────────────────────────────────

  function runRaf() {
    if (rafRef.current !== null) return

    function setStationScale(sid: string, scale: number, positions: Map<string, StationPos>) {
      const el  = stationRefs.current.get(sid)
      const pos = positions.get(sid)
      if (!el || !pos) return
      const tr = stationScaleTransform(pos.x, pos.y, scale)
      if (tr) el.setAttribute('transform', tr)
      else    el.removeAttribute('transform')
    }

    function frame() {
      const now = performance.now()
      let anyActive = false

      for (const [lineId, anim] of lineAnimRef.current) {
        const elapsed = now - anim.startTime
        // Total time = phaseA + lineDraw + last station arrive animation
        const TOTAL_MS = anim.phaseAMs + ANIM_MS + STATION_ARRIVE_MS

        const pathEl = pathRefs.current.get(lineId)

        // ── Phase A: start station appears ──────────────────────────────────
        if (anim.phaseAMs > 0) {
          const scaleT = easeOut(Math.min(1, elapsed / anim.phaseAMs))
          setStationScale(anim.startStationId, scaleT, anim.stationPositions)
        }

        // ── Phase B: line draws + stations arrive ───────────────────────────
        const lineElapsed = Math.max(0, elapsed - anim.phaseAMs)
        const lineT       = Math.min(1, lineElapsed / ANIM_MS)
        const drawn       = anim.totalLength * easeInOut(lineT)

        if (pathEl) pathEl.style.strokeDashoffset = String(anim.totalLength - drawn)

        for (const [sid, dist] of anim.stationDistances) {
          if (sid === anim.startStationId && anim.phaseAMs > 0) continue
          if (!anim.newStationIds.has(sid)) continue

          // Trigger station's appear animation when line reaches it
          if (drawn >= dist && !anim.stationAppearTimes.has(sid)) {
            anim.stationAppearTimes.set(sid, now)
          }
          const appearStart = anim.stationAppearTimes.get(sid)
          if (appearStart !== undefined) {
            const scaleT = easeOut(Math.min(1, (now - appearStart) / STATION_ARRIVE_MS))
            setStationScale(sid, scaleT, anim.stationPositions)
          }
        }

        // ── Completion check ─────────────────────────────────────────────────
        if (elapsed >= TOTAL_MS) {
          if (pathEl) {
            if (anim.animDirection === 'end') pathEl.setAttribute('d', anim.forwardPathD)
            pathEl.style.strokeDasharray  = ''
            pathEl.style.strokeDashoffset = ''
          }
          for (const sid of anim.newStationIds) {
            setStationScale(sid, 1, anim.stationPositions)
          }
          lineAnimRef.current.delete(lineId)
        } else {
          anyActive = true
        }
      }

      rafRef.current = anyActive ? requestAnimationFrame(frame) : null
    }

    rafRef.current = requestAnimationFrame(frame)
  }

  function stopRaf() {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  // ── Detect mapState changes and start animations ──────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const currentLineIds    = new Set(mapState.activeLines.map(al => al.line.id))
    const currentStationIds = mapState.activeStationIds

    if (!animated) {
      stopRaf()
      for (const [lineId, anim] of lineAnimRef.current) {
        const p = pathRefs.current.get(lineId)
        if (p) {
          if (anim.animDirection === 'end') p.setAttribute('d', anim.forwardPathD)
          p.style.strokeDasharray  = ''
          p.style.strokeDashoffset = ''
        }
        for (const sid of anim.newStationIds) {
          const el = stationRefs.current.get(sid)
          if (el) { el.removeAttribute('transform'); el.style.visibility = 'visible' }
        }
      }
      lineAnimRef.current = new Map()
      prevLineIdsRef.current    = currentLineIds
      prevStationIdsRef.current = new Set(currentStationIds)
      return
    }

    const newLineIds    = [...currentLineIds].filter(id => !prevLineIdsRef.current.has(id))
    const newStationIds = new Set([...currentStationIds].filter(id => !prevStationIdsRef.current.has(id)))

    prevLineIdsRef.current    = currentLineIds
    prevStationIdsRef.current = new Set(currentStationIds)

    if (newLineIds.length === 0) return

    for (const lineId of newLineIds) {
      const pathEl = pathRefs.current.get(lineId)
      if (!pathEl) continue

      const geo           = geometries.find(g => g.lineId === lineId)
      const animDirection = geo?.animDirection ?? 'start'
      const activeLine    = mapState.activeLines.find(al => al.line.id === lineId)!

      const forwardPathD = pathEl.getAttribute('d') ?? ''

      if (animDirection === 'end') {
        const reversedPts = buildLinePoints(activeLine.stationIds, stationMap, geo).reverse()
        pathEl.setAttribute('d', catmullRomPath(reversedPts))
      }

      const totalLength = pathEl.getTotalLength()
      pathEl.style.strokeDasharray  = String(totalLength)
      pathEl.style.strokeDashoffset = String(totalLength)

      const stationDistances = new Map<string, number>()
      for (const sid of activeLine.stationIds) {
        const st = stationMap.get(sid)
        if (st) stationDistances.set(sid, findDistOnPath(pathEl, st.x, st.y))
      }

      const lineNewStations = new Set(activeLine.stationIds.filter(id => newStationIds.has(id)))

      // Build stationPositions for all new stations
      const stationPositions = new Map<string, StationPos>()
      for (const sid of lineNewStations) {
        const st = stationMap.get(sid)
        if (st) stationPositions.set(sid, { x: st.x, y: st.y })
      }

      // Determine which station the animation starts from
      const ids = activeLine.stationIds
      const startStationId = animDirection === 'end' ? ids[ids.length - 1] : ids[0]

      // Hide all new stations at scale 0 (instead of visibility:hidden)
      for (const sid of lineNewStations) {
        const el = stationRefs.current.get(sid)
        const pos = stationPositions.get(sid)
        if (el && pos) {
          el.style.visibility = 'visible'
          el.setAttribute('transform', stationScaleTransform(pos.x, pos.y, 0))
        }
      }

      const phaseAMs = lineNewStations.has(startStationId) ? STATION_APPEAR_MS : 0

      lineAnimRef.current.set(lineId, {
        startTime: performance.now(),
        totalLength,
        animDirection,
        forwardPathD,
        startStationId,
        phaseAMs,
        stationPositions,
        newStationIds: lineNewStations,
        stationDistances,
        stationAppearTimes: new Map(),
      })
    }

    runRaf()
  }, [mapState, animated])

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <svg
      viewBox="0 0 800 550"
      className="w-full h-full"
      style={{ background: '#0f172a' }}
    >
      {/* Lines */}
      {mapState.activeLines.map(({ line, stationIds }) => {
        const geo = geometries.find(g => g.lineId === line.id)
        const pts = buildLinePoints(stationIds, stationMap, geo)
        return (
          <path
            key={line.id}
            ref={el => { el ? pathRefs.current.set(line.id, el) : pathRefs.current.delete(line.id) }}
            d={catmullRomPath(pts)}
            fill="none"
            stroke={line.color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}

      {/* Stations */}
      {stations
        .filter(s => mapState.activeStationIds.has(s.id))
        .map(station => (
          <g
            key={station.id}
            ref={el => { el ? stationRefs.current.set(station.id, el) : stationRefs.current.delete(station.id) }}
          >
            <circle cx={station.x} cy={station.y} r={8} fill="white" stroke="#334155" strokeWidth={2} />
            <text
              x={station.x}
              y={station.y - 14}
              textAnchor="middle"
              fontSize={13}
              fill="white"
              fontFamily="sans-serif"
            >
              {station.name}
            </text>
          </g>
        ))}

      {/* Legend */}
      <g transform="translate(20, 460)">
        <rect
          x={0} y={0}
          width={160} height={mapState.activeLines.length * 24 + 12}
          rx={6} fill="#1e293b" opacity={0.9}
        />
        {mapState.activeLines.map(({ line }, i) => (
          <g key={line.id} transform={`translate(10, ${i * 24 + 16})`}>
            <line x1={0} y1={0} x2={20} y2={0} stroke={line.color} strokeWidth={4} strokeLinecap="round" />
            <text x={28} y={5} fontSize={12} fill="white" fontFamily="sans-serif">{line.name}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}
