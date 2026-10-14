import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import typescript from 'typescript'

function compileSource(path) {
  return typescript.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022
    }
  }).outputText
}

const time = {}
runInNewContext(compileSource('../src/shared/time.ts'), { exports: time, Date })
const serviceSource = compileSource('../src/main/services/GamificationService.ts')

function createService({
  totals = [],
  activeSec = 0,
  season = null,
  seasons = season ? [season] : [],
  settings = {},
  unlocked = [],
  now = '2026-10-14T12:00:00'
} = {}) {
  const nowMs = new Date(now).getTime()
  const state = {
    totals: new Map(totals),
    activeSec,
    activeStartedAt: null,
    nowMs,
    seasons: seasons.map((entry) => ({ status: 'active', createdAt: 0, ...entry })),
    settings: {
      resetHour: 4,
      streakMinSec: 1800,
      gamificationEnabled: true,
      goalWeekdaySec: 60,
      goalWeekendSec: 120,
      ...settings
    },
    unlocked: new Map(unlocked)
  }
  const exports = {}
  class FixedDate extends Date {
    static now() {
      return state.nowMs
    }
  }
  runInNewContext(serviceSource, {
    exports,
    Date: FixedDate,
    require: (specifier) => {
      if (specifier === '@shared/time') return time
      assert.equal(specifier, '../db/database')
      return {
        settingsRepo: {
          get: () => state.settings
        },
        sessionsRepo: {
          dailyTotals: () => new Map(state.totals),
          totalSecAllTime: () =>
            [...state.totals.values()].reduce((sum, seconds) => sum + seconds, 0),
          sumForRange: (start, end) =>
            [...state.totals].reduce(
              (sum, [day, seconds]) => sum + (day >= start && day <= end ? seconds : 0),
              0
            )
        },
        seasonsRepo: {
          getActive: () =>
            [...state.seasons].reverse().find((entry) => entry.status === 'active') ?? null,
          list: () => state.seasons.map((entry) => ({ ...entry })).reverse(),
          insert: (input) => {
            const entry = {
              ...input,
              id: Math.max(0, ...state.seasons.map((season) => season.id)) + 1,
              status: 'active'
            }
            state.seasons.push(entry)
            return { ...entry }
          },
          setStatus: (id, status) => {
            state.seasons.find((entry) => entry.id === id).status = status
          },
          updateGoalSec: (id, goalSec) => {
            state.seasons.find((entry) => entry.id === id).goalSec = goalSec
          }
        },
        milestonesRepo: {
          listUnlocked: () => new Map(state.unlocked),
          unlock: (id, achievedAt) => {
            if (!state.unlocked.has(id)) state.unlocked.set(id, achievedAt)
          }
        }
      }
    }
  })
  const tracker = {
    getActive: () =>
      state.activeSec > 0
        ? { startedAt: state.activeStartedAt ?? state.nowMs - state.activeSec * 1000 }
        : null,
    activeElapsedSec: () => state.activeSec,
    accumulatedTodaySec: () =>
      (state.totals.get(time.dayKeyFor(state.nowMs, state.settings.resetHour)) ?? 0) +
      state.activeSec
  }
  const service = new exports.GamificationService(tracker)
  const getMilestone = (id) =>
    service.getSnapshot().milestones.find((milestone) => milestone.id === id)
  return {
    service,
    state,
    getMilestone,
    nowMs,
    restart: () => new exports.GamificationService(tracker)
  }
}

test('empty history has twelve unique achievements and the automatic monthly target', () => {
  const { service, getMilestone } = createService()
  const milestones = service.getSnapshot().milestones
  assert.equal(milestones.length, 12)
  assert.equal(new Set(milestones.map((milestone) => milestone.id)).size, 12)
  assert.ok(milestones.every((milestone) => !milestone.achieved && milestone.currentValue === 0))
  assert.equal(getMilestone('hours_1').targetValue, 3600)
  assert.equal(getMilestone('streak_14').targetValue, 14)
  assert.equal(getMilestone('season_1').targetValue, 22 * 60 + 9 * 120)
})

