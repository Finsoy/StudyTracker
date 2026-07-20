import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import Database from 'better-sqlite3'
import type {
  AppSettings,
  BlockedGame,
  NewBlockedGame,
  Season,
  SeasonStatus,
  Session,
  SessionCategory
} from '@shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  goalWeekdaySec: 2 * 60 * 60,
  goalWeekendSec: 1 * 60 * 60,
  resetHour: 4,
  autostartEnabled: false,
  blockingEnabled: true,
  togglEnabled: false,
  togglWorkspaceId: null,
  streakMinSec: 30 * 60,
  gamificationEnabled: true
}

const TOGGL_TOKEN_KEY = 'togglApiToken'

let db: Database.Database

export function initDatabase(): void {
  const file = join(app.getPath('userData'), 'studytracker.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startedAt INTEGER NOT NULL,
      endedAt INTEGER NOT NULL,
      durationSec INTEGER NOT NULL,
      dayKey TEXT NOT NULL,
      category TEXT NOT NULL,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_dayKey ON sessions(dayKey);

    CREATE TABLE IF NOT EXISTS blocked_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      displayName TEXT NOT NULL,
      exeName TEXT,
      installDir TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      startDayKey TEXT NOT NULL,
      endDayKey TEXT NOT NULL,
      goalSec INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS milestone_unlocks (
      id TEXT PRIMARY KEY,
      achievedAt INTEGER NOT NULL
    );
  `)
}

interface SessionRow {
  id: number
  startedAt: number
  endedAt: number
  durationSec: number
  category: string
  note: string | null
}

interface GameRow {
  id: number
  type: string
  displayName: string
  exeName: string | null
  installDir: string | null
  enabled: number
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSec: row.durationSec,
    category: row.category as SessionCategory,
    note: row.note
  }
}

function rowToGame(row: GameRow): BlockedGame {
  return {
    id: row.id,
    type: row.type as BlockedGame['type'],
    displayName: row.displayName,
    exeName: row.exeName,
    installDir: row.installDir,
    enabled: row.enabled === 1
  }
}

export const sessionsRepo = {
  insert(session: {
    startedAt: number
    endedAt: number
    durationSec: number
    dayKey: string
    category: SessionCategory
    note: string | null
  }): Session {
    const result = db
      .prepare(
        `INSERT INTO sessions (startedAt, endedAt, durationSec, dayKey, category, note)
         VALUES (@startedAt, @endedAt, @durationSec, @dayKey, @category, @note)`
      )
      .run(session)
    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(result.lastInsertRowid) as SessionRow
    return rowToSession(row)
  },

  sumForDay(dayKey: string): number {
    const row = db
      .prepare('SELECT COALESCE(SUM(durationSec), 0) AS total FROM sessions WHERE dayKey = ?')
      .get(dayKey) as { total: number }
    return row.total
  },

  dayBreakdown(dayKey: string): { workSec: number; studySec: number } {
    const rows = db
      .prepare(
        `SELECT category, COALESCE(SUM(durationSec), 0) AS total
         FROM sessions WHERE dayKey = ? GROUP BY category`
      )
      .all(dayKey) as { category: string; total: number }[]
    let workSec = 0
    let studySec = 0
    for (const row of rows) {
      if (row.category === 'work') workSec = row.total
      if (row.category === 'study') studySec = row.total
    }
    return { workSec, studySec }
  },

  totalSecAllTime(): number {
    const row = db
      .prepare('SELECT COALESCE(SUM(durationSec), 0) AS total FROM sessions')
      .get() as { total: number }
    return row.total
  },

  /** Map of dayKey -> total seconds for days with any tracked time. */
  dailyTotals(): Map<string, number> {
    const rows = db
      .prepare(
        `SELECT dayKey, SUM(durationSec) AS total
         FROM sessions GROUP BY dayKey HAVING total > 0`
      )
      .all() as { dayKey: string; total: number }[]
    return new Map(rows.map((row) => [row.dayKey, row.total]))
  },

  /** Inclusive sum of durationSec for logical days in [startDayKey, endDayKey]. */
  sumForRange(startDayKey: string, endDayKey: string): number {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(durationSec), 0) AS total
         FROM sessions WHERE dayKey >= ? AND dayKey <= ?`
      )
      .get(startDayKey, endDayKey) as { total: number }
    return row.total
  }
}

interface SeasonRow {
  id: number
  name: string
  startDayKey: string
  endDayKey: string
  goalSec: number
  status: string
  createdAt: number
}

function rowToSeason(row: SeasonRow): Season {
  return {
    id: row.id,
    name: row.name,
    startDayKey: row.startDayKey,
    endDayKey: row.endDayKey,
    goalSec: row.goalSec,
    status: row.status as SeasonStatus,
    createdAt: row.createdAt
  }
}

