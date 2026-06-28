'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { stations as defaultStations, lines as defaultLines, events as defaultEvents } from '@/lib/data'
import { loadData } from '@/lib/store'
import { computeMapState } from '@/lib/engine'
import type { RailwayData, RailwayEvent } from '@/lib/types'
import MapView from './MapView'
import Timeline from './Timeline'
import EventLog from './EventLog'
import params from '@/paramSettings'

// ── Play steps ────────────────────────────────────────────────────────────────
// A "step" is one event group (same date + orderIndex) or a year-end marker.
// The play loop advances through steps in order.

interface PlayStep {
  date: string
  orderIndex?: number   // undefined = year-end step (no same-date filter)
  hasLineAnim: boolean
}

function buildPlaySteps(events: RailwayEvent[], minYear: number, maxYear: number): PlayStep[] {
  const steps: PlayStep[] = []

  for (let y = minYear; y <= maxYear; y++) {
    const yearStr = String(y)
    const yearEvts = events
      .filter(e => e.date.slice(0, 4) === yearStr)
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date)
        return d !== 0 ? d : a.orderIndex - b.orderIndex
      })

    // Unique (date, orderIndex) groups in sorted order
    const seen = new Set<string>()
    for (const e of yearEvts) {
      const key = `${e.date}\t${e.orderIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      const hasLineAnim = yearEvts.some(
        ev => ev.date === e.date && ev.orderIndex === e.orderIndex
          && (ev.type === 'line_open' || ev.type === 'line_extend' || ev.type === 'line_close')
      )
      steps.push({ date: e.date, orderIndex: e.orderIndex, hasLineAnim })
    }

    // Year-end step: ensures every year is reachable via the slider
    steps.push({ date: `${y}-12-31`, orderIndex: undefined, hasLineAnim: false })
  }

  return steps
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RailwayApp() {
  const [data, setData] = useState<RailwayData>({
    stations: defaultStations, lines: defaultLines, events: defaultEvents, geometries: [],
  })
  const [stepIdx, setStepIdx] = useState(-1)   // -1 = not yet initialized
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playSteps = useMemo(
    () => buildPlaySteps(data.events, minYear, maxYear),
    [data.events, minYear, maxYear]
  )

  // Initialize to step 0 (minYear-end) once playSteps is ready
  useEffect(() => {
    if (stepIdx < 0 && playSteps.length > 0) setStepIdx(0)
  }, [playSteps, stepIdx])

  const currentStep = stepIdx >= 0 && stepIdx < playSteps.length ? playSteps[stepIdx] : null
  const year = currentStep ? parseInt(currentStep.date.slice(0, 4)) : 0

  // ── Play loop ─────────────────────────────────────────────────────────────
  // Waits for the current step's animation to finish, then advances.
  // - Event group step with line animation: long delay
  // - Year-end step or non-line event: short delay
  useEffect(() => {
    if (!isPlaying || stepIdx < 0) return
    if (stepIdx >= playSteps.length - 1) {
      setIsPlaying(false)
      return
    }

    const step = playSteps[stepIdx]
    const delay = step.hasLineAnim
      ? params.stationAppearMs + params.animDurationMs + params.pauseAfterAnimMs
      : params.yearDurationMs

    const timer = setTimeout(() => setStepIdx(i => i + 1), delay)
    return () => clearTimeout(timer)
  }, [isPlaying, stepIdx, playSteps])

  // ── Derived state ─────────────────────────────────────────────────────────

  const mapState = currentStep
    ? computeMapState(data.stations, data.lines, data.events, currentStep.date, currentStep.orderIndex)
    : { activeLines: [], activeStationIds: new Set<string>() }

  const handleYearChange = useCallback((y: number) => {
    // Jump to the year-end step for year y (full year state, no anim)
    const idx = playSteps.findIndex(
      s => parseInt(s.date.slice(0, 4)) === y && s.orderIndex === undefined
    )
    if (idx >= 0) setStepIdx(idx)
  }, [playSteps])

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
          <MapView
            stations={data.stations}
            mapState={mapState}
            geometries={data.geometries}
            background={data.background}
            canvas={data.canvas}
            animated={isPlaying}
          />
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
