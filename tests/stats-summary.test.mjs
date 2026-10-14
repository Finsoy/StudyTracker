import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import process from 'node:process'
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
const serviceSource = compileSource('../src/main/services/GoalService.ts')

function getSummary({
  totals = [],
  now = '2026-10-14T12:00:00',
  activeStart = null,
  activeSec = 0,
  range = null
} = {}) {
  const exports = {}
  class FixedDate extends Date {
    static now() {
      return new Date(now).getTime()
    }
  }
  runInNewContext(serviceSource, {
    exports,
    Date: FixedDate,
    require: (specifier) =>
      specifier === '@shared/time'
        ? time
        : {
            sessionsRepo: {
              dailyTotals: () => new Map(totals),
              dayBreakdown: (dayKey) => ({ workSec: new Map(totals).get(dayKey) ?? 0, studySec: 0 })
            },
            settingsRepo: { get: () => ({ resetHour: 4, gamificationEnabled: false }) }
          }
  })
  const tracker = {
    getActive: () =>
      activeStart ? { startedAt: new Date(activeStart).getTime(), category: 'study' } : null,
    activeElapsedSec: () => activeSec
  }
  const service = new exports.GoalService(tracker)
  return range
    ? Array.from(service.getDayStats(range), (day) => ({ ...day }))
    : { ...service.getSummary() }
}

test('empty history has zero totals and no weekly average yet', () => {
  assert.deepEqual(getSummary(), {
    dayKey: '2026-10-14',
    weekStartDayKey: '2026-10-12',
    previousWeekStartDayKey: '2026-10-05',
    currentWeekSec: 0,
    previousWeekSec: 0,
    previousWeekSameDaysSec: 0,
    currentMonthSec: 0,
    allTimeSec: 0,
    averageWeekSec: null,
    completedWeekCount: 0
  })
})

test('calendar totals include empty weeks in the average and exclude the current week', () => {
  const totals = [
    ['2026-10-14', 1800],
    ['2026-10-05', 7200],
    ['2026-10-07', 3600],
    ['2026-10-11', 1800],
    ['2026-10-12', 3600],
    ['2026-09-21', 14400]
  ]
  const summary = getSummary({ totals })
  assert.deepEqual(summary, {
    dayKey: '2026-10-14',
    weekStartDayKey: '2026-10-12',
    previousWeekStartDayKey: '2026-10-05',
    currentWeekSec: 5400,
    previousWeekSec: 12600,
    previousWeekSameDaysSec: 10800,
    currentMonthSec: 18000,
    allTimeSec: 32400,
    averageWeekSec: 9000,
    completedWeekCount: 3
  })
  assert.equal(getSummary({ totals: [...totals, ['2026-10-13', 36000]] }).averageWeekSec, 9000)
})

test('live time is included once, even with gamification disabled', () => {
  const summary = getSummary({
    totals: [['2026-10-14', 3600]],
    activeStart: '2026-10-14T10:30:00',
    activeSec: 5400
  })
  assert.equal(summary.currentWeekSec, 9000)
  assert.equal(summary.currentMonthSec, 9000)
  assert.equal(summary.allTimeSec, 9000)
  assert.equal(summary.averageWeekSec, null)
  assert.equal(getSummary({ activeStart: '2026-10-11T23:00:00' }).completedWeekCount, 0)
})

test('a session crossing the reset hour belongs to its starting week before and after stop', () => {
  const now = '2026-10-12T05:00:00'
  const active = getSummary({
    now,
    totals: [['2026-10-11', 3600]],
    activeStart: '2026-10-12T03:30:00',
    activeSec: 5400
  })
  const saved = getSummary({ now, totals: [['2026-10-11', 9000]] })
  assert.deepEqual(active, saved)
  assert.equal(active.currentWeekSec, 0)
  assert.equal(active.previousWeekSec, 9000)
  assert.equal(active.averageWeekSec, 9000)
  assert.equal(active.completedWeekCount, 1)
})

