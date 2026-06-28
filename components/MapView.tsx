'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import type { MapState, Station, LineGeometry, BackgroundImage, CanvasExpansion } from '@/lib/types'
import { buildLinePoints, catmullRomPath } from '@/lib/geometry'
import params from '@/paramSettings'

// ── animation constants ───────────────────────────────────────────────────────

const ANIM_MS           = params.animDurationMs
const STATION_APPEAR_MS = params.stationAppearMs
const STATION_ARRIVE_MS = params.stationArriveMs

// ── helpers ───────────────────────────────────────────────────────────────────

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

function findDistOnPath(path: SVGPathElement, x: number, y: number): number {
  const total = path.getTotalLength()
  const N = 300
  let best = 0, bestSq = Infinity
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * total
    const p = path.getPointAtLength(d)
    const sq = (p.x - x) ** 2 + (p.y - y) ** 2
    if (sq < bestSq) { bestSq = sq; best = d }
  }
  let lo = Math.max(0, best - total / N)
  let hi = Math.min(total, best + total / N)
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
    const p1 = path.getPointAtLength(m1), p2 = path.getPointAtLength(m2)
    if ((p1.x - x) ** 2 + (p1.y - y) ** 2 < (p2.x - x) ** 2 + (p2.y - y) ** 2) hi = m2
    else lo = m1
  }
  return (lo + hi) / 2
}

function scaleTransform(x: number, y: number, s: number): string {
  return s >= 1 ? '' : `translate(${x},${y}) scale(${s}) translate(${-x},${-y})`
}

// ── types ─────────────────────────────────────────────────────────────────────

interface StationPos { x: number; y: number }

// open / extend: drawn 0→totalLength  |  close: drawn totalLength→0
type AnimKind = 'open' | 'extend' | 'close'

interface LineAnim {
  kind: AnimKind
  startTime: number
  totalLength: number
  forwardPathD: string
  reversed: boolean          // path was reversed at setup
  // extend only: keep existing portion visible via dasharray
  existingLen: number        // 0 for open/close
  extAnimFrom: 'junction' | 'tip'  // only meaningful for 'extend'
  // phase A: start/tip station appears before line draws (open/extend)
  startStationId: string
  phaseAMs: number           // 0 if start station is not new (or close)
  stationPositions: Map<string, StationPos>
  affectedStationIds: Set<string>     // new stations (open/extend) or disappearing (close)
  stationDistances: Map<string, number>
  stationAppearTimes: Map<string, number>
}

// ghost path rendered while a line is closing
interface ClosingLine {
  animId: string
  lineId: string
  color: string
  pathD: string              // forward d (before possible reversal)
  reversed: boolean
  totalLength: number
  animDirection: 'start' | 'end'
  stationIds: string[]       // stations that disappear
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  stations: Station[]
  mapState: MapState
  geometries: LineGeometry[]
  background?: BackgroundImage
  canvas?: CanvasExpansion
  animated?: boolean
}

