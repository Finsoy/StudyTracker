import type {
  AppSettings,
  BlockedGame,
  DayStat,
  GoalStatus,
  SessionCategory,
  SteamGameCandidate,
  StatsRangeKind,
  TogglConnectionInfo,
  TogglProject,
  TogglStatus,
  TrackerState
} from './types'

export const IPC = {
  trackerGetState: 'tracker:getState',
  trackerStart: 'tracker:start',
  trackerStop: 'tracker:stop',
  statsGetDays: 'stats:getDays',
  statsGetGoal: 'stats:getGoal',
  gamesList: 'games:list',
  gamesAddManual: 'games:addManual',
  gamesScanSteam: 'games:scanSteam',
  gamesAddSteam: 'games:addSteam',
  gamesRemove: 'games:remove',
  gamesSetEnabled: 'games:setEnabled',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  togglGetStatus: 'toggl:getStatus',
  togglTestConnection: 'toggl:testConnection',
  togglSetToken: 'toggl:setToken',
  togglGetProjects: 'toggl:getProjects',
  togglCreateProject: 'toggl:createProject',
  eventTick: 'event:tick',
  eventBlocked: 'event:blocked'
} as const

export interface TickPayload {
  state: TrackerState
  goal: GoalStatus
}

export interface BlockedPayload {
  gameName: string
}

export interface StudyTrackerApi {
  tracker: {
    getState(): Promise<TrackerState>
    start(
      category: SessionCategory,
      note: string | null,
      projectId: number | null,
      projectName: string | null
    ): Promise<TrackerState>
    stop(): Promise<TrackerState>
  }
  stats: {
    getDays(kind: StatsRangeKind): Promise<DayStat[]>
    getGoal(): Promise<GoalStatus>
  }
  games: {
    list(): Promise<BlockedGame[]>
    addManual(): Promise<BlockedGame | null>
    scanSteam(): Promise<SteamGameCandidate[]>
    addSteam(candidates: SteamGameCandidate[]): Promise<BlockedGame[]>
    remove(id: number): Promise<void>
    setEnabled(id: number, enabled: boolean): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  toggl: {
    getStatus(): Promise<TogglStatus>
    testConnection(token: string): Promise<TogglConnectionInfo>
    setToken(token: string): Promise<TogglStatus>
    getProjects(): Promise<TogglProject[]>
    createProject(name: string): Promise<TogglProject>
  }
  events: {
    onTick(handler: (payload: TickPayload) => void): () => void
    onBlocked(handler: (payload: BlockedPayload) => void): () => void
  }
}
