import type { LineGeometry } from './types'

type Pt = { x: number; y: number; tension?: number }

export function buildLinePoints(
  stationIds: string[],
  stationMap: Map<string, { x: number; y: number }>,
  geo?: LineGeometry
): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < stationIds.length; i++) {
    const s = stationMap.get(stationIds[i])
    if (!s) continue
    pts.push({ x: s.x, y: s.y })
    if (i < stationIds.length - 1) {
      const seg = geo?.segments.find(
        g => g.fromStationId === stationIds[i] && g.toStationId === stationIds[i + 1]
      )
      if (seg) {
        for (const wp of seg.waypoints) {
          pts.push({ x: wp.x, y: wp.y, tension: wp.tension })
        }
      }
    }
  }
  return pts
}

// Catmull-Rom → cubic Bézier with per-point tension.
// tension=0: straight lines, tension=1: standard Catmull-Rom, tension>1: exaggerated curves.
export function catmullRomPath(pts: Pt[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`

  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const t1 = p1.tension ?? 1.0
    const t2 = p2.tension ?? 1.0
    const cp1x = p1.x + t1 * (p2.x - p0.x) / 6
    const cp1y = p1.y + t1 * (p2.y - p0.y) / 6
    const cp2x = p2.x - t2 * (p3.x - p1.x) / 6
    const cp2y = p2.y - t2 * (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x},${p2.y}`
  }
  return d
}
