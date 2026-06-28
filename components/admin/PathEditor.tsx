'use client'

import { useState, useRef } from 'react'
import type { RailwayData, LineSegmentGeometry, LineGeometry } from '@/lib/types'
import { computeMapState } from '@/lib/engine'
import { buildLinePoints, catmullRomPath } from '@/lib/geometry'

const VB_W = 800
const VB_H = 550

interface DragState {
  segmentIdx: number
  waypointIdx: number
}

interface BgDrag {
  startMouse: { x: number; y: number }
  startOffset: { x: number; y: number }
}

interface SelectedWP {
  segIdx: number
  wpIdx: number
}

interface Props {
  data: RailwayData
  initialLineId?: string
  onUpdate: (data: RailwayData) => void
  onClose?: () => void
}

export default function PathEditor({ data, initialLineId = '', onUpdate, onClose }: Props) {
  const [lineId, setLineId] = useState(initialLineId)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [bgDrag, setBgDrag] = useState<BgDrag | null>(null)
  const [selectedWP, setSelectedWP] = useState<SelectedWP | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragMovedRef = useRef(false)

  const maxYear = data.events.length > 0
    ? Math.max(...data.events.map(e => parseInt(e.date.slice(0, 4))))
    : 9999
  const mapState = computeMapState(data.stations, data.lines, data.events, `${maxYear}-12-31`)
  const stationMap = new Map(data.stations.map(s => [s.id, s]))

  const selectedActiveLine = mapState.activeLines.find(al => al.line.id === lineId)
  const selectedLine = data.lines.find(l => l.id === lineId)
  const currentGeo = data.geometries.find(g => g.lineId === lineId)

  function getSegments(): LineSegmentGeometry[] {
    if (!selectedActiveLine) return []
    const ids = selectedActiveLine.stationIds
    return ids.slice(0, -1).map((fromId, i) => {
      const toId = ids[i + 1]
      return currentGeo?.segments.find(s => s.fromStationId === fromId && s.toStationId === toId)
        ?? { fromStationId: fromId, toStationId: toId, waypoints: [] }
    })
  }

  function saveGeo(partial: Partial<Omit<LineGeometry, 'lineId'>>) {
    const newGeos: LineGeometry[] = [
      ...data.geometries.filter(g => g.lineId !== lineId),
      { ...currentGeo, lineId, segments: currentGeo?.segments ?? [], ...partial },
    ]
    onUpdate({ ...data, geometries: newGeos })
  }

  function saveSegments(segments: LineSegmentGeometry[]) {
    saveGeo({ segments })
  }

  function toSVGCoords(e: React.MouseEvent): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: Math.round(svgPt.x), y: Math.round(svgPt.y) }
  }

  function handleSubsegmentClick(e: React.MouseEvent, segIdx: number, insertIdx: number) {
    e.stopPropagation()
    const coords = toSVGCoords(e)
    const segs = getSegments()
    setSelectedWP(null)
    saveSegments(segs.map((seg, si) => {
      if (si !== segIdx) return seg
      const wps = [...seg.waypoints]
      wps.splice(insertIdx, 0, { ...coords, tension: 1.0 })
      return { ...seg, waypoints: wps }
    }))
  }

  function handleWpMouseDown(e: React.MouseEvent, segIdx: number, wpIdx: number) {
    e.preventDefault()
    e.stopPropagation()
    dragMovedRef.current = false
    setDragState({ segmentIdx: segIdx, waypointIdx: wpIdx })
  }

  function handleSVGMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (bgDrag && data.background) {
      const mouse = toSVGCoords(e)
      const dx = mouse.x - bgDrag.startMouse.x
      const dy = mouse.y - bgDrag.startMouse.y
      onUpdate({ ...data, background: {
        ...data.background,
        offsetX: bgDrag.startOffset.x + dx,
        offsetY: bgDrag.startOffset.y + dy,
      }})
      return
    }
    if (!dragState) return
    dragMovedRef.current = true
    const coords = toSVGCoords(e)
    const segs = getSegments()
    saveSegments(segs.map((seg, si) => {
      if (si !== dragState.segmentIdx) return seg
      const wps = [...seg.waypoints]
      wps[dragState.waypointIdx] = { ...wps[dragState.waypointIdx], ...coords }
      return { ...seg, waypoints: wps }
    }))
  }

  function handleSVGMouseUp() {
    if (bgDrag) { setBgDrag(null); return }
    if (dragState && !dragMovedRef.current) {
      const { segmentIdx, waypointIdx } = dragState
      setSelectedWP(prev =>
        prev?.segIdx === segmentIdx && prev?.wpIdx === waypointIdx
          ? null
          : { segIdx: segmentIdx, wpIdx: waypointIdx }
      )
    }
    setDragState(null)
  }

  function handleWpDoubleClick(e: React.MouseEvent, segIdx: number, wpIdx: number) {
    e.stopPropagation()
    setSelectedWP(null)
    const segs = getSegments()
    saveSegments(segs.map((seg, si) => {
      if (si !== segIdx) return seg
      return { ...seg, waypoints: seg.waypoints.filter((_, i) => i !== wpIdx) }
    }))
  }

  function handleTensionChange(segIdx: number, wpIdx: number, tension: number) {
    const segs = getSegments()
    saveSegments(segs.map((seg, si) => {
      if (si !== segIdx) return seg
      return {
        ...seg,
        waypoints: seg.waypoints.map((wp, wi) =>
          wi === wpIdx ? { ...wp, tension } : wp
        ),
      }
    }))
  }

  const segments = getSegments()
  const selectedWpData = selectedWP
    ? segments[selectedWP.segIdx]?.waypoints[selectedWP.wpIdx] ?? null
    : null

  const ids        = selectedActiveLine?.stationIds ?? []
  const startStName = stationMap.get(ids[0])?.name ?? '始点'
  const endStName   = stationMap.get(ids[ids.length - 1])?.name ?? '終点'
  const currentDir  = currentGeo?.animDirection ?? 'start'

  const vbX = -(data.canvas?.left ?? 0)
  const vbY = -(data.canvas?.top ?? 0)
  const vbW = VB_W + (data.canvas?.left ?? 0) + (data.canvas?.right ?? 0)
  const vbH = VB_H + (data.canvas?.top ?? 0) + (data.canvas?.bottom ?? 0)

  return (
    <div className="h-full flex flex-col text-slate-200">

      {/* ── Top bar ─────────────────────────────────── */}
      <div className="shrink-0 bg-slate-900 border-b border-slate-700 px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          {/* Line selector */}
          <select
            value={lineId}
            onChange={e => { setLineId(e.target.value); setSelectedWP(null) }}
            className="flex-1 bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:border-blue-400 outline-none"
          >
            <option value="">路線を選択...</option>
            {data.lines.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          {/* Animation direction (shown when line is selected) */}
          {lineId && (
            <div className="flex gap-1 shrink-0">
              {(['start', 'end'] as const).map(dir => (
                <button
                  key={dir}
                  onClick={() => saveGeo({ animDirection: dir })}
                  title={`アニメーション開始: ${dir === 'start' ? startStName : endStName}`}
                  className={`text-xs px-2.5 py-1.5 rounded transition-colors
                    ${currentDir === dir
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                  {dir === 'start' ? startStName : endStName}
                </button>
              ))}
            </div>
          )}

          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white text-sm shrink-0 ml-1">✕</button>
          )}
        </div>
      </div>

      {/* ── Map (fills remaining height) ────────────── */}
      <div className="flex-1 min-h-0 relative">
        <svg
          ref={svgRef}
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          className="w-full h-full"
          style={{
            background: '#0f172a',
            cursor: dragState ? 'grabbing' : 'default',
            userSelect: 'none',
            display: 'block',
          }}
          onMouseMove={handleSVGMouseMove}
          onMouseUp={handleSVGMouseUp}
          onMouseLeave={handleSVGMouseUp}
        >
          {/* Background image */}
          {data.background && (
            <image
              href={data.background.dataUrl}
              x={data.background.offsetX}
              y={data.background.offsetY}
              width={data.background.naturalWidth * data.background.scale}
              height={data.background.naturalHeight * data.background.scale}
              opacity={data.background.opacity}
              preserveAspectRatio="none"
              style={{ cursor: bgDrag ? 'grabbing' : 'grab' }}
              onMouseDown={e => {
                e.stopPropagation()
                setBgDrag({
                  startMouse: toSVGCoords(e),
                  startOffset: { x: data.background!.offsetX, y: data.background!.offsetY },
                })
              }}
            />
          )}

          {/* Other lines (dimmed) */}
          {mapState.activeLines.map(({ line, stationIds }) => {
            if (line.id === lineId) return null
            const geo = data.geometries.find(g => g.lineId === line.id)
            const pts = buildLinePoints(stationIds, stationMap, geo)
            return (
              <path
                key={line.id}
                d={catmullRomPath(pts)}
                fill="none"
                stroke={line.color}
                strokeWidth={3}
                strokeLinecap="round"
                opacity={0.2}
              />
            )
          })}

          {/* Selected line */}
          {selectedActiveLine && (() => {
            const pts = buildLinePoints(selectedActiveLine.stationIds, stationMap, currentGeo)
            return (
              <path
                d={catmullRomPath(pts)}
                fill="none"
                stroke={selectedLine?.color ?? '#60A5FA'}
                strokeWidth={5}
                strokeLinecap="round"
              />
            )
          })()}

          {/* All active stations */}
          {data.stations
            .filter(s => mapState.activeStationIds.has(s.id))
            .map(s => (
              <g key={s.id}>
                <circle cx={s.x} cy={s.y} r={7} fill="white" stroke="#334155" strokeWidth={1.5} />
                <text x={s.x} y={s.y - 11} textAnchor="middle" fontSize={11} fill="white" fontFamily="sans-serif">
                  {s.name}
                </text>
              </g>
            ))}

          {/* Clickable subsegments + waypoint handles */}
          {lineId && segments.map((seg, si) => {
            const fromPos = stationMap.get(seg.fromStationId)
            const toPos = stationMap.get(seg.toStationId)
            if (!fromPos || !toPos) return null

            const subPoints = [
              { ...fromPos, isStation: true },
              ...seg.waypoints.map(wp => ({ ...wp, isStation: false })),
              { ...toPos, isStation: true },
            ]

            return (
              <g key={`seg-${si}`}>
                {subPoints.slice(0, -1).map((p1, j) => {
                  const p2 = subPoints[j + 1]
                  return (
                    <line
                      key={`click-${j}`}
                      x1={p1.x} y1={p1.y}
                      x2={p2.x} y2={p2.y}
                      stroke="transparent"
                      strokeWidth={18}
                      style={{ cursor: 'copy' }}
                      onClick={e => handleSubsegmentClick(e, si, j)}
                    />
                  )
                })}

                {seg.waypoints.map((wp, wi) => {
                  const prev = wi === 0 ? fromPos : seg.waypoints[wi - 1]
                  const isSelected = selectedWP?.segIdx === si && selectedWP?.wpIdx === wi
                  const tension = wp.tension ?? 1.0

                  return (
                    <g key={`wp-${wi}`}>
                      <line
                        x1={prev.x} y1={prev.y} x2={wp.x} y2={wp.y}
                        stroke="#94A3B8" strokeWidth={1} strokeDasharray="4 3" opacity={0.6}
                        style={{ pointerEvents: 'none' }}
                      />
                      <circle
                        cx={wp.x} cy={wp.y}
                        r={isSelected ? 4 : 2.5}
                        fill={isSelected ? '#7DD3FC' : '#000'}
                        stroke={isSelected ? '#000' : 'none'}
                        strokeWidth={isSelected ? 1.5 : 0}
                        style={{ cursor: dragState ? 'grabbing' : 'grab' }}
                        onMouseDown={e => handleWpMouseDown(e, si, wi)}
                        onDoubleClick={e => handleWpDoubleClick(e, si, wi)}
                      />
                      {tension !== 1.0 && (
                        <text
                          x={wp.x} y={wp.y - 14}
                          textAnchor="middle" fontSize={10}
                          fill="#94A3B8" fontFamily="monospace"
                          style={{ pointerEvents: 'none' }}
                        >
                          {tension.toFixed(1)}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>

      {/* ── Bottom bar ──────────────────────────────── */}
      <div className="shrink-0 bg-slate-900 border-t border-slate-700 px-4 py-3 flex flex-col gap-3">

        {/* Tension slider */}
        {selectedWP && selectedWpData && (
          <div className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="shrink-0">
                <p className="text-xs text-slate-400 mb-0.5">曲がり強度</p>
                <p className="text-xs text-slate-500">区間 {selectedWP.segIdx + 1} — WP {selectedWP.wpIdx + 1}</p>
              </div>
              <div className="flex-1 flex items-center gap-3">
                <span className="text-xs text-slate-500 w-6">直線</span>
                <input
                  type="range" min="0" max="3" step="0.1"
                  value={selectedWpData.tension ?? 1.0}
                  onChange={e => handleTensionChange(selectedWP.segIdx, selectedWP.wpIdx, parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-400"
                />
                <span className="text-xs text-slate-500 w-8">強い</span>
                <span className="text-sm font-mono text-cyan-300 w-8 text-right">
                  {(selectedWpData.tension ?? 1.0).toFixed(1)}
                </span>
              </div>
              <button
                onClick={() => handleTensionChange(selectedWP.segIdx, selectedWP.wpIdx, 1.0)}
                className="text-xs text-slate-400 hover:text-white shrink-0"
              >
                リセット
              </button>
            </div>
            <div className="mt-2 flex gap-2 flex-wrap">
              {[0, 0.5, 1.0, 1.5, 2.0, 3.0].map(v => (
                <button
                  key={v}
                  onClick={() => handleTensionChange(selectedWP.segIdx, selectedWP.wpIdx, v)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors
                    ${(selectedWpData.tension ?? 1.0) === v
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                  {v === 1.0 ? '1.0 (標準)' : v.toFixed(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Operation hints + WP count */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            路線上クリック: WP追加　／　WPクリック: 選択・曲がり調整　／　ドラッグ: 移動　／　ダブルクリック: 削除
          </p>
          {lineId && (
            <p className="text-xs text-slate-500 shrink-0">
              WP: {segments.reduce((n, s) => n + s.waypoints.length, 0)}個
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
