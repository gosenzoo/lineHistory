'use client'

import type { MapState, Station, LineGeometry } from '@/lib/types'
import { buildLinePoints, catmullRomPath } from '@/lib/geometry'

interface Props {
  stations: Station[]
  mapState: MapState
  geometries: LineGeometry[]
}

export default function MapView({ stations, mapState, geometries }: Props) {
  const stationMap = new Map(stations.map(s => [s.id, s]))

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
        const d = catmullRomPath(pts)
        return (
          <path
            key={line.id}
            d={d}
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
          <g key={station.id}>
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
