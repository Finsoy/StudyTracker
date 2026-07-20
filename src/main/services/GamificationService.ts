import type {
  GamificationSnapshot,
  LevelInfo,
  MilestoneKind,
  MilestoneStatus,
  Season,
  SeasonProgress,
  StreakInfo
} from '@shared/types'
import { dayKeyFor, daysBetweenInclusive, isWeekendDayKey, shiftDayKey } from '@shared/time'
import { milestonesRepo, seasonsRepo, sessionsRepo, settingsRepo } from '../db/database'
import type { TrackerService } from './TrackerService'

/** Hours needed to finish level n (n >= 1). L1=2h, L2=3h, L3=4h, ... */
function hoursToClear(level: number): number {
  return 2 + (level - 1)
}

const TITLES: { minLevel: number; title: string }[] = [
  { minLevel: 1, title: 'Новичок' },
  { minLevel: 5, title: 'Ученик' },
  { minLevel: 10, title: 'Практик' },
  { minLevel: 20, title: 'Профи' },
  { minLevel: 35, title: 'Мастер' },
  { minLevel: 50, title: 'Гуру' }
]

const MILESTONE_DEFS: {
  id: string
  kind: MilestoneKind
  threshold: number
  label: string
  hint: string
}[] = [
  { id: 'streak_3', kind: 'streak', threshold: 3, label: 'Стрик 3 дня', hint: '3 зачётных дня подряд' },
  {
    id: 'streak_7',
    kind: 'streak',
    threshold: 7,
    label: 'Неделя без пропусков',
    hint: '7 дней подряд'
  },
  {
    id: 'streak_30',
    kind: 'streak',
    threshold: 30,
    label: 'Стрик 30 дней',
    hint: '30 дней подряд'
  },
  { id: 'hours_10', kind: 'totalHours', threshold: 10, label: '10 часов', hint: '10 часов суммарно' },
  { id: 'hours_50', kind: 'totalHours', threshold: 50, label: '50 часов', hint: '50 часов суммарно' },
  {
    id: 'hours_100',
    kind: 'totalHours',
    threshold: 100,
    label: '100 часов',
    hint: '100 часов суммарно'
  },
  {
    id: 'season_1',
    kind: 'season',
    threshold: 1,
    label: 'Сезон закрыт',
    hint: 'Выполни цель сезона'
  }
]

function titleFor(level: number): string {
  let title = TITLES[0].title
  for (const entry of TITLES) {
    if (level >= entry.minLevel) title = entry.title
    else break
  }
  return title
}

/** True when every day strictly between `from` and `to` is a weekend. */
function onlyWeekendsBetween(fromDayKey: string, toDayKey: string): boolean {
  let cursor = shiftDayKey(fromDayKey, 1)
  while (cursor < toDayKey) {
    if (!isWeekendDayKey(cursor)) return false
    cursor = shiftDayKey(cursor, 1)
  }
  return cursor === toDayKey
}

/**
 * Longest streak of qualifying days. Empty weekends between them do not break
 * the run (rest days); a missed weekday does.
 */
function longestRun(totals: Map<string, number>, minSec: number): number {
  const keys = [...totals.entries()]
    .filter(([, total]) => total >= minSec)
    .map(([key]) => key)
    .sort()

  let best = 0
  let run = 0
  let previous: string | null = null
  for (const key of keys) {
    if (
      previous !== null &&
      (key === shiftDayKey(previous, 1) || onlyWeekendsBetween(previous, key))
    ) {
      run += 1
    } else {
      run = 1
    }
    best = Math.max(best, run)
    previous = key
  }
  return best
}

function computeLevel(totalSec: number): LevelInfo {
  const totalHours = totalSec / 3600
  let level = 1
  let clearedHours = 0
  for (;;) {
    const need = hoursToClear(level)
    if (totalHours >= clearedHours + need) {
      clearedHours += need
      level += 1
    } else {
      break
    }
  }
  const levelStartSec = clearedHours * 3600
  const nextLevelSec = (clearedHours + hoursToClear(level)) * 3600
  const span = nextLevelSec - levelStartSec
  const progress = span > 0 ? Math.min(1, Math.max(0, (totalSec - levelStartSec) / span)) : 0
  return {
    level,
    title: titleFor(level),
    totalSec,
    levelStartSec,
    nextLevelSec,
    progress
  }
}

