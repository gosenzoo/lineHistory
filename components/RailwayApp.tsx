'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { stations as defaultStations, lines as defaultLines, events as defaultEvents } from '@/lib/data'
import { loadData } from '@/lib/store'
import { computeMapState } from '@/lib/engine'
import MapView from './MapView'
import Timeline from './Timeline'
import EventLog from './EventLog'
import params from '@/paramSettings'

export default function RailwayApp() {
  const [data, setData] = useState({ stations: defaultStations, lines: defaultLines, events: defaultEvents, geometries: [] as import('@/lib/types').LineGeometry[] })
  const [year, setYear] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const stored = loadData()
    setData(stored)
  }, [])

  const minYear = data.events.length > 0
    ? Math.min(...data.events.map(e => parseInt(e.date.slice(0, 4)))) - 5
    : 1895
  const maxYear = data.events.length > 0
    ? Math.max(...data.events.map(e => parseInt(e.date.slice(0, 4)))) + 5
    : 1965

  useEffect(() => {
    setYear(prev => prev === 0 ? minYear : prev)
  }, [minYear])

  // ── Play loop ────────────────────────────────────────────────────────────────
  // Fire once per year while playing. Delay depends on whether this year has a
  // line_open event: if so, wait for the draw animation to finish + a pause;
  // otherwise use the shorter yearDurationMs interval.
  useEffect(() => {
    if (!isPlaying || year === 0) return

    const hasLineOpen = data.events.some(
      e => e.type === 'line_open' && parseInt(e.date) === year
    )
    const delay = hasLineOpen
      ? params.stationAppearMs + params.animDurationMs + params.pauseAfterAnimMs
      : params.yearDurationMs

    const timer = setTimeout(() => {
      if (year >= maxYear) {
        setIsPlaying(false)
      } else {
        setYear(y => y + 1)
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [isPlaying, year, maxYear, data.events])

  // ── Derived state ────────────────────────────────────────────────────────────

  const mapState = computeMapState(data.stations, data.lines, data.events, year)

  const handleYearChange = useCallback((next: number) => {
    setYear(next)
  }, [])

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])

  if (year === 0) return null

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-700 shrink-0">
        <h1 className="text-slate-100 font-bold text-lg tracking-wide">路線歴史アニメーション</h1>
        <div className="flex items-center gap-4">
          <span className="text-blue-400 font-mono text-2xl font-bold tabular-nums">{year}年</span>
          <Link href="/admin" className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1 rounded transition-colors">
            管理画面
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <MapView stations={data.stations} mapState={mapState} geometries={data.geometries} animated={isPlaying} />
        </main>
        <EventLog events={data.events} currentYear={year} />
      </div>

      <Timeline
        year={year}
        minYear={minYear}
        maxYear={maxYear}
        isPlaying={isPlaying}
        onYearChange={handleYearChange}
        onPlayPause={handlePlayPause}
      />
    </div>
  )
}
