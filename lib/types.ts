export interface Station {
  id: string
  name: string
  x: number
  y: number
}

export interface Line {
  id: string
  name: string
  color: string
}

export interface ActiveLine {
  line: Line
  stationIds: string[]
}

export interface MapState {
  activeLines: ActiveLine[]
  activeStationIds: Set<string>
}

interface BaseEvent {
  id: string
  date: string
  label: string
}

export interface LineOpenEvent extends BaseEvent {
  type: 'line_open'
  lineId: string
  stationIds: string[]
}

export interface StationOpenEvent extends BaseEvent {
  type: 'station_open'
  stationId: string
  lineId: string
  afterStationId: string | null
}

export interface LineExtendEvent extends BaseEvent {
  type: 'line_extend'
  lineId: string
  stationIds: string[]
  direction: 'start' | 'end'
}

export interface LineCloseEvent extends BaseEvent {
  type: 'line_close'
  lineId: string
}

export interface StationCloseEvent extends BaseEvent {
  type: 'station_close'
  stationId: string
  lineIds?: string[]
}

export interface SectionReplaceEvent extends BaseEvent {
  type: 'section_replace'
  oldLineId: string
  newLines: { lineId: string; stationIds: string[] }[]
}

export type RailwayEvent =
  | LineOpenEvent
  | StationOpenEvent
  | LineExtendEvent
  | LineCloseEvent
  | StationCloseEvent
  | SectionReplaceEvent

export interface Waypoint {
  x: number
  y: number
  tension?: number
}

export interface LineSegmentGeometry {
  fromStationId: string
  toStationId: string
  waypoints: Waypoint[]
}

export interface LineGeometry {
  lineId: string
  segments: LineSegmentGeometry[]
  animDirection?: 'start' | 'end'  // 路線開業アニメーションの描画開始端（省略時: 'start'）
}

export interface BackgroundImage {
  dataUrl: string
  naturalWidth: number
  naturalHeight: number
  scale: number    // natural 寸法に掛けるスケール倍率
  offsetX: number  // SVG 座標系での左上 X
  offsetY: number  // SVG 座標系での左上 Y
  opacity: number  // 0–1
}

export interface RailwayData {
  stations: Station[]
  lines: Line[]
  events: RailwayEvent[]
  geometries: LineGeometry[]
  background?: BackgroundImage
}
