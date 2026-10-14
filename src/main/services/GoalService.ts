import type { DayStat, GoalStatus, StatsRangeKind, StatsSummary } from '@shared/types'
import {
  dayKeyFor,
  daysBetweenInclusive,
  isWeekendDayKey,
  recentDayKeys,
  shiftDayKey,
  weekStartDayKeyFor
} from '@shared/time'
import { sessionsRepo, settingsRepo } from '../db/database'
import type { TrackerService } from './TrackerService'

export class GoalService {
  constructor(private readonly tracker: TrackerService) {}

  private goalSecForDay(dayKey: string): { goalSec: number; isWeekend: boolean } {
    const settings = settingsRepo.get()
    const isWeekend = isWeekendDayKey(dayKey)
    return {
      goalSec: isWeekend ? settings.goalWeekendSec : settings.goalWeekdaySec,
      isWeekend
    }
  }

  getStatus(): GoalStatus {
    const resetHour = settingsRepo.get().resetHour
    const dayKey = dayKeyFor(Date.now(), resetHour)
    const { goalSec, isWeekend } = this.goalSecForDay(dayKey)
    const accumulatedSec = this.tracker.accumulatedTodaySec()
    const remainingSec = Math.max(0, goalSec - accumulatedSec)
    return {
      dayKey,
      goalSec,
      accumulatedSec,
      remainingSec,
      isMet: accumulatedSec >= goalSec,
      isWeekend
    }
  }

  /** True when games must stay blocked right now. */
  isBlockingActive(): boolean {
    const settings = settingsRepo.get()
    if (!settings.blockingEnabled) return false
    return !this.getStatus().isMet
  }

  getSummary(): StatsSummary {
    const resetHour = settingsRepo.get().resetHour
    const dayKey = dayKeyFor(Date.now(), resetHour)
    const weekStartDayKey = weekStartDayKeyFor(dayKey)
    const previousWeekStartDayKey = shiftDayKey(weekStartDayKey, -7)
    const previousWeekSameDaysEnd = shiftDayKey(dayKey, -7)
    const monthStartDayKey = `${dayKey.slice(0, 7)}-01`
    const totals = sessionsRepo.dailyTotals()
    const active = this.tracker.getActive()
    const activeSec = this.tracker.activeElapsedSec()
    if (active && activeSec > 0) {
      // Match stop(): a session belongs to the logical day on which it started.
      const activeDayKey = dayKeyFor(active.startedAt, resetHour)
      totals.set(activeDayKey, (totals.get(activeDayKey) ?? 0) + activeSec)
    }

    let currentWeekSec = 0
    let previousWeekSec = 0
    let previousWeekSameDaysSec = 0
    let currentMonthSec = 0
    let allTimeSec = 0
    let completedWeeksSec = 0
    let firstDayKey = dayKey
    for (const [date, totalSec] of totals) {
      allTimeSec += totalSec
      if (date < firstDayKey) firstDayKey = date
      if (date >= weekStartDayKey && date <= dayKey) currentWeekSec += totalSec
      if (date >= previousWeekStartDayKey && date < weekStartDayKey) previousWeekSec += totalSec
      if (date >= previousWeekStartDayKey && date <= previousWeekSameDaysEnd) {
        previousWeekSameDaysSec += totalSec
      }
      if (date >= monthStartDayKey && date <= dayKey) currentMonthSec += totalSec
      if (date < weekStartDayKey) completedWeeksSec += totalSec
    }

    // Include empty weeks since the first tracked week, but exclude the current one.
    const completedWeekCount = Math.max(
      0,
      Math.ceil((daysBetweenInclusive(firstDayKey, weekStartDayKey) - 1) / 7)
    )
    return {
      dayKey,
      weekStartDayKey,
      previousWeekStartDayKey,
      currentWeekSec,
      previousWeekSec,
      previousWeekSameDaysSec,
      currentMonthSec,
      allTimeSec,
      averageWeekSec: completedWeekCount > 0 ? completedWeeksSec / completedWeekCount : null,
      completedWeekCount
    }
  }

  getDayStats(kind: StatsRangeKind): DayStat[] {
    const resetHour = settingsRepo.get().resetHour
    const todayKey = dayKeyFor(Date.now(), resetHour)
    let dayKeys: string[]
    switch (kind) {
      case 'today':
        dayKeys = [todayKey]
        break
      case 'yesterday':
        dayKeys = [recentDayKeys(todayKey, 2)[0]]
        break
      case 'week':
        dayKeys = recentDayKeys(shiftDayKey(weekStartDayKeyFor(todayKey), 6), 7)
        break
      case 'last30':
        dayKeys = recentDayKeys(todayKey, 30)
        break
      case 'year':
        // ~53 weeks so the GitHub-style heatmap can align to week boundaries.
        dayKeys = recentDayKeys(todayKey, 371)
        break
    }
    const active = this.tracker.getActive()
    const activeDayKey = active ? dayKeyFor(active.startedAt, resetHour) : null
    const activeSec = this.tracker.activeElapsedSec()
    return dayKeys.map((dayKey) => {
      if (dayKey > todayKey) return { date: dayKey, totalSec: 0, workSec: 0, studySec: 0 }
      const breakdown = sessionsRepo.dayBreakdown(dayKey)
      const base = breakdown.workSec + breakdown.studySec
      // Use the same starting day as getSummary() and TrackerService.stop().
      const liveExtra = dayKey === activeDayKey ? activeSec : 0
      return {
        date: dayKey,
        totalSec: base + liveExtra,
        workSec: breakdown.workSec + (active?.category === 'work' ? liveExtra : 0),
        studySec: breakdown.studySec + (active?.category === 'study' ? liveExtra : 0)
      }
    })
  }
}
