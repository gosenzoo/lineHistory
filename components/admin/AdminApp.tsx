'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { RailwayData, RailwayEvent } from '@/lib/types'
import { loadData, saveData, resetData } from '@/lib/store'
import { stations as defaultStations, lines as defaultLines, events as defaultEvents } from '@/lib/data'
import EventWizard from './EventWizard'
import EventEditor from './EventEditor'
import PathEditor from './PathEditor'

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  line_open:       { label: '路線開業',  cls: 'bg-green-800 text-green-200' },
  station_open:    { label: '駅開業',    cls: 'bg-teal-800 text-teal-200' },
  line_extend:     { label: '路線延伸',  cls: 'bg-blue-800 text-blue-200' },
  line_close:      { label: '廃線',      cls: 'bg-red-900 text-red-200' },
  station_close:   { label: '廃駅',      cls: 'bg-orange-900 text-orange-200' },
  section_replace: { label: '区間改編',  cls: 'bg-purple-800 text-purple-200' },
}

type LeftTab    = 'events' | 'lines' | 'bg'
type RightPanel = 'wizard' | 'event-editor' | 'path-editor' | null

export default function AdminApp() {
  const [data, setData] = useState<RailwayData>({
    stations: defaultStations,
    lines: defaultLines,
    events: defaultEvents,
    geometries: [],
  })
  const [leftTab,       setLeftTab]       = useState<LeftTab>('events')
  const [rightPanel,    setRightPanel]    = useState<RightPanel>(null)
  const [editingLineId, setEditingLineId] = useState('')
  const [editingEvent,  setEditingEvent]  = useState<RailwayEvent | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setData(loadData()) }, [])

  const handleDataUpdate = useCallback((newData: RailwayData) => {
    setData(newData)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveData(newData), 400)
  }, [])

  const handleWizardSave = useCallback((newData: RailwayData) => {
    saveData(newData)
    setData(newData)
    setRightPanel(null)
  }, [])

  const handleEditorSave = useCallback((newData: RailwayData) => {
    saveData(newData)
    setData(newData)
    setRightPanel(null)
    setEditingEvent(null)
  }, [])

  function openEventEditor(ev: RailwayEvent) {
    setEditingEvent(ev)
    setRightPanel('event-editor')
  }

  function handleReset() {
    if (!confirm('サンプルデータにリセットしますか？')) return
    resetData()
    const d = { stations: defaultStations, lines: defaultLines, events: defaultEvents, geometries: [] }
    setData(d)
    setRightPanel(null)
    setEditingEvent(null)
  }

  function openPathEditor(lineId: string) {
    setEditingLineId(lineId)
    setRightPanel('path-editor')
  }

  const sortedEvents = [...data.events].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
      <header className="flex items-center gap-4 px-6 py-3 bg-slate-900 border-b border-slate-700 shrink-0">
        <Link href="/" className="text-slate-400 hover:text-white text-sm transition-colors">← 路線図</Link>
        <h1 className="font-bold text-lg flex-1">管理画面</h1>
        <button onClick={handleReset} className="text-xs text-slate-500 hover:text-slate-300">リセット</button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-72 bg-slate-900 border-r border-slate-700 flex flex-col shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-slate-700 shrink-0">
            {(['events', 'lines', 'bg'] as LeftTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors
                  ${leftTab === tab ? 'text-white border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {tab === 'events' ? `イベント (${data.events.length})` : tab === 'lines' ? `路線 (${data.lines.length})` : '背景'}
              </button>
            ))}
          </div>

          {/* Events tab */}
          {leftTab === 'events' && (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 shrink-0">
                <span className="text-xs text-slate-400">時系列順</span>
                <button
                  onClick={() => { setRightPanel('wizard'); setEditingEvent(null) }}
                  className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-lg"
                >
                  + 追加
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-700/50">
                {sortedEvents.length === 0 ? (
                  <p className="text-slate-500 text-sm p-4">イベントがありません</p>
                ) : (
                  sortedEvents.map(ev => {
                    const badge     = TYPE_BADGE[ev.type]
                    const isEditing = rightPanel === 'event-editor' && editingEvent?.id === ev.id
                    return (
                      <div
                        key={ev.id}
                        className={`px-4 py-3 flex gap-2 transition-colors
                          ${isEditing ? 'bg-slate-700/60' : 'hover:bg-slate-800/50'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-slate-400 font-mono text-xs">{ev.date}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                          </div>
                          <p className="text-sm text-slate-300 leading-snug">{ev.label}</p>
                        </div>
                        {/* Action buttons */}
                        <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                          <button
                            onClick={() => openEventEditor(ev)}
                            className="text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm(`「${ev.label}」を削除しますか？`)) return
                              const newData = { ...data, events: data.events.filter(e => e.id !== ev.id) }
                              if (editingEvent?.id === ev.id) { setEditingEvent(null); setRightPanel(null) }
                              handleDataUpdate(newData)
                            }}
                            className="text-xs px-2 py-0.5 rounded bg-red-900/60 hover:bg-red-800 text-red-300"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}

          {/* Lines tab */}
          {leftTab === 'lines' && (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-700/50">
              {data.lines.length === 0 ? (
                <p className="text-slate-500 text-sm p-4">路線がありません</p>
              ) : (
                data.lines.map(line => {
                  const wpCount = data.geometries.find(g => g.lineId === line.id)
                    ?.segments.reduce((n, s) => n + s.waypoints.length, 0) ?? 0
                  return (
                    <div key={line.id} className="px-4 py-3 hover:bg-slate-800/50 flex items-center gap-3">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: line.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{line.name}</p>
                        <p className="text-xs text-slate-500">WP: {wpCount}個</p>
                      </div>
                      <button
                        onClick={() => openPathEditor(line.id)}
                        className={`text-xs px-2 py-1 rounded shrink-0 transition-colors
                          ${rightPanel === 'path-editor' && editingLineId === line.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                      >
                        パス編集
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Background tab */}
          {leftTab === 'bg' && (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {!data.background ? (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-600 rounded-lg py-8 cursor-pointer hover:border-slate-400 transition-colors">
                  <span className="text-slate-400 text-sm">画像を選択</span>
                  <span className="text-slate-600 text-xs">PNG / JPG など</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => {
                        const dataUrl = ev.target?.result as string
                        const img = new window.Image()
                        img.onload = () => {
                          const scale = Math.min(800 / img.naturalWidth, 550 / img.naturalHeight)
                          const w = img.naturalWidth * scale
                          const h = img.naturalHeight * scale
                          handleDataUpdate({
                            ...data,
                            background: {
                              dataUrl,
                              naturalWidth: img.naturalWidth,
                              naturalHeight: img.naturalHeight,
                              scale,
                              offsetX: Math.round((800 - w) / 2),
                              offsetY: Math.round((550 - h) / 2),
                              opacity: 0.5,
                            },
                          })
                        }
                        img.src = dataUrl
                      }
                      reader.readAsDataURL(file)
                      e.target.value = ''
                    }}
                  />
                </label>
              ) : (
                <>
                  {/* Preview */}
                  <img
                    src={data.background.dataUrl}
                    alt="背景プレビュー"
                    className="w-full rounded border border-slate-600 object-contain max-h-32"
                  />

                  {/* Scale */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>スケール</span>
                      <span className="font-mono text-slate-300">{data.background.scale.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range" min="0.05" max="5" step="0.01"
                      value={data.background.scale}
                      onChange={e => handleDataUpdate({ ...data, background: { ...data.background!, scale: parseFloat(e.target.value) } })}
                      className="w-full accent-blue-400"
                    />
                  </div>

                  {/* Opacity */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>不透明度</span>
                      <span className="font-mono text-slate-300">{Math.round(data.background.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range" min="0.05" max="1" step="0.01"
                      value={data.background.opacity}
                      onChange={e => handleDataUpdate({ ...data, background: { ...data.background!, opacity: parseFloat(e.target.value) } })}
                      className="w-full accent-blue-400"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const bg = data.background!
                        const w = bg.naturalWidth * bg.scale
                        const h = bg.naturalHeight * bg.scale
                        handleDataUpdate({ ...data, background: {
                          ...bg,
                          offsetX: Math.round((800 - w) / 2),
                          offsetY: Math.round((550 - h) / 2),
                        }})
                      }}
                      className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 rounded py-1.5"
                    >
                      中央に配置
                    </button>
                    <button
                      onClick={() => handleDataUpdate({ ...data, background: undefined })}
                      className="flex-1 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 rounded py-1.5"
                    >
                      削除
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    位置はパス編集画面で背景をドラッグして調整できます
                  </p>
                </>
              )}
            </div>
          )}

          <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500 shrink-0">
            <p>駅: {data.stations.length}件 ／ ジオメトリ: {data.geometries.length}路線</p>
          </div>
        </aside>

        {/* Right panel */}
        <main className="flex-1 overflow-y-auto">
          {rightPanel === 'wizard' && (
            <div className="max-w-4xl mx-auto px-6 py-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-base">イベント追加</h2>
                <button onClick={() => setRightPanel(null)} className="text-slate-400 hover:text-white text-sm">✕</button>
              </div>
              <EventWizard data={data} onSave={handleWizardSave} onCancel={() => setRightPanel(null)} />
            </div>
          )}

          {rightPanel === 'event-editor' && editingEvent && (
            <div className="max-w-lg mx-auto px-6 py-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-base">イベント編集</h2>
                <button onClick={() => { setRightPanel(null); setEditingEvent(null) }} className="text-slate-400 hover:text-white text-sm">✕</button>
              </div>
              <EventEditor
                event={editingEvent}
                data={data}
                onSave={handleEditorSave}
                onCancel={() => { setRightPanel(null); setEditingEvent(null) }}
              />
            </div>
          )}

          {rightPanel === 'path-editor' && (
            <div className="max-w-2xl mx-auto px-6 py-6">
              <PathEditor
                data={data}
                initialLineId={editingLineId}
                onUpdate={handleDataUpdate}
                onClose={() => setRightPanel(null)}
              />
            </div>
          )}

          {rightPanel === null && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
              <p className="text-4xl">🗺</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setRightPanel('wizard')}
                  className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg"
                >
                  + イベントを追加
                </button>
                <button
                  onClick={() => setLeftTab('lines')}
                  className="text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg"
                >
                  パスを編集
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
