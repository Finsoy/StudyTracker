export type SessionCategory = 'work' | 'study'

export type GameType = 'manual' | 'steam'

export interface Session {
  id: number
  startedAt: number
  endedAt: number
  durationSec: number
  category: SessionCategory
  note: string | null
}

export interface ActiveSession {
  startedAt: number
  category: SessionCategory
  note: string | null
}

export interface BlockedGame {
  id: number
  type: GameType
  displayName: string
  exeName: string | null
  installDir: string | null
  enabled: boolean
}

export interface NewBlockedGame {
  type: GameType
  displayName: string
  exeName: string | null
  installDir: string | null
}

export interface AppSettings {
  goalWeekdaySec: number
  goalWeekendSec: number
  resetHour: number
  autostartEnabled: boolean
  blockingEnabled: boolean
}

export interface GoalStatus {
  dayKey: string
  goalSec: number
  accumulatedSec: number
  remainingSec: number
  isMet: boolean
  isWeekend: boolean
}

export interface DayStat {
  date: string
  totalSec: number
  workSec: number
  studySec: number
}

export interface TrackerState {
  active: ActiveSession | null
  todayTotalSec: number
}

export interface SteamGameCandidate {
  appId: string
  name: string
  installDir: string
}

export type StatsRangeKind = 'today' | 'yesterday' | 'week' | 'last30'
