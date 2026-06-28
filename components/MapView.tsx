'use client'

import { useLayoutEffect, useRef } from 'react'
import type { MapState, Station, LineGeometry } from '@/lib/types'
import { buildLinePoints, catmullRomPath } from '@/lib/geometry'
import params from '@/paramSettings'

// ── animation helpers ─────────────────────────────────────────────────────────

const ANIM_MS = params.animDurationMs

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3
}

// Find the arc-length along `path` closest to (x, y).
// Catmull-Rom passes exactly through station coords, so the minimum distance → 0.
function findDistOnPath(path: SVGPathElement, x: number, y: number): number {
  const total = path.getTotalLength()
  // Coarse scan
  const N = 300
  let best = 0
  let bestSq = Infinity
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * total
    const p = path.getPointAtLength(d)
    const sq = (p.x - x) ** 2 + (p.y - y) ** 2
    if (sq < bestSq) { bestSq = sq; best = d }
  }
  // Ternary-search refinement in the winning neighbourhood
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

// ── types ─────────────────────────────────────────────────────────────────────

interface LineAnim {
  startTime: number
  totalLength: number
  animDirection: 'start' | 'end'
  newStationIds: Set<string>           // stations to hide until line reaches them
  stationDistances: Map<string, number> // stationId → arc distance from path start
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  stations: Station[]
  mapState: MapState
  geometries: LineGeometry[]
  animated?: boolean  // false while scrubbing → instant, true while playing → draw animation
}

export default function MapView({ stations, mapState, geometries, animated = false }: Props) {
  const stationMap = new Map(stations.map(s => [s.id, s]))

  // DOM refs – stable across renders
  const pathRefs    = useRef<Map<string, SVGPathElement>>(new Map())
  const stationRefs = useRef<Map<string, SVGGElement>>(new Map())

  // Animation book-keeping (all in refs, no setState per frame)
  const lineAnimRef       = useRef<Map<string, LineAnim>>(new Map())
  const prevLineIdsRef    = useRef<Set<string>>(new Set())
  const prevStationIdsRef = useRef<Set<string>>(new Set())
  const rafRef            = useRef<number | null>(null)

  // ── RAF loop ────────────────────────────────────────────────────────────────

  function runRaf() {
    if (rafRef.current !== null) return  // already running

    function frame() {
      const now = performance.now()
      let anyActive = false

      for (const [lineId, anim] of lineAnimRef.current) {
        const rawT    = (now - anim.startTime) / ANIM_MS
        const t       = Math.min(1, rawT)
        const drawn   = anim.totalLength * easeOut(t)

        const pathEl = pathRefs.current.get(lineId)
        if (pathEl) {
          if (anim.animDirection === 'end') {
            // Draw from the end: grow a dash at the tail while the leading gap shrinks
            const gap = anim.totalLength - drawn
            pathEl.style.strokeDasharray  = `0 ${gap} ${drawn}`
            pathEl.style.strokeDashoffset = '0'
          } else {
            // Draw from the start: standard dashoffset trick
            pathEl.style.strokeDashoffset = String(anim.totalLength - drawn)
          }
        }

        // Reveal stations as the line reaches them.
        // For 'end' direction, a station at arc-distance d from start is reached
        // when the drawn tail has grown past (totalLength - d) from the end.
        for (const [sid, dist] of anim.stationDistances) {
          const threshold = anim.animDirection === 'end'
            ? anim.totalLength - dist
            : dist
          if (anim.newStationIds.has(sid) && drawn >= threshold) {
            const el = stationRefs.current.get(sid)
            if (el) el.style.visibility = 'visible'
          }
        }

        if (t < 1) {
          anyActive = true
        } else {
          // Finished: strip dasharray so the element returns to normal
          if (pathEl) { pathEl.style.strokeDasharray = ''; pathEl.style.strokeDashoffset = '' }
          for (const sid of anim.newStationIds) {
            const el = stationRefs.current.get(sid)
            if (el) el.style.visibility = 'visible'
          }
          lineAnimRef.current.delete(lineId)
        }
      }

      rafRef.current = anyActive ? requestAnimationFrame(frame) : null
    }

    rafRef.current = requestAnimationFrame(frame)
  }

  function stopRaf() {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  // ── Detect mapState changes and start animations ─────────────────────────────
  // useLayoutEffect fires before paint → paths are in DOM but not yet painted,
  // so we can set dashoffset = totalLength to hide them before the first frame.

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const currentLineIds    = new Set(mapState.activeLines.map(al => al.line.id))
    const currentStationIds = mapState.activeStationIds

    if (!animated) {
      // Scrub mode: cancel in-flight animations and restore DOM immediately
      stopRaf()
      for (const [lineId, anim] of lineAnimRef.current) {
        const p = pathRefs.current.get(lineId)
        if (p) { p.style.strokeDasharray = ''; p.style.strokeDashoffset = '' }
        for (const sid of anim.newStationIds) {
          const el = stationRefs.current.get(sid)
          if (el) el.style.visibility = 'visible'
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

      const totalLength    = pathEl.getTotalLength()
      const geo            = geometries.find(g => g.lineId === lineId)
      const animDirection  = geo?.animDirection ?? 'start'

      // Hide path before first paint
      if (animDirection === 'end') {
        pathEl.style.strokeDasharray  = `0 ${totalLength} 0`
        pathEl.style.strokeDashoffset = '0'
      } else {
        pathEl.style.strokeDasharray  = String(totalLength)
        pathEl.style.strokeDashoffset = String(totalLength)
      }

      // Measure arc distance for each station on this line
      const activeLine       = mapState.activeLines.find(al => al.line.id === lineId)!
      const stationDistances = new Map<string, number>()
      for (const sid of activeLine.stationIds) {
        const st = stationMap.get(sid)
        if (st) stationDistances.set(sid, findDistOnPath(pathEl, st.x, st.y))
      }

      // Hide stations that are truly new (not already on another active line)
      const lineNewStations = new Set(activeLine.stationIds.filter(id => newStationIds.has(id)))
      for (const sid of lineNewStations) {
        const el = stationRefs.current.get(sid)
        if (el) el.style.visibility = 'hidden'
      }

      lineAnimRef.current.set(lineId, {
        startTime: performance.now(),
        totalLength,
        animDirection,
        newStationIds: lineNewStations,
        stationDistances,
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
