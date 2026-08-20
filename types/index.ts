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
  boardOrder?: number
  alightOrder?: number
  orderGap?: number
}

export interface Group {
  board: StationResult
  alight: StationResult
  routes: RouteInfo[]
  walk?: {
    startToBoard?: {
      distance?: number
      timeSec?: number
      kakaoUrl?: string
    }
    alightToEnd?: {
      distance?: number
      timeSec?: number
      kakaoUrl?: string
    }
    totalDistance?: number
    totalTimeSec?: number
  }
}

export interface TimetableEntry {
  boardStationId?: string
  routeId?: string
  routeName?: string
  routeTypeCd?: string
  boardTime?: string
  alightTime?: string
  vehId?: string
  alightStationId?: string
  boardStationName?: string
  alightStationName?: string
  orderGap?: number
  boardOrder?: number
  alightOrder?: number
  inferred?: boolean
  inference_method?: string | null
  inference_confidence?: string | null
  walkToBoardSec?: number
  walkFromAlightSec?: number
  walkTotalSec?: number
  walkToBoardDistance?: number
  walkFromAlightDistance?: number
  walkTotalDistance?: number
  remainSeatCnt?: number | null
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

export interface StationNumberMaps {
  boardByStationId: Record<string, number>
  boardByStationName: Record<string, number>
  alightByStationId: Record<string, number>
  alightByStationName: Record<string, number>
}

export interface RealtimeArrivalItem {
  stationId: string
  routeId: string
  staOrder: number | null
  routeName?: string
  predictTime1?: number | null
  predictTime2?: number | null
  predictTimes: number[]
  remainSeatCnt1?: number | null
  remainSeatCnt2?: number | null
  congestion1?: number | null
  congestion2?: number | null
  /** 몇 정거장 전인지 (예: 3 = "3정거장 전") */
  locationNo1?: number | null
  locationNo2?: number | null
  /** 저상버스 여부. 백엔드는 '1'/'' 문자열로 내려준다 */
  lowPlate1?: string | null
  lowPlate2?: string | null
}

export type RealtimeArrivalMap = Record<string, RealtimeArrivalItem>
