import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import Database from 'better-sqlite3'
import type {
  AppSettings,
  BlockedGame,
  NewBlockedGame,
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
  togglWorkspaceId: null
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
      togglWorkspaceId: numberOrNull(stored.get('togglWorkspaceId'))
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
