export interface StationResult {
  stationId: string
  stationName: string
  lon: string | number
  lat: string | number
  dist: number
}

export interface RouteInfo {
  routeId: string
  routeName: string
  routeTypeCd?: string
}

export interface Group {
  board: StationResult
  alight: StationResult
  routes: RouteInfo[]
}

export interface TimetableEntry {
  routeId?: string
  routeName?: string
  routeTypeCd?: string
  boardTime?: string
  alightTime?: string
  vehId?: string
  boardStationName?: string
  alightStationName?: string
  orderGap?: number
  boardOrder?: number
  alightOrder?: number
}

export interface RouteTimetable {
  routeId: string
  routeName: string
  routeTypeCd?: string
  entries: TimetableEntry[]
  orderGap?: number
  boardOrder?: number
  alightOrder?: number
}

export interface GroupTimetableData {
  combined: TimetableEntry[]
  timetables: RouteTimetable[]
}

export interface SearchResult {
  loading?: boolean
  error?: string
  groups?: Group[]
}

export interface GroupTimetableState {
  loading?: boolean
  error?: string
  data?: GroupTimetableData
  selectedRouteId?: string | null
}

export interface AllGroupsTimetableData {
  combined: TimetableEntry[]
}

export interface AllGroupsTimetableState {
  loading?: boolean
  error?: string
  data?: AllGroupsTimetableData
}

export interface KakaoPlace {
  place_name?: string
  address_name?: string
  road_address_name?: string
  x: string
  y: string
}

export interface DateBounds {
  min: string
  max: string
}

export interface PendingMapPoint {
  lon: string
  lat: string
}

export interface RouteBadgeInfo {
  routeId: string
  routeName: string
  routeTypeCd?: string
}
