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
  const mapState = computeMapState(data.stations, data.lines, data.events, maxYear)
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
    const rect = svg.getBoundingClientRect()
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * VB_W),
      y: Math.round(((e.clientY - rect.top) / rect.height) * VB_H),
    }
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
      // click without drag → toggle selection
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

  return (
    <div className="flex flex-col gap-4 text-slate-200">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base">パス編集</h2>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">
            ✕ 閉じる
          </button>
        )}
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1">編集する路線</label>
        <select
          value={lineId}
          onChange={e => { setLineId(e.target.value); setSelectedWP(null) }}
          className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:border-blue-400 outline-none"
        >
          <option value="">路線を選択...</option>
          {data.lines.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      {lineId && (() => {
        const ids          = selectedActiveLine?.stationIds ?? []
        const startStName  = stationMap.get(ids[0])?.name ?? '始点'
        const endStName    = stationMap.get(ids[ids.length - 1])?.name ?? '終点'
        const currentDir   = currentGeo?.animDirection ?? 'start'
        return (
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">アニメーション開始端</label>
            <div className="flex gap-2">
              {(['start', 'end'] as const).map(dir => (
                <button
                  key={dir}
                  onClick={() => saveGeo({ animDirection: dir })}
                  className={`flex-1 text-sm py-1.5 rounded transition-colors
                    ${currentDir === dir
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                  {dir === 'start' ? startStName : endStName}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      <div className="relative rounded-lg overflow-hidden border border-slate-600">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full"
          style={{
            background: '#0f172a',
            aspectRatio: `${VB_W}/${VB_H}`,
            cursor: dragState ? 'grabbing' : 'default',
            userSelect: 'none',
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

          {/* Background: other lines dimmed */}
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

          {/* Selected line: full curved path */}
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

          {/* Clickable subsegments + waypoint handles for selected line */}
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
                {/* Transparent thick click zones */}
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

                {/* Waypoint handles */}
                {seg.waypoints.map((wp, wi) => {
                  const prev = wi === 0 ? fromPos : seg.waypoints[wi - 1]
                  const isSelected = selectedWP?.segIdx === si && selectedWP?.wpIdx === wi
                  const tension = wp.tension ?? 1.0

                  return (
                    <g key={`wp-${wi}`}>
                      {/* Guide line */}
                      <line
                        x1={prev.x} y1={prev.y} x2={wp.x} y2={wp.y}
                        stroke="#94A3B8" strokeWidth={1} strokeDasharray="4 3" opacity={0.6}
                        style={{ pointerEvents: 'none' }}
                      />
                      {/* Handle */}
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
                      {/* Tension label (only when != 1.0) */}
                      {tension !== 1.0 && (
                        <text
                          x={wp.x} y={wp.y - 14}
                          textAnchor="middle" fontSize={10}
                          fill="#94A3B8"
                          fontFamily="monospace"
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

        <div className="absolute bottom-2 left-2 bg-slate-800/80 text-slate-300 text-xs px-2 py-1 rounded pointer-events-none">
          路線上クリック: WP追加　／　WPクリック: 選択・曲がり調整　／　ドラッグ: 移動　／　ダブルクリック: 削除
        </div>
      </div>

      {/* Tension slider — shown when a waypoint is selected */}
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
                type="range"
                min="0"
                max="3"
                step="0.1"
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
          <div className="mt-2 flex gap-2">
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

      {lineId && (
        <p className="text-xs text-slate-500">
          ウェイポイント数: {segments.reduce((n, s) => n + s.waypoints.length, 0)}個
          {selectedWP === null && <span className="ml-2 text-slate-600">WPをクリックして強度を調整</span>}
        </p>
      )}
    </div>
  )
}