test('calendar week switches on Monday at the configured reset hour', () => {
  const totals = [
    ['2026-10-05', 3600],
    ['2026-10-11', 1800]
  ]
  const before = getSummary({ totals, now: '2026-10-12T03:59:00' })
  const after = getSummary({ totals, now: '2026-10-12T04:00:00' })
  assert.equal(before.dayKey, '2026-10-11')
  assert.equal(before.weekStartDayKey, '2026-10-05')
  assert.equal(before.currentWeekSec, 5400)
  assert.equal(before.averageWeekSec, null)
  assert.equal(after.currentWeekSec, 0)
  assert.equal(after.previousWeekSec, 5400)
  assert.equal(after.previousWeekSameDaysSec, 3600)
  assert.equal(after.averageWeekSec, 5400)
})

test('the current week includes Monday through Sunday and excludes the preceding Sunday', () => {
  const totals = [
    ['2026-10-11', 7200],
    ...time.recentDayKeys('2026-10-18', 7).map((dayKey) => [dayKey, 3600])
  ]
  const sunday = getSummary({ totals, now: '2026-10-18T12:00:00' })
  assert.equal(sunday.weekStartDayKey, '2026-10-12')
  assert.equal(sunday.currentWeekSec, 7 * 3600)
  assert.equal(sunday.previousWeekSec, 7200)

  const monday = getSummary({ totals, now: '2026-10-19T12:00:00' })
  assert.equal(monday.weekStartDayKey, '2026-10-19')
  assert.equal(monday.currentWeekSec, 0)
  assert.equal(monday.previousWeekSec, sunday.currentWeekSec)
})

test('daily ranges and calendar weeks agree for live sessions across day and week boundaries', () => {
  for (const activeStart of ['2026-10-14T10:00:00', '2026-10-13T23:00:00', '2026-10-11T23:00:00']) {
    const input = {
      totals: [
        ['2026-10-11', 1800],
        ['2026-10-12', 3 * 3600],
        ['2026-10-13', 2 * 3600],
        ['2026-10-14', 3600]
      ],
      activeStart,
      activeSec: 5400
    }
    const days = getSummary({ ...input, range: 'last30' })
    const summary = getSummary(input)
    const activeDayKey = time.dayKeyFor(new Date(activeStart).getTime(), 4)
    assert.equal(days.find((day) => day.date === activeDayKey).studySec, 5400)
    assert.equal(
      days.reduce((totalSec, day) => totalSec + day.studySec, 0),
      5400
    )
    for (const day of days) {
      assert.equal(day.totalSec, day.workSec + day.studySec)
    }
    assert.equal(
      days
        .filter((day) => day.date >= summary.weekStartDayKey)
        .reduce((totalSec, day) => totalSec + day.totalSec, 0),
      summary.currentWeekSec
    )
    assert.equal(days.find((day) => day.date === '2026-10-11').totalSec, summary.previousWeekSec)
    const savedDays = getSummary({
      totals: input.totals.map(([dayKey, totalSec]) => [
        dayKey,
        totalSec + (dayKey === activeDayKey ? input.activeSec : 0)
      ]),
      range: 'last30'
    })
    assert.deepEqual(
      days.map((day) => day.totalSec),
      savedDays.map((day) => day.totalSec)
    )
  }
})

test('weekly chart always covers Monday through Sunday, with zero time on future days', () => {
  const totals = [
    ['2026-10-11', 7200],
    ...time.recentDayKeys('2026-10-18', 7).map((dayKey) => [dayKey, 3600])
  ]
  for (const todayKey of time.recentDayKeys('2026-10-18', 7)) {
    const input = { totals, now: `${todayKey}T12:00:00` }
    const days = getSummary({ ...input, range: 'week' })
    assert.deepEqual(
      days.map((day) => day.date),
      [
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
        '2026-10-17',
        '2026-10-18'
      ]
    )
    assert.ok(days.filter((day) => day.date > todayKey).every((day) => day.totalSec === 0))
    assert.equal(
      days.reduce((totalSec, day) => totalSec + day.totalSec, 0),
      getSummary(input).currentWeekSec
    )
  }
})