test('new time milestones unlock at the exact threshold, include live time, and are awarded once', () => {
  for (const hours of [1, 5, 25, 250]) {
    const { service, state, getMilestone, nowMs } = createService({
      totals: [['2026-10-14', hours * 3600 - 1]]
    })
    const id = `hours_${hours}`
    assert.equal(getMilestone(id).achieved, false)
    assert.equal(getMilestone(id).currentValue, hours * 3600 - 1)
    assert.equal(getMilestone(id).targetValue, hours * 3600)
    state.activeSec = 1
    assert.equal(getMilestone(id).achieved, true)
    assert.equal(getMilestone(id).achievedAt, null)
    const newly = service.checkNewMilestones().find((milestone) => milestone.id === id)
    assert.equal(newly.currentValue, hours * 3600)
    assert.equal(newly.achievedAt, nowMs)
    assert.equal(service.checkNewMilestones().length, 0)
    state.totals.set('2026-10-14', hours * 3600)
    state.activeSec = 0
    assert.equal(getMilestone(id).currentValue, hours * 3600)
  }
})

test('an unfinished streak uses the current series while a historical fourteen-day record earns its badge', () => {
  const totals = Array.from({ length: 13 }, (_, i) => [time.shiftDayKey('2026-09-01', i), 1800])
  const { service, state, getMilestone } = createService({ totals })
  assert.equal(service.getSnapshot().streak.best, 13)
  assert.equal(getMilestone('streak_14').currentValue, 0)
  assert.equal(getMilestone('streak_14').achieved, false)
  state.totals.set('2026-09-14', 1800)
  assert.equal(getMilestone('streak_14').achieved, true)
  assert.ok(service.checkNewMilestones().some((milestone) => milestone.id === 'streak_14'))
  assert.equal(getMilestone('streak_30').currentValue, 0)
  assert.equal(getMilestone('streak_30').achieved, false)
})

test('empty weekends preserve a series and live time qualifies today exactly at the daily minimum', () => {
  const { state, getMilestone } = createService({
    now: '2026-10-13T12:00:00',
    totals: [
      ['2026-10-09', 1800],
      ['2026-10-12', 1800],
      ['2026-10-13', 1799]
    ]
  })
  assert.equal(getMilestone('streak_3').currentValue, 2)
  assert.equal(getMilestone('streak_3').achieved, false)
  state.activeSec = 1
  assert.equal(getMilestone('streak_3').currentValue, 3)
  assert.equal(getMilestone('streak_3').achieved, true)
})

test('stored achievements and their original dates survive lower current totals or a broken series', () => {
  const unlocked = [
    ['hours_10', 100],
    ['streak_7', 200],
    ['season_1', 300]
  ]
  const { service, state, getMilestone } = createService({ unlocked })
  for (const [id, achievedAt] of unlocked) {
    assert.equal(getMilestone(id).achieved, true)
    assert.equal(getMilestone(id).achievedAt, achievedAt)
  }
  assert.equal(service.checkNewMilestones().length, 0)
  assert.deepEqual([...state.unlocked], unlocked)
})

test('season progress uses its own time range and goal, and the badge survives completion', () => {
  const { service, state, getMilestone } = createService({
    totals: [
      ['2026-09-01', 36000],
      ['2026-10-13', 3600],
      ['2026-10-14', 600]
    ],
    activeSec: 1200,
    settings: { goalWeekdaySec: 180, goalWeekendSec: 360 },
    season: {
      id: 1,
      name: 'October',
      startDayKey: '2026-10-01',
      endDayKey: '2026-10-31',
      goalSec: 7200
    }
  })
  assert.equal(getMilestone('season_1').currentValue, 5400)
  assert.equal(getMilestone('season_1').targetValue, 7200)
  assert.equal(getMilestone('season_1').achieved, false)
  state.activeSec = 3000
  assert.equal(getMilestone('season_1').achieved, true)
  assert.ok(service.checkNewMilestones().some((milestone) => milestone.id === 'season_1'))
  const achievedAt = getMilestone('season_1').achievedAt
  state.totals.set('2026-10-14', 3600)
  state.activeSec = 0
  state.nowMs = new Date('2026-11-01T04:00:00').getTime()
  assert.equal(service.getSnapshot().completedSeasonCount, 1)
  assert.equal(service.getSnapshot().season.season.startDayKey, '2026-11-01')
  assert.equal(getMilestone('season_1').achieved, true)
  assert.equal(getMilestone('season_1').achievedAt, achievedAt)
  assert.equal(service.checkNewMilestones().length, 0)
})

test('first midmonth snapshot includes earlier sessions and repeated snapshots or restart reuse the row', () => {
  const { service, state, restart } = createService({
    totals: [
      ['2026-09-30', 1000],
      ['2026-10-01', 500],
      ['2026-10-14', 250]
    ]
  })
  const snapshot = service.getSnapshot()
  assert.equal(snapshot.season.season.name, 'Октябрь 2026')
  assert.equal(snapshot.season.season.startDayKey, '2026-10-01')
  assert.equal(snapshot.season.season.endDayKey, '2026-10-31')
  assert.equal(snapshot.season.accumulatedSec, 750)
  assert.equal(snapshot.level.totalSec, 1750)
  assert.equal(snapshot.completedSeasonCount, 0)
  service.getSnapshot()
  assert.equal(restart().getSnapshot().season.season.id, snapshot.season.season.id)
  assert.equal(state.seasons.length, 1)
})