function defaultSeasonName(startDayKey: string): string {
  const [, month, day] = startDayKey.split('-')
  return `Сезон ${day}.${month}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export class GamificationService {
  private cachedStreakCurrent = 0
  private cachedStreakAtMs = 0

  constructor(private readonly tracker: TrackerService) {}

  getSnapshot(): GamificationSnapshot {
    const settings = settingsRepo.get()
    this.expireActiveSeasonIfNeeded()
    const streak = this.computeStreak(settings.streakMinSec)
    // Include live active session so XP bar moves before stop().
    const totalSec = sessionsRepo.totalSecAllTime() + this.tracker.activeElapsedSec()
    const level = computeLevel(totalSec)
    const season = this.getSeasonProgress()
    const milestones = this.buildMilestoneStatuses(streak, level, season)
    return {
      enabled: settings.gamificationEnabled,
      streak,
      level,
      season,
      milestones
    }
  }

  /** Cached streak length for the 1Hz tick; recomputed at most every 15s. */
  getStreakCurrentCached(): number {
    const now = Date.now()
    if (now - this.cachedStreakAtMs >= 15_000) {
      const settings = settingsRepo.get()
      this.cachedStreakCurrent = this.computeStreak(settings.streakMinSec).current
      this.cachedStreakAtMs = now
    }
    return this.cachedStreakCurrent
  }

  /** Persists newly earned milestones; returns only those unlocked in this call. */
  checkNewMilestones(): MilestoneStatus[] {
    this.expireActiveSeasonIfNeeded()
    const unlocked = milestonesRepo.listUnlocked()
    const settings = settingsRepo.get()
    const streak = this.computeStreak(settings.streakMinSec)
    const totalSec = sessionsRepo.totalSecAllTime() + this.tracker.activeElapsedSec()
    const level = computeLevel(totalSec)
    const season = this.getSeasonProgress()
    const now = Date.now()
    const newly: MilestoneStatus[] = []

    for (const def of MILESTONE_DEFS) {
      if (unlocked.has(def.id)) continue
      if (!this.isMilestoneAchieved(def, streak, level, season)) continue
      milestonesRepo.unlock(def.id, now)
      newly.push({
        id: def.id,
        kind: def.kind,
        label: def.label,
        hint: def.hint,
        achieved: true,
        achievedAt: now
      })
    }
    return newly
  }

  createSeason(input: { name?: string; weeks?: number; goalHours?: number }): Season {
    const weeks = input.weeks && input.weeks > 0 ? input.weeks : 4
    const resetHour = settingsRepo.get().resetHour
    const startDayKey = dayKeyFor(Date.now(), resetHour)
    const endDayKey = shiftDayKey(startDayKey, weeks * 7 - 1)
    const goalHours = input.goalHours ?? weeks * 7 * 1.5
    const goalSec = Math.round(goalHours * 3600)

    const active = seasonsRepo.getActive()
    if (active) {
      seasonsRepo.setStatus(active.id, 'archived')
    }

    return seasonsRepo.insert({
      name: input.name?.trim() || defaultSeasonName(startDayKey),
      startDayKey,
      endDayKey,
      goalSec,
      createdAt: Date.now()
    })
  }

  completeActiveSeason(): void {
    const progress = this.getSeasonProgress()
    if (!progress) return
    if (progress.accumulatedSec >= progress.goalSec) {
      milestonesRepo.unlock('season_1', Date.now())
    }
    seasonsRepo.setStatus(progress.season.id, 'completed')
  }

  private expireActiveSeasonIfNeeded(): void {
    const progress = this.getSeasonProgress()
    if (!progress) return
    const resetHour = settingsRepo.get().resetHour
    const todayKey = dayKeyFor(Date.now(), resetHour)
    if (todayKey > progress.season.endDayKey) {
      if (progress.accumulatedSec >= progress.goalSec) {
        milestonesRepo.unlock('season_1', Date.now())
      }
      seasonsRepo.setStatus(progress.season.id, 'completed')
    }
  }

  private getSeasonProgress(): SeasonProgress | null {
    const season = seasonsRepo.getActive()
    if (!season) return null

    const settings = settingsRepo.get()
    const resetHour = settings.resetHour
    const todayKey = dayKeyFor(Date.now(), resetHour)
    const endCap = todayKey < season.endDayKey ? todayKey : season.endDayKey

    let accumulatedSec = sessionsRepo.sumForRange(season.startDayKey, season.endDayKey)
    const active = this.tracker.getActive()
    if (active) {
      const activeDayKey = dayKeyFor(active.startedAt, resetHour)
      if (activeDayKey >= season.startDayKey && activeDayKey <= season.endDayKey) {
        accumulatedSec += this.tracker.activeElapsedSec()
      }
    }

    const daysTotal = daysBetweenInclusive(season.startDayKey, season.endDayKey)
    const daysElapsed =
      todayKey < season.startDayKey
        ? 0
        : clamp(daysBetweenInclusive(season.startDayKey, endCap), 0, daysTotal)
    const daysLeft = Math.max(0, daysTotal - daysElapsed)

    const totals = sessionsRepo.dailyTotals()
    let activeDays = 0
    let cursor = season.startDayKey
    while (cursor <= endCap) {
      let daySec = totals.get(cursor) ?? 0
      if (
        active &&
        dayKeyFor(active.startedAt, resetHour) === cursor &&
        cursor === todayKey
      ) {
        daySec = this.tracker.accumulatedTodaySec()
      }
      if (daySec >= settings.streakMinSec) activeDays += 1
      cursor = shiftDayKey(cursor, 1)
    }

    const progress =
      season.goalSec > 0 ? clamp(accumulatedSec / season.goalSec, 0, 1) : 0

    return {
      season,
      accumulatedSec,
      goalSec: season.goalSec,
      progress,
      daysTotal,
      daysElapsed,
      daysLeft,
      activeDays
    }
  }

  private isMilestoneAchieved(
    def: (typeof MILESTONE_DEFS)[number],
    streak: StreakInfo,
    level: LevelInfo,
    season: SeasonProgress | null
  ): boolean {
    switch (def.kind) {
      case 'streak':
        return streak.best >= def.threshold
      case 'totalHours':
        return level.totalSec >= def.threshold * 3600
      case 'season':
        return (
          milestonesRepo.listUnlocked().has('season_1') ||
          (season !== null && season.accumulatedSec >= season.goalSec)
        )
    }
  }

  private buildMilestoneStatuses(
    streak: StreakInfo,
    level: LevelInfo,
    season: SeasonProgress | null
  ): MilestoneStatus[] {
    const unlocked = milestonesRepo.listUnlocked()
    return MILESTONE_DEFS.map((def) => {
      const achievedAt = unlocked.get(def.id) ?? null
      const achievedNow = this.isMilestoneAchieved(def, streak, level, season)
      return {
        id: def.id,
        kind: def.kind,
        label: def.label,
        hint: def.hint,
        achieved: achievedAt !== null || achievedNow,
        achievedAt
      }
    })
  }

  private computeStreak(minSec: number): StreakInfo {
    const resetHour = settingsRepo.get().resetHour
    const todayKey = dayKeyFor(Date.now(), resetHour)
    const totals = sessionsRepo.dailyTotals()

    let todaySec = totals.get(todayKey) ?? 0
    const active = this.tracker.getActive()
    if (active && dayKeyFor(active.startedAt, resetHour) === todayKey) {
      todaySec = this.tracker.accumulatedTodaySec()
    }
    const todayQualified = todaySec >= minSec

    const isQualified = (key: string): boolean => {
      if (key === todayKey) return todayQualified
      return (totals.get(key) ?? 0) >= minSec
    }

    // Empty weekends are rest days: skip them. A missed weekday breaks the chain.
    // Qualifying on a weekend still adds +1 (bonus day).
    const skipEmptyWeekend = (key: string): string => {
      let cursor = key
      while (isWeekendDayKey(cursor) && !isQualified(cursor)) {
        cursor = shiftDayKey(cursor, -1)
      }
      return cursor
    }

    // If today is not qualified yet, count from yesterday — streak stays "alive".
    let cursor = skipEmptyWeekend(todayQualified ? todayKey : shiftDayKey(todayKey, -1))
    let current = 0
    while (isQualified(cursor)) {
      current += 1
      cursor = skipEmptyWeekend(shiftDayKey(cursor, -1))
    }

    const previousAnchor = skipEmptyWeekend(shiftDayKey(todayKey, -1))
    const aliveToday = todayQualified || isQualified(previousAnchor)
    const best = Math.max(current, longestRun(totals, minSec))

    return {
      current,
      best,
      minSec,
      todayQualified,
      aliveToday
    }
  }
}