test('weekly chart switches at Monday reset and yesterday still includes the preceding Sunday', () => {
  const totals = [['2026-10-11', 3600]]
  const before = getSummary({ totals, now: '2026-10-12T03:59:00', range: 'week' })
  const after = getSummary({ totals, now: '2026-10-12T04:00:00', range: 'week' })
  assert.equal(before[0].date, '2026-10-05')
  assert.equal(before[6].date, '2026-10-11')
  assert.equal(before[6].totalSec, 3600)
  assert.equal(after[0].date, '2026-10-12')
  assert.equal(after[6].date, '2026-10-18')
  assert.equal(
    after.reduce((totalSec, day) => totalSec + day.totalSec, 0),
    0
  )
  assert.deepEqual(getSummary({ totals, now: '2026-10-12T04:00:00', range: 'yesterday' }), [
    { date: '2026-10-11', totalSec: 3600, workSec: 3600, studySec: 0 }
  ])
})

test('weekly chart includes live time only when the session starts in this calendar week', () => {
  for (const activeStart of ['2026-10-14T10:00:00', '2026-10-13T23:00:00', '2026-10-11T23:00:00']) {
    const input = { activeStart, activeSec: 5400 }
    const days = getSummary({ ...input, range: 'week' })
    assert.equal(
      days.reduce((totalSec, day) => totalSec + day.totalSec, 0),
      getSummary(input).currentWeekSec
    )
  }
})

test('month and year boundaries, including leap day, do not split a calendar week', () => {
  for (const [now, weekStartDayKey, totals] of [
    [
      '2027-01-01T12:00:00',
      '2026-12-28',
      [
        ['2026-12-27', 60],
        ['2026-12-28', 120],
        ['2026-12-31', 180],
        ['2027-01-01', 240]
      ]
    ],
    [
      '2028-03-01T12:00:00',
      '2028-02-28',
      [
        ['2028-02-27', 60],
        ['2028-02-28', 120],
        ['2028-02-29', 180],
        ['2028-03-01', 240]
      ]
    ]
  ]) {
    const summary = getSummary({ now, totals })
    assert.equal(summary.weekStartDayKey, weekStartDayKey)
    assert.equal(summary.currentWeekSec, 540)
    assert.equal(summary.previousWeekSec, 60)
    assert.equal(summary.previousWeekSameDaysSec, 0)
    assert.equal(summary.currentMonthSec, 240)
    assert.equal(summary.allTimeSec, 600)
    const days = getSummary({ now, totals, range: 'week' })
    assert.equal(days[0].date, weekStartDayKey)
    assert.equal(days[6].date, time.shiftDayKey(weekStartDayKey, 6))
    assert.equal(
      days.reduce((totalSec, day) => totalSec + day.totalSec, 0),
      summary.currentWeekSec
    )
  }
})

test('all-time total and average retain history older than the heatmap range', () => {
  const summary = getSummary({
    totals: [
      ['2024-10-14', 360000],
      ['2026-10-14', 1800]
    ]
  })
  assert.equal(summary.allTimeSec, 361800)
  assert.equal(summary.completedWeekCount, 104)
  assert.equal(summary.averageWeekSec, 360000 / 104)
})

test('completed weeks are calendar weeks across daylight-saving transitions', () => {
  const originalTimezone = process.env.TZ
  try {
    for (const [timezone, now, firstDay] of [
      ['America/Los_Angeles', '2026-03-09T12:00:00', '2026-03-02'],
      ['Europe/Berlin', '2026-03-30T12:00:00', '2026-03-23']
    ]) {
      process.env.TZ = timezone
      const summary = getSummary({ now, totals: [[firstDay, 3600]] })
      assert.equal(summary.completedWeekCount, 1)
      assert.equal(summary.averageWeekSec, 3600)
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
  }
})