test('calendar month bounds and weekday/weekend goals cover leap years and different month lengths', () => {
  for (const [month, lastDay, weekdays, weekends] of [
    ['2024-02', 29, 21, 8],
    ['2025-02', 28, 20, 8],
    ['2026-04', 30, 22, 8],
    ['2026-12', 31, 23, 8],
    ['2027-01', 31, 21, 10]
  ]) {
    const { service } = createService({ now: `${month}-14T12:00:00` })
    const { season } = service.getSnapshot()
    assert.equal(season.season.startDayKey, `${month}-01`)
    assert.equal(season.season.endDayKey, `${month}-${lastDay}`)
    assert.equal(season.daysTotal, lastDay)
    assert.equal(season.goalSec, weekdays * 60 + weekends * 120)
  }
})

test('reset hour controls month rollover and completed months count once across the year boundary', () => {
  const { service, state, restart } = createService({
    now: '2027-01-01T06:59:59',
    settings: { resetHour: 7 }
  })
  assert.equal(service.getSnapshot().season.season.startDayKey, '2026-12-01')
  state.nowMs = new Date('2027-01-01T07:00:00').getTime()
  const snapshot = service.getSnapshot()
  assert.equal(snapshot.season.season.startDayKey, '2027-01-01')
  assert.equal(snapshot.completedSeasonCount, 1)
  assert.equal(state.seasons[0].status, 'completed')
  assert.equal(service.getSnapshot().completedSeasonCount, 1)
  assert.equal(restart().getSnapshot().completedSeasonCount, 1)
  assert.equal(state.seasons.length, 2)
})

test('goal changes update the current month and leave completed month goals frozen', () => {
  const { service, state } = createService({ now: '2026-10-31T12:00:00' })
  const originalGoal = service.getSnapshot().season.goalSec
  state.settings.goalWeekdaySec = 90
  state.settings.goalWeekendSec = 180
  const changedGoal = service.getSnapshot().season.goalSec
  assert.equal(changedGoal, 22 * 90 + 9 * 180)
  assert.notEqual(changedGoal, originalGoal)
  state.nowMs = new Date('2026-11-01T04:00:00').getTime()
  state.settings.goalWeekdaySec = 600
  state.settings.goalWeekendSec = 300
  assert.equal(service.getSnapshot().season.goalSec, 21 * 600 + 9 * 300)
  assert.equal(state.seasons[0].goalSec, changedGoal)
})

test('reopening after skipped months creates no phantom monthly history', () => {
  const { service, state } = createService({ now: '2026-08-15T12:00:00' })
  service.getSnapshot()
  state.nowMs = new Date('2026-12-14T12:00:00').getTime()
  assert.equal(service.getSnapshot().completedSeasonCount, 1)
  assert.deepEqual(
    state.seasons.map((season) => season.startDayKey),
    ['2026-08-01', '2026-12-01']
  )
  assert.equal(state.seasons[0].status, 'completed')
})

test('a live session belongs to its starting month and may earn that month goal after stopping', () => {
  const { service, state, getMilestone } = createService({
    now: '2026-10-31T23:00:00',
    totals: [['2026-10-31', 1700]]
  })
  const oldSeason = service.getSnapshot().season.season
  assert.equal(oldSeason.goalSec, 2400)
  state.activeStartedAt = new Date('2026-10-31T23:00:00').getTime()
  state.activeSec = 600
  state.nowMs = new Date('2026-11-01T04:00:00').getTime()
  assert.equal(service.getSnapshot().season.accumulatedSec, 0)
  assert.equal(service.getSnapshot().completedSeasonCount, 1)
  assert.equal(getMilestone('season_1').achieved, false)
  state.totals.set('2026-10-31', 2400)
  state.activeSec = 0
  assert.ok(service.checkNewMilestones().some((milestone) => milestone.id === 'season_1'))
  const achievedAt = getMilestone('season_1').achievedAt
  state.nowMs += 60_000
  assert.equal(service.checkNewMilestones().length, 0)
  assert.equal(getMilestone('season_1').achievedAt, achievedAt)
})

