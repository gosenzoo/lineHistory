'use client'

import { useState } from 'react'
import type { RailwayData, RailwayEvent, Line } from '@/lib/types'
import { computeMapState } from '@/lib/engine'
import MapEditor, { type PendingStation } from './MapEditor'

// ── Helpers ────────────────────────────────────────────────────

function genId() {
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function prevDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d - 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// line_open は wizard UI からは使わないが、保存時に emit する
const EVENT_TYPES: RailwayEvent['type'][] = [
  'line_extend', 'station_open',
  'line_close', 'station_close', 'section_replace',
]

const EVENT_TYPE_LABELS: Record<RailwayEvent['type'], string> = {
  line_open:       '路線開業',
  station_open:    '駅開業',
  line_extend:     '路線開業/延伸',
  line_close:      '廃線',
  station_close:   '廃駅',
  section_replace: '区間改編',
}

// ── Wizard state ───────────────────────────────────────────────

interface SectionDef {
  sectionId: string
  useExisting: boolean
  existingLineId: string
  newLineName: string
  newLineColor: string
}

interface WizardState {
  date: string
  type: RailwayEvent['type'] | ''
  label: string
  pendingStations: PendingStation[]

  // Unified line open/extend
  lineExistingId: string            // 既存路線ID ('' = 新規路線)
  lineNewName: string               // 新規路線名
  lineNewColor: string              // 新規路線色
  lineJunctionId: string | null     // 延伸起点駅 (既存路線選択時のみ)
  lineStationIds: string[]          // 追加する駅 (新規の場合は全駅)
  lineAnimDir: 'start' | 'end'      // 新規路線のアニメーション開始端
  lineExtAnimFrom: 'junction' | 'tip'  // 延伸のアニメーション開始端

  soLineId: string
  soAfterStationId: string | null
  soStationId: string

  clLineId: string
  clAnimDirection: 'start' | 'end'

  scStationId: string
  scAllLines: boolean
  scLineIds: string[]

  srOldLineId: string
  srSections: SectionDef[]
  srAssignments: Record<string, string>
}

function initState(): WizardState {
  return {
    date: new Date().toISOString().slice(0, 10),
    type: '',
    label: '',
    pendingStations: [],
    lineExistingId: '',
    lineNewName: '',
    lineNewColor: '#3B82F6',
    lineJunctionId: null,
    lineStationIds: [],
    lineAnimDir: 'start',
    lineExtAnimFrom: 'junction',
    soLineId: '',
    soAfterStationId: null,
    soStationId: '',
    clLineId: '',
    clAnimDirection: 'end',
    scStationId: '',
    scAllLines: true,
    scLineIds: [],
    srOldLineId: '',
    srSections: [
      { sectionId: genId(), useExisting: false, existingLineId: '', newLineName: '', newLineColor: '#EF4444' },
      { sectionId: genId(), useExisting: false, existingLineId: '', newLineName: '', newLineColor: '#3B82F6' },
    ],
    srAssignments: {},
  }
}

// ── Small UI parts ─────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-slate-400 mb-1">{children}</label>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Inp({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:border-blue-400 outline-none"
    />
  )
}

function Sel({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:border-blue-400 outline-none"
    >
      {children}
    </select>
  )
}

