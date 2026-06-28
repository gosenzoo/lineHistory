// アニメーション・タイミング設定

const paramSettings = {
  // 路線描画アニメーションの長さ (ms)
  animDurationMs: 1400,

  // アニメーション完了後、次の年に進むまでの待機時間 (ms)
  pauseAfterAnimMs: 600,

  // 路線開業がない年の表示時間 (ms)
  yearDurationMs: 300,
} as const

export default paramSettings
