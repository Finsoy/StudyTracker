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
  projectId: number | null
  projectName: string | null
  togglEntryId: number | null
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
  togglEnabled: boolean
  togglWorkspaceId: number | null
  /** Minimum seconds in a logical day to count toward the streak. */
  streakMinSec: number
  gamificationEnabled: boolean
}

export interface TogglProject {
  id: number
  name: string
  color: string
  active: boolean
}

export interface TogglConnectionInfo {
  email: string
  fullName: string
  workspaceId: number
  workspaceName: string
}

export interface TogglStatus {
  enabled: boolean
  connected: boolean
  lastError: string | null
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

export type StatsRangeKind = 'today' | 'yesterday' | 'week' | 'last30' | 'year'

export type SeasonStatus = 'active' | 'completed' | 'archived'

export interface Season {
  id: number
  name: string
  startDayKey: string
  endDayKey: string
  goalSec: number
  status: SeasonStatus
  createdAt: number
}

export interface StreakInfo {
  current: number
  best: number
  minSec: number
  todayQualified: boolean
  /** Streak is not broken yet — today can still be saved. */
  aliveToday: boolean
}

export interface LevelInfo {
  level: number
  title: string
  totalSec: number
  levelStartSec: number
  nextLevelSec: number
  /** 0..1 progress within the current level. */
  progress: number
}

export interface SeasonProgress {
  season: Season
  accumulatedSec: number
  goalSec: number
  progress: number
  daysTotal: number
  daysElapsed: number
  daysLeft: number
  activeDays: number
}

export type MilestoneKind = 'streak' | 'totalHours' | 'season'

export interface MilestoneStatus {
  id: string
  kind: MilestoneKind
  label: string
  hint: string
  achieved: boolean
  achievedAt: number | null
}

export interface GamificationSnapshot {
  enabled: boolean
  streak: StreakInfo
  level: LevelInfo
  season: SeasonProgress | null
  milestones: MilestoneStatus[]
}
