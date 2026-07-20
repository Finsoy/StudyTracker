import type { DayStat, GoalStatus, StatsRangeKind } from '@shared/types'
import { dayKeyFor, isWeekendDayKey, recentDayKeys } from '@shared/time'
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
        dayKeys = recentDayKeys(todayKey, 7)
        break
      case 'last30':
        dayKeys = recentDayKeys(todayKey, 30)
        break
      case 'year':
        // ~53 weeks so the GitHub-style heatmap can align to week boundaries.
        dayKeys = recentDayKeys(todayKey, 371)
        break
    }
    return dayKeys.map((dayKey) => {
      const breakdown = sessionsRepo.dayBreakdown(dayKey)
      const base = breakdown.workSec + breakdown.studySec
      const isToday = dayKey === todayKey
      const liveExtra = isToday
        ? Math.max(0, this.tracker.accumulatedTodaySec() - sessionsRepo.sumForDay(dayKey))
        : 0
      const activeCategory = this.tracker.getActive()?.category
      return {
        date: dayKey,
        totalSec: base + liveExtra,
        workSec: breakdown.workSec + (activeCategory === 'work' ? liveExtra : 0),
        studySec: breakdown.studySec + (activeCategory === 'study' ? liveExtra : 0)
      }
    })
  }
}
