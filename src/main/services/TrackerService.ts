import type { ActiveSession, SessionCategory, TrackerState } from '@shared/types'
import { dayKeyFor } from '@shared/time'
import { sessionsRepo, settingsRepo } from '../db/database'

export class TrackerService {
  private active: ActiveSession | null = null

  getActive(): ActiveSession | null {
    return this.active
  }

  start(category: SessionCategory, note: string | null): TrackerState {
    if (!this.active) {
      this.active = { startedAt: Date.now(), category, note }
    }
    return this.getState()
  }

  /** Persists the running session (if any) and clears the active state. */
  stop(): TrackerState {
    if (this.active) {
      const endedAt = Date.now()
      const durationSec = Math.max(0, Math.round((endedAt - this.active.startedAt) / 1000))
      if (durationSec > 0) {
        const resetHour = settingsRepo.get().resetHour
        sessionsRepo.insert({
          startedAt: this.active.startedAt,
          endedAt,
          durationSec,
          dayKey: dayKeyFor(this.active.startedAt, resetHour),
          category: this.active.category,
          note: this.active.note
        })
      }
      this.active = null
    }
    return this.getState()
  }

  /** Elapsed seconds of the currently running session, 0 when idle. */
  activeElapsedSec(): number {
    if (!this.active) return 0
    return Math.max(0, Math.round((Date.now() - this.active.startedAt) / 1000))
  }

  /**
   * Seconds accumulated towards today's goal: persisted sessions for the current
   * day key plus the live elapsed time of the active session when it belongs to
   * the same day.
   */
  accumulatedTodaySec(): number {
    const resetHour = settingsRepo.get().resetHour
    const todayKey = dayKeyFor(Date.now(), resetHour)
    let total = sessionsRepo.sumForDay(todayKey)
    if (this.active && dayKeyFor(this.active.startedAt, resetHour) === todayKey) {
      total += this.activeElapsedSec()
    }
    return total
  }

  getState(): TrackerState {
    return {
      active: this.active,
      todayTotalSec: this.accumulatedTodaySec()
    }
  }
}
