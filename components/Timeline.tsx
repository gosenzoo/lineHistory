'use client'

interface Props {
  year: number
  minYear: number
  maxYear: number
  isPlaying: boolean
  onYearChange: (year: number) => void
  onPlayPause: () => void
}

export default function Timeline({ year, minYear, maxYear, isPlaying, onYearChange, onPlayPause }: Props) {

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-slate-900 border-t border-slate-700">
      <button
        onClick={onPlayPause}
        className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 flex items-center justify-center text-white text-lg transition-colors"
        aria-label={isPlaying ? '一時停止' : '再生'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <span className="text-slate-400 text-sm tabular-nums">{minYear}</span>

      <input
        type="range"
        min={minYear}
        max={maxYear}
        value={year}
        onChange={e => onYearChange(parseInt(e.target.value))}
        className="flex-1 accent-blue-500 cursor-pointer"
      />

      <span className="text-slate-400 text-sm tabular-nums">{maxYear}</span>
    </div>
  )
}
