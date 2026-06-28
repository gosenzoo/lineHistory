'use client'

import { useState, useRef } from 'react'
import type { Station, MapState, LineGeometry } from '@/lib/types'
import { buildLinePoints, catmullRomPath } from '@/lib/geometry'

export interface PendingStation {
  id: string
  name: string
  x: number
  y: number
}

export type MapEditorMode = 'readonly' | 'multi-select' | 'single-select'

interface Props {
  stations: Station[]
  pendingStations: PendingStation[]
  mapState: MapState
  geometries?: LineGeometry[]
  mode: MapEditorMode
  selectedIds: string[]
  onStationClick?: (id: string) => void
  onPlace?: (name: string, x: number, y: number) => void
  highlightStationIds?: string[]
}

const VB_W = 800
const VB_H = 550

export default function MapEditor({
  stations,
  pendingStations,
  mapState,
  geometries = [],
  mode,
  selectedIds,
  onStationClick,
  onPlace,
  highlightStationIds = [],
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [placingAt, setPlacingAt] = useState<{ x: number; y: number; name: string } | null>(null)

  const stationMap = new Map([
    ...stations.map(s => [s.id, s] as const),
    ...pendingStations.map(s => [s.id, s] as const),
  ])

  function toSVGCoords(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * VB_W),
      y: Math.round(((e.clientY - rect.top) / rect.height) * VB_H),
    }
  }

  function handleSVGClick(e: React.MouseEvent<SVGSVGElement>) {
    if (mode === 'readonly' || !onPlace) return
    const coords = toSVGCoords(e)
    setPlacingAt({ ...coords, name: '' })
  }

  function handleStationClick(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (mode === 'readonly') return
    onStationClick?.(id)
  }

  function commitPlace() {
    if (!placingAt || !placingAt.name.trim()) return
    onPlace?.(placingAt.name.trim(), placingAt.x, placingAt.y)
    setPlacingAt(null)
  }

  const allDisplayStations = [
    ...stations.filter(s => mapState.activeStationIds.has(s.id) || highlightStationIds.includes(s.id)),
    ...pendingStations,
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-lg overflow-hidden border border-slate-600">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full"
          style={{ background: '#0f172a', cursor: mode !== 'readonly' ? 'crosshair' : 'default', aspectRatio: `${VB_W}/${VB_H}` }}
          onClick={handleSVGClick}
        >
          {/* Active lines with curves */}
          {mapState.activeLines.map(({ line, stationIds }) => {
            const geo = geometries.find(g => g.lineId === line.id)
            const pts = buildLinePoints(stationIds, stationMap, geo)
            return (
              <path
                key={line.id}
                d={catmullRomPath(pts)}
                fill="none"
                stroke={line.color}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.5}
              />
            )
          })}

          {/* Selected station path preview (straight lines as placeholder) */}
          {selectedIds.length > 1 && (
            <polyline
              points={selectedIds
                .map(id => stationMap.get(id))
                .filter((s): s is Station | PendingStation => !!s)
                .map(s => `${s.x},${s.y}`)
                .join(' ')}
              fill="none"
              stroke="#60A5FA"
              strokeWidth={3}
              strokeDasharray="6 3"
              strokeLinecap="round"
            />
          )}

          {/* Stations */}
          {allDisplayStations.map(station => {
            const isPending = pendingStations.some(p => p.id === station.id)
            const selIdx = selectedIds.indexOf(station.id)
            const isSelected = selIdx !== -1
            const isHighlighted = highlightStationIds.includes(station.id)

            const fill = isPending ? '#FBBF24' : isSelected ? '#3B82F6' : isHighlighted ? '#A78BFA' : 'white'

            return (
              <g
                key={station.id}
                onClick={e => handleStationClick(e, station.id)}
                style={{ cursor: mode !== 'readonly' ? 'pointer' : 'default' }}
              >
                <circle cx={station.x} cy={station.y} r={10} fill="transparent" />
                <circle cx={station.x} cy={station.y} r={7} fill={fill} stroke="#334155" strokeWidth={1.5} />
                {isSelected && (
                  <text x={station.x} y={station.y + 4} textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">
                    {selIdx + 1}
                  </text>
                )}
                <text x={station.x} y={station.y - 12} textAnchor="middle" fontSize={11}
                  fill={isPending ? '#FBBF24' : 'white'} fontFamily="sans-serif">
                  {station.name}
                </text>
              </g>
            )
          })}

          {placingAt && (
            <circle cx={placingAt.x} cy={placingAt.y} r={7} fill="#FBBF24" stroke="#F59E0B" strokeWidth={2} />
          )}
        </svg>

        {mode !== 'readonly' && (
          <div className="absolute top-2 left-2 bg-slate-800/80 text-slate-300 text-xs px-2 py-1 rounded pointer-events-none">
            駅をクリックして選択 / 空白をクリックして新駅を配置
          </div>
        )}
      </div>

      {placingAt && (
        <div className="flex gap-2 items-center bg-slate-800 rounded-lg px-3 py-2 border border-yellow-500/50">
          <span className="text-yellow-400 text-sm shrink-0">新駅名:</span>
          <input
            autoFocus
            className="flex-1 bg-slate-700 text-white text-sm rounded px-2 py-1 outline-none border border-slate-600 focus:border-blue-400"
            value={placingAt.name}
            onChange={e => setPlacingAt(p => p ? { ...p, name: e.target.value } : null)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitPlace()
              if (e.key === 'Escape') setPlacingAt(null)
            }}
            placeholder="駅名を入力..."
          />
          <button onClick={commitPlace} className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-2 py-1 rounded">追加</button>
          <button onClick={() => setPlacingAt(null)} className="text-xs text-slate-400 hover:text-white px-1">✕</button>
        </div>
      )}
    </div>
  )
}