function LineSelector({ lines, value, onChange, placeholder = '路線を選択' }: { lines: Line[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Sel value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
    </Sel>
  )
}

function StationOrderList({ stationIds, allStations, pendingStations, onReorder, onRemove }: {
  stationIds: string[]
  allStations: { id: string; name: string }[]
  pendingStations: PendingStation[]
  onReorder: (ids: string[]) => void
  onRemove: (id: string) => void
}) {
  const nameOf = (id: string) =>
    allStations.find(s => s.id === id)?.name ?? pendingStations.find(s => s.id === id)?.name ?? id

  function move(idx: number, dir: -1 | 1) {
    const next = [...stationIds]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onReorder(next)
  }

  if (stationIds.length === 0) return <p className="text-slate-500 text-xs">地図をクリックして駅を追加</p>

  return (
    <ol className="space-y-1">
      {stationIds.map((id, i) => (
        <li key={id} className="flex items-center gap-2 bg-slate-700 rounded px-2 py-1">
          <span className="text-slate-400 text-xs w-4">{i + 1}</span>
          <span className="flex-1 text-white text-sm">{nameOf(id)}</span>
          <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-white disabled:opacity-20 text-xs px-1">↑</button>
          <button onClick={() => move(i, 1)} disabled={i === stationIds.length - 1} className="text-slate-400 hover:text-white disabled:opacity-20 text-xs px-1">↓</button>
          <button onClick={() => onRemove(id)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
        </li>
      ))}
    </ol>
  )
}

// ── Main component ─────────────────────────────────────────────

interface Props {
  data: RailwayData
  onSave: (data: RailwayData) => void
  onCancel: () => void
}

export default function EventWizard({ data, onSave, onCancel }: Props) {
  const [w, setW] = useState<WizardState>(initState)
  const patch = (p: Partial<WizardState>) => setW(prev => ({ ...prev, ...p }))

  const previewDate = w.date ? prevDay(w.date) : '1899-12-31'
  const allStations = [...data.stations, ...w.pendingStations]
  const mapState = computeMapState(allStations, data.lines, data.events, previewDate)
  const activeStationsOnLine = (lineId: string) =>
    mapState.activeLines.find(al => al.line.id === lineId)?.stationIds ?? []

  // ── Map interactions ──

  function handleStationClick(id: string) {
    switch (w.type) {
      case 'line_extend': {
        const isExtend = !!w.lineExistingId
        if (isExtend) {
          // 延伸モード: まず端駅を選択、次に新駅を追加
          const lineIds = activeStationsOnLine(w.lineExistingId)
          const endpoints = [lineIds[0], lineIds[lineIds.length - 1]].filter(Boolean)
          if (!w.lineJunctionId && endpoints.includes(id)) {
            patch({ lineJunctionId: id })
          } else if (w.lineJunctionId) {
            patch({ lineStationIds: w.lineStationIds.includes(id)
              ? w.lineStationIds.filter(x => x !== id)
              : [...w.lineStationIds, id] })
          }
        } else {
          // 新規路線モード: 駅を順番に選択
          patch({ lineStationIds: w.lineStationIds.includes(id)
            ? w.lineStationIds.filter(x => x !== id)
            : [...w.lineStationIds, id] })
        }
        break
      }
      case 'station_open':
        patch({ soStationId: id })
        break
      case 'station_close':
        patch({ scStationId: id })
        break
    }
  }

  function handlePlace(name: string, x: number, y: number) {
    const s: PendingStation = { id: genId(), name, x, y }
    switch (w.type) {
      case 'line_extend':
        setW(prev => ({ ...prev, pendingStations: [...prev.pendingStations, s], lineStationIds: [...prev.lineStationIds, s.id] }))
        break
      case 'station_open':
        setW(prev => ({ ...prev, pendingStations: [...prev.pendingStations, s], soStationId: s.id }))
        break
    }
  }

  // ── Validate & Save ──

  function validate(): string | null {
    if (!w.date || !/^\d{4}-\d{2}-\d{2}$/.test(w.date)) return '日付を正しく入力してください'
    if (!w.type) return 'イベント種別を選択してください'
    switch (w.type) {
      case 'line_extend':
        if (!w.lineExistingId && !w.lineNewName.trim()) return '路線を選択するか、路線名を入力してください'
        if (w.lineExistingId && !w.lineJunctionId) return '延伸の起点となる端駅を選択してください'
        if (w.lineStationIds.length === 0) return '駅を選択してください'
        if (!w.lineExistingId && w.lineStationIds.length < 2) return '新規路線は駅を2つ以上選択してください'
        break
      case 'station_open':
        if (!w.soLineId) return '路線を選択してください'
        if (!w.soStationId) return '開業する駅を選択してください'
        break
      case 'line_close':
        if (!w.clLineId) return '廃線にする路線を選択してください'
        break
      case 'station_close':
        if (!w.scStationId) return '廃駅にする駅を選択してください'
        break
      case 'section_replace':
        if (!w.srOldLineId) return '改編する路線を選択してください'
        if (w.srSections.some(s => !s.useExisting && !s.newLineName.trim())) return '各区間の路線名を入力してください'
        if (Object.keys(w.srAssignments).length < activeStationsOnLine(w.srOldLineId).length)
          return 'すべての駅を区間に割り当ててください'
        break
    }
    return null
  }

  function handleSave() {
    const err = validate()
    if (err) { alert(err); return }

    const newStations = [...data.stations, ...w.pendingStations]
    let newLines = [...data.lines]
    let newEvents = [...data.events]
    let newGeometries = [...data.geometries]
    const date = w.date

    const sameDateEvents = newEvents.filter(e => e.date === date)
    const orderIndex = sameDateEvents.length === 0
      ? 0
      : Math.max(...sameDateEvents.map(e => e.orderIndex)) + 1

    const updateGeo = (lineId: string, p: Partial<import('@/lib/types').LineGeometry>) => {
      const exists = newGeometries.some(g => g.lineId === lineId)
      newGeometries = exists
        ? newGeometries.map(g => g.lineId === lineId ? { ...g, ...p } : g)
        : [...newGeometries, { lineId, segments: [], ...p }]
    }

    const autoLabel = (): string => {
      switch (w.type) {
        case 'line_extend':
          if (w.lineExistingId) return `${data.lines.find(l => l.id === w.lineExistingId)?.name} 延伸`
          return `${w.lineNewName} 開業`
        case 'station_open': return `${allStations.find(s => s.id === w.soStationId)?.name} 開業`
        case 'line_close':   return `${data.lines.find(l => l.id === w.clLineId)?.name} 廃線`
        case 'station_close': return `${allStations.find(s => s.id === w.scStationId)?.name} 廃駅`
        case 'section_replace': return `${data.lines.find(l => l.id === w.srOldLineId)?.name} 区間改編`
        default: return '(イベント)'
      }
    }
    const label = w.label.trim() || autoLabel()

    let event: RailwayEvent

    switch (w.type) {
      case 'line_extend': {
        if (w.lineExistingId) {
          // 既存路線を延伸
          const lineIds = activeStationsOnLine(w.lineExistingId)
          const direction = w.lineJunctionId === lineIds[0] ? 'start' : 'end'
          event = { id: genId(), date, orderIndex, type: 'line_extend', lineId: w.lineExistingId, stationIds: w.lineStationIds, direction, label }
          updateGeo(w.lineExistingId, { extAnimFrom: w.lineExtAnimFrom })
        } else {
          // 新規路線を開業
          const lineId = genId()
          newLines = [...newLines, { id: lineId, name: w.lineNewName.trim(), color: w.lineNewColor }]
          event = { id: genId(), date, orderIndex, type: 'line_open', lineId, stationIds: w.lineStationIds, label }
          updateGeo(lineId, { animDirection: w.lineAnimDir })
        }
        break
      }
      case 'station_open':
        event = { id: genId(), date, orderIndex, type: 'station_open', stationId: w.soStationId, lineId: w.soLineId, afterStationId: w.soAfterStationId, label }
        break
      case 'line_close':
        event = { id: genId(), date, orderIndex, type: 'line_close', lineId: w.clLineId, label }
        updateGeo(w.clLineId, { closeAnimDirection: w.clAnimDirection })
        break
      case 'station_close':
        event = { id: genId(), date, orderIndex, type: 'station_close', stationId: w.scStationId, lineIds: w.scAllLines ? undefined : w.scLineIds, label }
        break
      case 'section_replace': {
        const subLines: { lineId: string; stationIds: string[] }[] = []
        const oldStationIds = activeStationsOnLine(w.srOldLineId)
        for (const sec of w.srSections) {
          let lineId = sec.existingLineId
          if (!sec.useExisting || !lineId) {
            lineId = genId()
            newLines = [...newLines, { id: lineId, name: sec.newLineName.trim(), color: sec.newLineColor }]
          }
          subLines.push({ lineId, stationIds: oldStationIds.filter(sid => w.srAssignments[sid] === sec.sectionId) })
        }
        event = { id: genId(), date, orderIndex, type: 'section_replace', oldLineId: w.srOldLineId, newLines: subLines, label }
        break
      }
      default: return
    }

    newEvents = [...newEvents, event].sort((a, b) => {
      const d = a.date.localeCompare(b.date)
      return d !== 0 ? d : a.orderIndex - b.orderIndex
    })

    onSave({ stations: newStations, lines: newLines, events: newEvents, geometries: newGeometries })
  }

  // ── Map props ──

  const needsMap = ['line_extend', 'station_open', 'station_close'].includes(w.type)
  const selectedIds =
    w.type === 'line_extend' ? w.lineStationIds :
    w.type === 'station_open' && w.soStationId ? [w.soStationId] :
    w.type === 'station_close' && w.scStationId ? [w.scStationId] : []

  // ── Render ──

  return (
    <div className="flex gap-5 text-slate-200">

      {/* Left: type listbox */}
      <div className="shrink-0 w-32">
        <p className="text-xs text-slate-400 mb-2">イベント種別</p>
        <div className="border border-slate-600 rounded-lg overflow-hidden">
          {EVENT_TYPES.map(t => (
            <button
              key={t}
              onClick={() => patch({ type: t })}
              className={`w-full text-left px-3 py-2.5 text-sm border-b border-slate-700/60 last:border-0 transition-colors
                ${w.type === t ? 'bg-blue-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-700'}`}
            >
              {EVENT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Right: form area */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">

        {/* Top row: date + label */}
        <div className="flex gap-3">
          <div className="w-40 shrink-0">
            <Label>日付</Label>
            <input
              type="date"
              value={w.date}
              onChange={e => patch({ date: e.target.value })}
              className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:border-blue-400 outline-none"
            />
          </div>
          <div className="flex-1">
            <Label>説明（省略で自動生成）</Label>
            <Inp value={w.label} onChange={v => patch({ label: v })} placeholder="イベントの説明..." />
          </div>
        </div>

        {/* Empty state */}
        {!w.type && (
          <p className="text-slate-500 text-sm pt-4">← 左のリストからイベント種別を選択してください</p>
        )}

        {/* ──── line_extend (統合: 新規開業 or 延伸) ──── */}
        {w.type === 'line_extend' && (() => {
          const isExtend = !!w.lineExistingId
          const lineIds = isExtend ? activeStationsOnLine(w.lineExistingId) : []
          const endpoints = [lineIds[0], lineIds[lineIds.length - 1]].filter(Boolean)
          const junctionName = allStations.find(s => s.id === w.lineJunctionId)?.name ?? ''
          const tipId = w.lineStationIds[w.lineStationIds.length - 1]
          const tipName = allStations.find(s => s.id === tipId)?.name ?? '新端駅'
          const startName = allStations.find(s => s.id === w.lineStationIds[0])?.name ?? '始点'
          const endName   = allStations.find(s => s.id === w.lineStationIds[w.lineStationIds.length - 1])?.name ?? '終点'

          return (
            <>
              {/* 既存路線 or 新規路線 */}
              <div className="grid grid-cols-2 gap-3 items-start">
                <Field label="既存路線（延伸する場合）">
                  <LineSelector
                    lines={data.lines}
                    value={w.lineExistingId}
                    onChange={v => patch({ lineExistingId: v, lineJunctionId: null, lineStationIds: [] })}
                    placeholder="選択しない（新規）"
                  />
                </Field>
                <div className={isExtend ? 'opacity-30 pointer-events-none' : ''}>
                  <Field label="新規路線名 + 色">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Inp value={w.lineNewName} onChange={v => patch({ lineNewName: v, lineExistingId: '' })} placeholder="路線名" />
                      </div>
                      <input type="color" value={w.lineNewColor} onChange={e => patch({ lineNewColor: e.target.value })}
                        className="w-10 h-9 rounded cursor-pointer bg-transparent border border-slate-600" />
                    </div>
                  </Field>
                </div>
              </div>

              {/* 延伸モード: 端駅を選択 */}
              {isExtend && !w.lineJunctionId && (
                <Field label="延伸の起点（端駅をクリック）">
                  <MapEditor
                    stations={data.stations} pendingStations={w.pendingStations}
                    mapState={mapState} geometries={data.geometries}
                    highlightLineId={w.lineExistingId}
                    mode="single-select" selectedIds={[]}
                    highlightStationIds={endpoints}
                    onStationClick={handleStationClick}
                    canvas={data.canvas}
                  />
                  <p className="text-xs text-slate-500 mt-1">紫色の端駅をクリックして起点を選択</p>
                </Field>
              )}

              {isExtend && w.lineJunctionId && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">延伸起点:</span>
                  <span className="text-sm text-white bg-purple-800 px-2 py-0.5 rounded">{junctionName}</span>
                  <button onClick={() => patch({ lineJunctionId: null, lineStationIds: [] })}
                    className="text-xs text-slate-400 hover:text-white">変更</button>
                </div>
              )}

              {/* 駅選択 */}
              {(!isExtend || w.lineJunctionId) && (
                <Field label={isExtend ? '追加する駅（地図をクリック）' : '経由駅（順番にクリック）'}>
                  <MapEditor
                    stations={data.stations} pendingStations={w.pendingStations}
                    mapState={mapState} geometries={data.geometries}
                    highlightLineId={w.lineExistingId || undefined}
                    mode="multi-select" selectedIds={w.lineStationIds}
                    highlightStationIds={w.lineJunctionId ? [w.lineJunctionId] : []}
                    onStationClick={handleStationClick} onPlace={handlePlace}
                    canvas={data.canvas}
                  />
                  <div className="mt-2">
                    <StationOrderList stationIds={w.lineStationIds} allStations={data.stations} pendingStations={w.pendingStations}
                      onReorder={ids => patch({ lineStationIds: ids })}
                      onRemove={id => patch({ lineStationIds: w.lineStationIds.filter(x => x !== id) })} />
                  </div>
                </Field>
              )}

              {/* アニメーション設定 */}
              {isExtend && w.lineJunctionId && w.lineStationIds.length > 0 && (
                <Field label="アニメーション開始端">
                  <div className="flex gap-2">
                    {(['junction', 'tip'] as const).map(v => (
                      <button key={v} onClick={() => patch({ lineExtAnimFrom: v })}
                        className={`flex-1 text-sm py-1.5 rounded ${w.lineExtAnimFrom === v ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        {v === 'junction' ? junctionName : tipName}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {!isExtend && w.lineStationIds.length >= 2 && (
                <Field label="アニメーション開始端">
                  <div className="flex gap-2">
                    {(['start', 'end'] as const).map(v => (
                      <button key={v} onClick={() => patch({ lineAnimDir: v })}
                        className={`flex-1 text-sm py-1.5 rounded ${w.lineAnimDir === v ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        {v === 'start' ? startName : endName}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </>
          )
        })()}

        {/* ──── station_open ──── */}
        {w.type === 'station_open' && (
          <>
            <Field label="追加する路線">
              <LineSelector lines={data.lines} value={w.soLineId} onChange={v => patch({ soLineId: v, soAfterStationId: null })} />
            </Field>
            {w.soLineId && (
              <Field label="挿入位置（直前の駅）">
                <Sel value={w.soAfterStationId ?? ''} onChange={v => patch({ soAfterStationId: v || null })}>
                  <option value="">先頭に追加</option>
                  {activeStationsOnLine(w.soLineId).map(sid => {
                    const st = allStations.find(s => s.id === sid)
                    return st ? <option key={sid} value={sid}>{st.name}</option> : null
                  })}
                </Sel>
              </Field>
            )}
            <Field label="開業する駅（地図をクリック）">
              <MapEditor stations={data.stations} pendingStations={w.pendingStations} mapState={mapState} geometries={data.geometries}
                mode="single-select" selectedIds={selectedIds} onStationClick={handleStationClick} onPlace={handlePlace} canvas={data.canvas} />
              {w.soStationId && <p className="mt-1 text-sm text-blue-300">選択: {allStations.find(s => s.id === w.soStationId)?.name}</p>}
            </Field>
          </>
        )}

        {/* ──── line_close ──── */}
        {w.type === 'line_close' && (
          <>
            <Field label="廃線にする路線">
              <LineSelector lines={data.lines} value={w.clLineId} onChange={v => patch({ clLineId: v })} />
            </Field>
            {w.clLineId && (() => {
              const ids   = activeStationsOnLine(w.clLineId)
              const sName = allStations.find(s => s.id === ids[0])?.name ?? '始点'
              const eName = allStations.find(s => s.id === ids[ids.length - 1])?.name ?? '終点'
              return (
                <Field label="消去開始端">
                  <div className="flex gap-2">
                    {(['start', 'end'] as const).map(v => (
                      <button key={v} onClick={() => patch({ clAnimDirection: v })}
                        className={`flex-1 text-sm py-1.5 rounded ${w.clAnimDirection === v ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        {v === 'start' ? sName : eName}
                      </button>
                    ))}
                  </div>
                </Field>
              )
            })()}
          </>
        )}

        {/* ──── station_close ──── */}
        {w.type === 'station_close' && (
          <>
            <Field label="廃駅にする駅（地図をクリック）">
              <MapEditor stations={data.stations} pendingStations={w.pendingStations} mapState={mapState} geometries={data.geometries}
                mode="single-select" selectedIds={selectedIds} onStationClick={handleStationClick} onPlace={undefined} canvas={data.canvas} />
              {w.scStationId && <p className="mt-1 text-sm text-blue-300">選択: {data.stations.find(s => s.id === w.scStationId)?.name}</p>}
            </Field>
            <Field label="対象路線">
              <div className="flex gap-2 mb-2">
                <button onClick={() => patch({ scAllLines: true })} className={`flex-1 text-sm py-1.5 rounded ${w.scAllLines ? 'bg-blue-600' : 'bg-slate-700'}`}>すべての路線</button>
                <button onClick={() => patch({ scAllLines: false })} className={`flex-1 text-sm py-1.5 rounded ${!w.scAllLines ? 'bg-blue-600' : 'bg-slate-700'}`}>特定の路線のみ</button>
              </div>
              {!w.scAllLines && (
                <div className="space-y-1">
                  {data.lines.map(l => (
                    <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={w.scLineIds.includes(l.id)}
                        onChange={e => patch({ scLineIds: e.target.checked ? [...w.scLineIds, l.id] : w.scLineIds.filter(x => x !== l.id) })} />
                      <span style={{ color: l.color }}>■</span> {l.name}
                    </label>
                  ))}
                </div>
              )}
            </Field>
          </>
        )}

        {/* ──── section_replace ──── */}
        {w.type === 'section_replace' && (
          <>
            <Field label="改編する路線">
              <LineSelector
                lines={data.lines}
                value={w.srOldLineId}
                onChange={v => {
                  const stIds = mapState.activeLines.find(al => al.line.id === v)?.stationIds ?? []
                  const defaultAssign: Record<string, string> = {}
                  stIds.forEach(sid => { defaultAssign[sid] = w.srSections[0]?.sectionId ?? '' })
                  patch({ srOldLineId: v, srAssignments: defaultAssign })
                }}
              />
            </Field>
            {w.srOldLineId && (
              <>
                <Field label="駅を各区間に割り当て">
                  <div className="space-y-1">
                    {activeStationsOnLine(w.srOldLineId).map((sid, i) => {
                      const st = allStations.find(s => s.id === sid)
                      return (
                        <div key={sid} className="flex items-center gap-2 bg-slate-700/50 rounded px-2 py-1">
                          <span className="text-slate-400 text-xs w-4">{i + 1}</span>
                          <span className="flex-1 text-sm text-white">{st?.name ?? sid}</span>
                          <Sel value={w.srAssignments[sid] ?? ''} onChange={v => patch({ srAssignments: { ...w.srAssignments, [sid]: v } })}>
                            <option value="">未割当</option>
                            {w.srSections.map((sec, si) => <option key={sec.sectionId} value={sec.sectionId}>区間 {si + 1}</option>)}
                          </Sel>
                        </div>
                      )
                    })}
                  </div>
                </Field>
                <Field label="新区間の路線情報">
                  <div className="space-y-2">
                    {w.srSections.map((sec, si) => (
                      <div key={sec.sectionId} className="bg-slate-700/50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400 font-medium">区間 {si + 1}</span>
                          {w.srSections.length > 2 && (
                            <button onClick={() => patch({ srSections: w.srSections.filter(s => s.sectionId !== sec.sectionId) })} className="text-xs text-red-400 hover:text-red-300">削除</button>
                          )}
                        </div>
                        <div className="flex gap-2 mb-1">
                          {[false, true].map(ue => (
                            <button key={String(ue)} onClick={() => { const u = w.srSections.map(s => s.sectionId === sec.sectionId ? { ...s, useExisting: ue } : s); patch({ srSections: u }) }}
                              className={`text-xs px-2 py-0.5 rounded ${sec.useExisting === ue ? 'bg-blue-600' : 'bg-slate-600'}`}>
                              {ue ? '既存路線' : '新規作成'}
                            </button>
                          ))}
                        </div>
                        {sec.useExisting ? (
                          <LineSelector lines={data.lines.filter(l => l.id !== w.srOldLineId)} value={sec.existingLineId}
                            onChange={v => { const u = w.srSections.map(s => s.sectionId === sec.sectionId ? { ...s, existingLineId: v } : s); patch({ srSections: u }) }} />
                        ) : (
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <Inp value={sec.newLineName} onChange={v => { const u = w.srSections.map(s => s.sectionId === sec.sectionId ? { ...s, newLineName: v } : s); patch({ srSections: u }) }} placeholder="路線名" />
                            </div>
                            <input type="color" value={sec.newLineColor}
                              onChange={e => { const u = w.srSections.map(s => s.sectionId === sec.sectionId ? { ...s, newLineColor: e.target.value } : s); patch({ srSections: u }) }}
                              className="w-10 h-9 rounded cursor-pointer bg-transparent border border-slate-600" />
                          </div>
                        )}
                      </div>
                    ))}
                    <button onClick={() => patch({ srSections: [...w.srSections, { sectionId: genId(), useExisting: false, existingLineId: '', newLineName: '', newLineColor: '#10B981' }] })}
                      className="text-xs text-blue-400 hover:text-blue-300">+ 区間を追加</button>
                  </div>
                </Field>
              </>
            )}
          </>
        )}

        {/* Actions */}
        {w.type && (
          <div className="flex gap-2 pt-2">
            <button onClick={onCancel} className="flex-1 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg py-2">キャンセル</button>
            <button onClick={handleSave} className="flex-1 text-sm bg-green-600 hover:bg-green-500 rounded-lg py-2 font-medium">保存</button>
          </div>
        )}
      </div>
    </div>
  )
}