test('live progress can earn a completed previous month goal without entering the current month', () => {
  const { service, state, getMilestone } = createService({
    now: '2026-10-31T23:00:00',
    totals: [['2026-10-31', 1700]]
  })
  service.getSnapshot()
  state.activeStartedAt = new Date('2026-10-31T23:00:00').getTime()
  state.activeSec = 700
  state.nowMs = new Date('2026-11-01T04:00:00').getTime()
  assert.equal(service.getSnapshot().season.accumulatedSec, 0)
  assert.equal(getMilestone('season_1').achieved, true)
  assert.ok(service.checkNewMilestones().some((milestone) => milestone.id === 'season_1'))
})

test('legacy custom seasons are preserved and archived, awarding a reached positive goal', () => {
  const legacy = {
    id: 7,
    name: 'Custom',
    startDayKey: '2026-09-20',
    endDayKey: '2026-10-20',
    goalSec: 600
  }
  const { service, state } = createService({ season: legacy, totals: [['2026-09-20', 600]] })
  const snapshot = service.getSnapshot()
  assert.equal(state.seasons[0].status, 'archived')
  for (const [key, value] of Object.entries(legacy)) assert.equal(state.seasons[0][key], value)
  assert.equal(snapshot.completedSeasonCount, 0)
  assert.equal(snapshot.season.season.startDayKey, '2026-10-01')
  assert.equal(snapshot.milestones.find((milestone) => milestone.id === 'season_1').achieved, true)
})

test('exact-month legacy seasons are adopted and only completed calendar months are counted', () => {
  const { service, state } = createService({
    seasons: [
      {
        id: 1,
        name: 'Old custom',
        startDayKey: '2026-08-05',
        endDayKey: '2026-08-25',
        goalSec: 600,
        status: 'completed'
      },
      {
        id: 2,
        name: 'September',
        startDayKey: '2026-09-01',
        endDayKey: '2026-09-30',
        goalSec: 600,
        status: 'completed'
      },
      {
        id: 3,
        name: 'July',
        startDayKey: '2026-07-01',
        endDayKey: '2026-07-31',
        goalSec: 600,
        status: 'archived'
      },
      { id: 4, name: 'October', startDayKey: '2026-10-01', endDayKey: '2026-10-31', goalSec: 600 }
    ]
  })
  const snapshot = service.getSnapshot()
  assert.equal(snapshot.season.season.id, 4)
  assert.equal(snapshot.season.goalSec, 2400)
  assert.equal(snapshot.completedSeasonCount, 1)
  assert.equal(state.seasons.length, 4)
})

test('duplicate legacy months count once and completed current or future months do not count', () => {
  const seasons = [
    ['2026-02-01', '2026-02-28'],
    ['2026-02-01', '2026-02-28'],
    ['2026-10-01', '2026-10-31'],
    ['2026-10-01', '2026-10-31'],
    ['2026-11-01', '2026-11-30']
  ].map(([startDayKey, endDayKey], i) => ({
    id: i + 1,
    name: `Legacy ${i + 1}`,
    startDayKey,
    endDayKey,
    goalSec: 600,
    status: 'completed'
  }))
  const { service, state, restart } = createService({ seasons })
  const snapshot = service.getSnapshot()
  assert.equal(snapshot.completedSeasonCount, 1)
  assert.equal(snapshot.season.season.id, 4)
  assert.equal(state.seasons.filter((season) => season.status === 'active').length, 1)
  assert.equal(state.seasons.filter((season) => season.startDayKey === '2026-10-01').length, 2)
  assert.equal(state.seasons.length, seasons.length)
  assert.equal(restart().getSnapshot().completedSeasonCount, 1)
  assert.equal(state.seasons.length, seasons.length)
})

test('zero monthly and legacy targets never award the season badge or divide by zero', () => {
  const { service, state, getMilestone } = createService({
    season: { id: 1, name: 'Zero', startDayKey: '2026-09-20', endDayKey: '2026-10-20', goalSec: 0 },
    settings: { goalWeekdaySec: 0, goalWeekendSec: 0 },
    totals: [['2026-10-14', 600]]
  })
  assert.equal(service.getSnapshot().season.progress, 0)
  assert.equal(getMilestone('season_1').achieved, false)
  state.nowMs = new Date('2026-11-01T04:00:00').getTime()
  assert.equal(service.getSnapshot().completedSeasonCount, 1)
  assert.equal(service.getSnapshot().season.progress, 0)
  assert.equal(
    service.checkNewMilestones().some((milestone) => milestone.id === 'season_1'),
    false
  )
})