export const seasonsRepo = {
  getActive(): Season | null {
    const row = db
      .prepare("SELECT * FROM seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1")
      .get() as SeasonRow | undefined
    return row ? rowToSeason(row) : null
  },

  list(): Season[] {
    const rows = db.prepare('SELECT * FROM seasons ORDER BY id DESC').all() as SeasonRow[]
    return rows.map(rowToSeason)
  },

  insert(season: {
    name: string
    startDayKey: string
    endDayKey: string
    goalSec: number
    createdAt: number
  }): Season {
    const result = db
      .prepare(
        `INSERT INTO seasons (name, startDayKey, endDayKey, goalSec, status, createdAt)
         VALUES (@name, @startDayKey, @endDayKey, @goalSec, 'active', @createdAt)`
      )
      .run(season)
    const row = db
      .prepare('SELECT * FROM seasons WHERE id = ?')
      .get(result.lastInsertRowid) as SeasonRow
    return rowToSeason(row)
  },

  setStatus(id: number, status: SeasonStatus): void {
    db.prepare('UPDATE seasons SET status = ? WHERE id = ?').run(status, id)
  }
}

export const milestonesRepo = {
  listUnlocked(): Map<string, number> {
    const rows = db.prepare('SELECT id, achievedAt FROM milestone_unlocks').all() as {
      id: string
      achievedAt: number
    }[]
    return new Map(rows.map((row) => [row.id, row.achievedAt]))
  },

  unlock(id: string, achievedAt: number): void {
    db.prepare('INSERT OR IGNORE INTO milestone_unlocks (id, achievedAt) VALUES (?, ?)').run(
      id,
      achievedAt
    )
  }
}

export const gamesRepo = {
  list(): BlockedGame[] {
    const rows = db.prepare('SELECT * FROM blocked_games ORDER BY displayName').all() as GameRow[]
    return rows.map(rowToGame)
  },

  insert(game: NewBlockedGame): BlockedGame {
    const result = db
      .prepare(
        `INSERT INTO blocked_games (type, displayName, exeName, installDir, enabled)
         VALUES (@type, @displayName, @exeName, @installDir, 1)`
      )
      .run(game)
    const row = db
      .prepare('SELECT * FROM blocked_games WHERE id = ?')
      .get(result.lastInsertRowid) as GameRow
    return rowToGame(row)
  },

  existsSteam(installDir: string): boolean {
    const row = db
      .prepare("SELECT 1 FROM blocked_games WHERE type = 'steam' AND installDir = ?")
      .get(installDir)
    return Boolean(row)
  },

  remove(id: number): void {
    db.prepare('DELETE FROM blocked_games WHERE id = ?').run(id)
  },

  setEnabled(id: number, enabled: boolean): void {
    db.prepare('UPDATE blocked_games SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  }
}

export const settingsRepo = {
  get(): AppSettings {
    const rows = db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const stored = new Map(rows.map((row) => [row.key, row.value]))
    return {
      goalWeekdaySec: numberOr(stored.get('goalWeekdaySec'), DEFAULT_SETTINGS.goalWeekdaySec),
      goalWeekendSec: numberOr(stored.get('goalWeekendSec'), DEFAULT_SETTINGS.goalWeekendSec),
      resetHour: numberOr(stored.get('resetHour'), DEFAULT_SETTINGS.resetHour),
      autostartEnabled: boolOr(stored.get('autostartEnabled'), DEFAULT_SETTINGS.autostartEnabled),
      blockingEnabled: boolOr(stored.get('blockingEnabled'), DEFAULT_SETTINGS.blockingEnabled),
      togglEnabled: boolOr(stored.get('togglEnabled'), DEFAULT_SETTINGS.togglEnabled),
      togglWorkspaceId: numberOrNull(stored.get('togglWorkspaceId')),
      streakMinSec: numberOr(stored.get('streakMinSec'), DEFAULT_SETTINGS.streakMinSec),
      gamificationEnabled: boolOr(
        stored.get('gamificationEnabled'),
        DEFAULT_SETTINGS.gamificationEnabled
      )
    }
  },

  update(patch: Partial<AppSettings>): AppSettings {
    const write = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    const apply = db.transaction((entries: [string, string][]) => {
      for (const [key, value] of entries) write.run(key, value)
    })
    const entries = Object.entries(patch).map(
      ([key, value]) => [key, value === null || value === undefined ? '' : String(value)] as [string, string]
    )
    apply(entries)
    return settingsRepo.get()
  }
}

/**
 * Stores the Toggl API token. The token is a credential, so it is encrypted via
 * Electron safeStorage when available; we never expose it back to the renderer.
 */
export const togglTokenRepo = {
  get(): string | null {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(TOGGL_TOKEN_KEY) as
      | { value: string }
      | undefined
    if (!row || !row.value) return null
    if (!row.value.startsWith('enc:')) return row.value
    if (!safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(row.value.slice(4), 'base64'))
    } catch {
      return null
    }
  },

  set(token: string): void {
    const trimmed = token.trim()
    const stored =
      trimmed && safeStorage.isEncryptionAvailable()
        ? 'enc:' + safeStorage.encryptString(trimmed).toString('base64')
        : trimmed
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(TOGGL_TOKEN_KEY, stored)
  },

  hasToken(): boolean {
    return Boolean(togglTokenRepo.get())
  }
}

function numberOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function numberOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function boolOr(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback
  return raw === 'true'
}
