// アニメーション・タイミング設定

const paramSettings = {
  // (a) アニメーション開始駅が出現するまでの時間 (ms)
  stationAppearMs: 400,

  // 路線描画アニメーションの長さ (ms) ── 開始駅出現完了後に開始
  animDurationMs: 4000,

  // (b) 途中・終了駅が出現するまでの時間 (ms)
  stationArriveMs: 300,

  // アニメーション完了後、次の年に進むまでの待機時間 (ms)
  pauseAfterAnimMs: 600,

  // 路線開業がない年の表示時間 (ms)
  yearDurationMs: 300,
} as const

export default paramSettings