export default function MapView({ stations, mapState, geometries, background, canvas, animated = false }: Props) {
  const stationMap = new Map(stations.map(s => [s.id, s]))

  const pathRefs         = useRef<Map<string, SVGPathElement>>(new Map())
  const closingPathRefs  = useRef<Map<string, SVGPathElement>>(new Map())
  const stationRefs      = useRef<Map<string, SVGGElement>>(new Map())

  const lineAnimRef            = useRef<Map<string, LineAnim>>(new Map())
  const prevLineIdsRef         = useRef<Set<string>>(new Set())
  const prevStationIdsRef      = useRef<Set<string>>(new Set())
  const prevLineStationIdsRef  = useRef<Map<string, string[]>>(new Map())
  const rafRef                 = useRef<number | null>(null)

  const [closingLines, setClosingLines] = useState<ClosingLine[]>([])

  const cameraGroupRef = useRef<SVGGElement>(null)
  const cameraXRef     = useRef(0)   // current translate X (SVG coords)
  const cameraYRef     = useRef(0)   // current translate Y
  const vbParamsRef    = useRef({ vbX: 0, vbY: 0, vbW: 800, vbH: 550 })

  // ── RAF ──────────────────────────────────────────────────────────────────────

  function runRaf() {
    if (rafRef.current !== null) return

    function setStationScale(sid: string, scale: number, pos: Map<string, StationPos>) {
      const el = stationRefs.current.get(sid)
      const p  = pos.get(sid)
      if (!el || !p) return
      const tr = scaleTransform(p.x, p.y, scale)
      if (tr) el.setAttribute('transform', tr)
      else    el.removeAttribute('transform')
    }

    function frame() {
      const now = performance.now()
      let anyActive = false
      const cameraTips: { x: number; y: number }[] = []

      for (const [elemId, anim] of lineAnimRef.current) {
        const elapsed  = now - anim.startTime
        const TOTAL_MS = anim.phaseAMs + ANIM_MS + STATION_ARRIVE_MS

        // resolve which DOM path element to use
        const pathEl = anim.kind === 'close'
          ? closingPathRefs.current.get(elemId)
          : pathRefs.current.get(elemId)

        // ── Phase A: start station appears (open/extend) ──────────────────────
        if (anim.phaseAMs > 0) {
          const s = easeOut(Math.min(1, elapsed / anim.phaseAMs))
          setStationScale(anim.startStationId, s, anim.stationPositions)
        }

        // ── Line animation ─────────────────────────────────────────────────────
        const lineElapsed = Math.max(0, elapsed - anim.phaseAMs)
        const lineT       = Math.min(1, lineElapsed / ANIM_MS)
        const progress    = easeInOut(lineT)  // 0→1

        if (pathEl) {
          if (anim.kind === 'close') {
            // erase: drawn goes totalLength→0
            const drawn = anim.totalLength * (1 - progress)
            pathEl.style.strokeDashoffset = String(anim.totalLength - drawn)
          } else if (anim.kind === 'extend') {
            const extensionLen = anim.totalLength - anim.existingLen
            const drawn = extensionLen * progress
            if (anim.extAnimFrom === 'tip') {
              // 3-value dasharray: existing | gap shrinking from junction | new segment growing from tip
              pathEl.style.strokeDasharray = `${anim.existingLen} ${Math.max(0, extensionLen - drawn)} ${drawn}`
            } else {
              pathEl.style.strokeDasharray = `${anim.existingLen + drawn} 99999`
            }
          } else {
            // open: standard
            const drawn = anim.totalLength * progress
            pathEl.style.strokeDashoffset = String(anim.totalLength - drawn)
          }
        }

        // ── Station animations ────────────────────────────────────────────────
        for (const [sid, dist] of anim.stationDistances) {
          if (sid === anim.startStationId && anim.phaseAMs > 0) continue
          if (!anim.affectedStationIds.has(sid)) continue

          if (anim.kind === 'close') {
            // disappear when erase front reaches station
            const drawn = anim.totalLength * (1 - progress)
            if (drawn < dist && !anim.stationAppearTimes.has(sid)) {
              anim.stationAppearTimes.set(sid, now)
            }
            const t = anim.stationAppearTimes.get(sid)
            if (t !== undefined) {
              const s = easeOut(Math.max(0, 1 - (now - t) / STATION_ARRIVE_MS))
              setStationScale(sid, s, anim.stationPositions)
            }
          } else {
            // appear when line reaches station
            const drawn = anim.kind === 'extend'
              ? (anim.totalLength - anim.existingLen) * progress
              : anim.totalLength * progress
            if (drawn >= dist && !anim.stationAppearTimes.has(sid)) {
              anim.stationAppearTimes.set(sid, now)
            }
            const t = anim.stationAppearTimes.get(sid)
            if (t !== undefined) {
              const s = easeOut(Math.min(1, (now - t) / STATION_ARRIVE_MS))
              setStationScale(sid, s, anim.stationPositions)
            }
          }
        }

        // ── Camera: collect drawing tip ───────────────────────────────────────
        if (pathEl) {
          let tipDist: number
          if (anim.kind === 'open') {
            tipDist = anim.totalLength * progress
          } else if (anim.kind === 'extend') {
            const extensionLen = anim.totalLength - anim.existingLen
            const drawn = extensionLen * progress
            tipDist = anim.extAnimFrom === 'tip'
              ? anim.totalLength - drawn
              : anim.existingLen + drawn
          } else {
            // close: erase front moves from 0 toward totalLength
            tipDist = anim.totalLength * (1 - progress)
          }
          try {
            const pt = pathEl.getPointAtLength(Math.max(0, Math.min(tipDist, anim.totalLength)))
            cameraTips.push({ x: pt.x, y: pt.y })
          } catch { /* ignore */ }
        }

        // ── Completion ────────────────────────────────────────────────────────
        if (elapsed >= TOTAL_MS) {
          if (pathEl) {
            if (anim.reversed) pathEl.setAttribute('d', anim.forwardPathD)
            pathEl.style.strokeDasharray  = ''
            pathEl.style.strokeDashoffset = ''
          }
          if (anim.kind === 'close') {
            // remove ghost; hide disappearing stations
            setClosingLines(prev => prev.filter(cl => cl.animId !== elemId))
            for (const sid of anim.affectedStationIds) {
              const el = stationRefs.current.get(sid)
              if (el) { el.removeAttribute('transform'); el.style.visibility = 'hidden' }
            }
          } else {
            for (const sid of anim.affectedStationIds) {
              setStationScale(sid, 1, anim.stationPositions)
            }
          }
          lineAnimRef.current.delete(elemId)
        } else {
          anyActive = true
        }
      }

      // ── Camera update ──────────────────────────────────────────────────────
      if (cameraGroupRef.current) {
        if (cameraTips.length > 0) {
          // Lerp toward average tip position (frame-rate–independent, speed=3)
          const avgX = cameraTips.reduce((s, p) => s + p.x, 0) / cameraTips.length
          const avgY = cameraTips.reduce((s, p) => s + p.y, 0) / cameraTips.length
          const { vbX, vbY, vbW, vbH } = vbParamsRef.current
          const targetDx = (vbX + vbW / 2) - avgX
          const targetDy = (vbY + vbH / 2) - avgY
          const lerpFactor = 0.05
          cameraXRef.current += (targetDx - cameraXRef.current) * lerpFactor
          cameraYRef.current += (targetDy - cameraYRef.current) * lerpFactor
          cameraGroupRef.current.style.transition = 'none'
          cameraGroupRef.current.setAttribute('transform',
            `translate(${cameraXRef.current.toFixed(1)},${cameraYRef.current.toFixed(1)})`)
        }

        if (!anyActive && (Math.abs(cameraXRef.current) > 0.5 || Math.abs(cameraYRef.current) > 0.5)) {
          // All animations done → return camera to center smoothly
          cameraGroupRef.current.style.transition = 'transform 0.9s ease-out'
          cameraGroupRef.current.setAttribute('transform', 'translate(0,0)')
          cameraXRef.current = 0
          cameraYRef.current = 0
        }
      }

      rafRef.current = anyActive ? requestAnimationFrame(frame) : null
    }

    rafRef.current = requestAnimationFrame(frame)
  }

  function stopRaf() {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  // ── useLayoutEffect: detect open / extend ─────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const currentLineIds    = new Set(mapState.activeLines.map(al => al.line.id))
    const currentStationIds = mapState.activeStationIds

    if (!animated) {
      stopRaf()
      // Reset camera immediately (no transition when user pauses)
      if (cameraGroupRef.current) {
        cameraGroupRef.current.style.transition = 'none'
        cameraGroupRef.current.setAttribute('transform', 'translate(0,0)')
      }
      cameraXRef.current = 0
      cameraYRef.current = 0
      for (const [elemId, anim] of lineAnimRef.current) {
        const p = anim.kind === 'close'
          ? closingPathRefs.current.get(elemId)
          : pathRefs.current.get(elemId)
        if (p) {
          if (anim.reversed) p.setAttribute('d', anim.forwardPathD)
          p.style.strokeDasharray  = ''
          p.style.strokeDashoffset = ''
        }
        for (const sid of anim.affectedStationIds) {
          const el = stationRefs.current.get(sid)
          if (!el) continue
          if (anim.kind === 'close') {
            el.removeAttribute('transform'); el.style.visibility = 'hidden'
          } else {
            el.removeAttribute('transform'); el.style.visibility = 'visible'
          }
        }
      }
      lineAnimRef.current = new Map()
      setClosingLines([])
      prevLineIdsRef.current         = currentLineIds
      prevStationIdsRef.current      = new Set(currentStationIds)
      prevLineStationIdsRef.current  = new Map(mapState.activeLines.map(al => [al.line.id, [...al.stationIds]]))
      return
    }

    const newStationIds = new Set([...currentStationIds].filter(id => !prevStationIdsRef.current.has(id)))
    const now = performance.now()

    // ── New lines (open) ──────────────────────────────────────────────────────
    const newLineIds = [...currentLineIds].filter(id => !prevLineIdsRef.current.has(id))
    for (const lineId of newLineIds) {
      const pathEl = pathRefs.current.get(lineId)
      if (!pathEl) continue

      const geo           = geometries.find(g => g.lineId === lineId)
      const animDirection = geo?.animDirection ?? 'start'
      const activeLine    = mapState.activeLines.find(al => al.line.id === lineId)!

      const forwardPathD = pathEl.getAttribute('d') ?? ''
      let reversed = false
      if (animDirection === 'end') {
        const pts = buildLinePoints(activeLine.stationIds, stationMap, geo).reverse()
        pathEl.setAttribute('d', catmullRomPath(pts))
        reversed = true
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
      const stationPositions = new Map<string, StationPos>()
      for (const sid of lineNewStations) {
        const st = stationMap.get(sid)
        if (st) stationPositions.set(sid, { x: st.x, y: st.y })
      }

      const ids = activeLine.stationIds
      const startStationId = animDirection === 'end' ? ids[ids.length - 1] : ids[0]
      const phaseAMs = lineNewStations.has(startStationId) ? STATION_APPEAR_MS : 0

      for (const sid of lineNewStations) {
        const el = stationRefs.current.get(sid)
        const pos = stationPositions.get(sid)
        if (el && pos) {
          el.style.visibility = 'visible'
          el.setAttribute('transform', scaleTransform(pos.x, pos.y, 0))
        }
      }

      lineAnimRef.current.set(lineId, {
        kind: 'open', startTime: now, totalLength, forwardPathD, reversed,
        existingLen: 0, extAnimFrom: 'junction', startStationId, phaseAMs,
        stationPositions, affectedStationIds: lineNewStations,
        stationDistances, stationAppearTimes: new Map(),
      })
    }

    // ── Extended lines ────────────────────────────────────────────────────────
    for (const al of mapState.activeLines) {
      const lineId = al.line.id
      if (newLineIds.includes(lineId)) continue  // already handled as new

      const prevIds = prevLineStationIdsRef.current.get(lineId) ?? []
      if (prevIds.length === al.stationIds.length) continue  // not extended

      const pathEl = pathRefs.current.get(lineId)
      if (!pathEl) continue

      // direction: 'end' if new stations appended, 'start' if prepended
      const extDir = al.stationIds[0] === prevIds[0] ? 'end' : 'start'

      // find the junction station and new stations
      const junctionId = extDir === 'end' ? prevIds[prevIds.length - 1] : prevIds[0]
      const newStIds   = al.stationIds.filter(id => !prevIds.includes(id))
      const tipId      = extDir === 'end'
        ? al.stationIds[al.stationIds.length - 1]
        : al.stationIds[0]

      const geo       = geometries.find(g => g.lineId === lineId)
      const animFrom  = geo?.extAnimFrom ?? 'junction'

      const forwardPathD = pathEl.getAttribute('d') ?? ''
      let reversed = false

      // Reverse for 'start' extensions so the new segment is always at the path's end.
      // This lets the same dasharray trick work regardless of animFrom.
      if (extDir === 'start') {
        const pts = buildLinePoints(al.stationIds, stationMap, geo).reverse()
        pathEl.setAttribute('d', catmullRomPath(pts))
        reversed = true
      }

      const totalLength  = pathEl.getTotalLength()
      const junctionSt   = stationMap.get(junctionId)
      const existingLen  = junctionSt
        ? findDistOnPath(pathEl, junctionSt.x, junctionSt.y)
        : 0
      const extensionLen = totalLength - existingLen

      // initial dasharray: show existing portion, hide new extension
      pathEl.style.strokeDasharray  = `${existingLen} 99999`
      pathEl.style.strokeDashoffset = '0'

      // station distances from the animation start point
      // junction: distance from junction (position existingLen) to station
      // tip:      distance from tip (position totalLength) to station
      const stationDistances = new Map<string, number>()
      for (const sid of newStIds) {
        const st = stationMap.get(sid)
        if (!st) continue
        const distOnPath = findDistOnPath(pathEl, st.x, st.y)
        stationDistances.set(sid, animFrom === 'tip'
          ? totalLength - distOnPath
          : distOnPath - existingLen)
      }
      void extensionLen

      const lineNewSts = new Set(newStIds.filter(id => newStationIds.has(id)))
      const stationPositions = new Map<string, StationPos>()
      for (const sid of lineNewSts) {
        const st = stationMap.get(sid)
        if (st) stationPositions.set(sid, { x: st.x, y: st.y })
      }

      // phase A start station
      const startStationId = animFrom === 'tip' ? tipId : junctionId
      // junction is never "new", tip might be
      const phaseAMs = lineNewSts.has(startStationId) ? STATION_APPEAR_MS : 0

      for (const sid of lineNewSts) {
        const el = stationRefs.current.get(sid)
        const pos = stationPositions.get(sid)
        if (el && pos) {
          el.style.visibility = 'visible'
          el.setAttribute('transform', scaleTransform(pos.x, pos.y, 0))
        }
      }

      lineAnimRef.current.set(lineId, {
        kind: 'extend', startTime: now, totalLength, forwardPathD, reversed,
        existingLen, extAnimFrom: animFrom, startStationId, phaseAMs,
        stationPositions, affectedStationIds: lineNewSts,
        stationDistances, stationAppearTimes: new Map(),
      })
    }

    // ── Closed lines ──────────────────────────────────────────────────────────
    const closedLineIds = [...prevLineIdsRef.current].filter(id => !currentLineIds.has(id))
    const newClosingLines: ClosingLine[] = []

    for (const lineId of closedLineIds) {
      const prevIds = prevLineStationIdsRef.current.get(lineId) ?? []
      // find the line's color from stationMap… we need line info
      // We'll look it up via the path element's stroke attribute — or just pass through
      const pathEl = pathRefs.current.get(lineId)
      if (!pathEl) continue
      const color = pathEl.getAttribute('stroke') ?? '#fff'
      const pathD = pathEl.getAttribute('d') ?? ''

      const geo = geometries.find(g => g.lineId === lineId)
      const animDirection = geo?.closeAnimDirection ?? 'end'

      // stations that will disappear (those only on this line)
      const disappearingStationIds = prevIds.filter(sid => {
        // check if still in current mapState
        return !currentStationIds.has(sid)
      })

      let reversed = false
      let finalPathD = pathD
      if (animDirection === 'start') {
        // reverse so erase front moves from start
        const pts = buildLinePoints(prevIds, stationMap, geo).reverse()
        finalPathD = catmullRomPath(pts)
        reversed = true
      }

      const animId = `close-${lineId}-${Date.now()}`
      newClosingLines.push({ animId, lineId, color, pathD: finalPathD, reversed, totalLength: 0, animDirection, stationIds: disappearingStationIds })
    }

    if (newClosingLines.length > 0) {
      setClosingLines(prev => [...prev, ...newClosingLines])
    }

    prevLineIdsRef.current        = currentLineIds
    prevStationIdsRef.current     = new Set(currentStationIds)
    prevLineStationIdsRef.current = new Map(mapState.activeLines.map(al => [al.line.id, [...al.stationIds]]))

    // Start RAF if any animations were queued (open or extend).
    // prevLineStationIdsRef is already updated here so we can't compare lengths;
    // instead check whether lineAnimRef has any entries.
    if (lineAnimRef.current.size > 0) runRaf()
  }, [mapState, animated])

  // ── useLayoutEffect: set up closing line animations after mount ───────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!animated) return
    const now = performance.now()

    for (const cl of closingLines) {
      if (lineAnimRef.current.has(cl.animId)) continue  // already set up

      const pathEl = closingPathRefs.current.get(cl.animId)
      if (!pathEl) continue

      const totalLength = pathEl.getTotalLength()

      // hide via dasharray (start fully visible)
      pathEl.style.strokeDasharray  = String(totalLength)
      pathEl.style.strokeDashoffset = '0'

      const stationPositions = new Map<string, StationPos>()
      const stationDistances = new Map<string, number>()
      for (const sid of cl.stationIds) {
        const st = stationMap.get(sid)
        if (st) {
          stationPositions.set(sid, { x: st.x, y: st.y })
          stationDistances.set(sid, findDistOnPath(pathEl, st.x, st.y))
          // start at scale 1
          const el = stationRefs.current.get(sid)
          if (el) { el.removeAttribute('transform'); el.style.visibility = 'visible' }
        }
      }

      lineAnimRef.current.set(cl.animId, {
        kind: 'close', startTime: now, totalLength,
        forwardPathD: cl.reversed ? '' : cl.pathD,
        reversed: cl.reversed,
        existingLen: 0, extAnimFrom: 'junction',
        startStationId: '', phaseAMs: 0,
        stationPositions,
        affectedStationIds: new Set(cl.stationIds),
        stationDistances,
        stationAppearTimes: new Map(),
      })
    }

    if (closingLines.length > 0) runRaf()
  }, [closingLines, animated])

  // ── Render ────────────────────────────────────────────────────────────────

  const vbX = -(canvas?.left ?? 0)
  const vbY = -(canvas?.top ?? 0)
  const vbW = 800 + (canvas?.left ?? 0) + (canvas?.right ?? 0)
  const vbH = 550 + (canvas?.top ?? 0) + (canvas?.bottom ?? 0)
  vbParamsRef.current = { vbX, vbY, vbW, vbH }

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className="w-full h-full"
      style={{ background: '#0f172a' }}
    >
      {/* Camera-tracked content */}
      <g ref={cameraGroupRef}>
        {background && (
          <image href={background.dataUrl}
            x={background.offsetX} y={background.offsetY}
            width={background.naturalWidth * background.scale}
            height={background.naturalHeight * background.scale}
            opacity={background.opacity} preserveAspectRatio="none" />
        )}

        {/* Active lines */}
        {mapState.activeLines.map(({ line, stationIds }) => {
          const geo = geometries.find(g => g.lineId === line.id)
          const pts = buildLinePoints(stationIds, stationMap, geo)
          return (
            <path key={line.id}
              ref={el => { el ? pathRefs.current.set(line.id, el) : pathRefs.current.delete(line.id) }}
              d={catmullRomPath(pts)} fill="none"
              stroke={line.color} strokeWidth={5}
              strokeLinecap="round" strokeLinejoin="round" />
          )
        })}

        {/* Closing line ghosts */}
        {closingLines.map(cl => (
          <path key={cl.animId}
            ref={el => { el ? closingPathRefs.current.set(cl.animId, el) : closingPathRefs.current.delete(cl.animId) }}
            d={cl.pathD} fill="none"
            stroke={cl.color} strokeWidth={5}
            strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Stations */}
        {stations.filter(s => mapState.activeStationIds.has(s.id)).map(station => (
          <g key={station.id}
            ref={el => { el ? stationRefs.current.set(station.id, el) : stationRefs.current.delete(station.id) }}>
            <circle cx={station.x} cy={station.y} r={8} fill="white" stroke="#334155" strokeWidth={2} />
            <text x={station.x} y={station.y - 14} textAnchor="middle" fontSize={13} fill="white" fontFamily="sans-serif">
              {station.name}
            </text>
          </g>
        ))}
      </g>

      {/* Legend — fixed to viewport (not camera-tracked) */}
      <g transform={`translate(${vbX + 20}, ${vbY + vbH - 90})`}>
        <rect x={0} y={0} width={160} height={mapState.activeLines.length * 24 + 12} rx={6} fill="#1e293b" opacity={0.9} />
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
