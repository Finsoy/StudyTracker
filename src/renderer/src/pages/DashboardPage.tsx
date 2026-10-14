import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type XAxisTickContentProps
} from 'recharts'
import type { DayStat, GoalStatus, LevelInfo, StatsSummary, StreakInfo } from '@shared/types'
import { formatDuration, isWeekendDayKey, shiftDayKey } from '@shared/time'

interface DashboardPageProps {
  goal: GoalStatus
  onNavigate: (tab: 'session' | 'progress') => void
}

function parseDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateRange(startDayKey: string, endDayKey: string): string {
  const options = { day: '2-digit', month: '2-digit' } as const
  const startLabel = parseDayKey(startDayKey).toLocaleDateString('ru-RU', options)
  const endLabel = parseDayKey(endDayKey).toLocaleDateString('ru-RU', options)
  return `${startLabel} — ${endLabel}`
}

function renderDayTick({ x, y, payload }: XAxisTickContentProps) {
  const dayKey = String(payload.value)
  const date = parseDayKey(dayKey)
  const isWeekend = isWeekendDayKey(dayKey)

  return (
    <g transform={`translate(${x},${y})`} textAnchor="middle">
      <text y={12} fill="#b0aea5" fontSize={12}>
        {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
      </text>
      <text y={29} fill={isWeekend ? '#d97757' : '#8f8c83'} fontSize={11}>
        {date.toLocaleDateString('ru-RU', { weekday: 'short' })}
      </text>
    </g>
  )
}

function DayTooltip({ day }: { day: DayStat | undefined }) {
  if (!day) return null

  return (
    <div className="min-w-56 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-xl">
      <p className="mb-3 text-xs text-muted">
        {parseDayKey(day.date).toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })}
      </p>
      <dl className="space-y-2">
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-muted">
            <span className="h-2 w-2 rounded-full bg-clay" />
            Учёба
          </dt>
          <dd className="tabular-nums">{formatDuration(day.studySec)}</dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-2 text-muted">
            <span className="h-2 w-2 rounded-full bg-sage" />
            Работа
          </dt>
          <dd className="tabular-nums">{formatDuration(day.workSec)}</dd>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-line pt-2 font-medium">
          <dt>Всего за день</dt>
          <dd className="tabular-nums">{formatDuration(day.totalSec)}</dd>
        </div>
      </dl>
    </div>
  )
}

function StatisticCard({
  title,
  value,
  subtitle,
  iconPath,
  children
}: {
  title: string
  value: string
  subtitle: string
  iconPath: string
  children?: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-5">
      <dl>
        <dt className="flex items-center justify-between gap-3 text-sm text-muted">
          {title}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 shrink-0 text-clay"
          >
            <path d={iconPath} />
          </svg>
        </dt>
        <dd className="mt-4 text-2xl font-medium tracking-tight tabular-nums xl:text-3xl">
          {value}
        </dd>
      </dl>
      <p className="mt-2 text-xs text-faint">{subtitle}</p>
      {children}
    </div>
  )
}

export function DashboardPage({ goal, onNavigate }: DashboardPageProps) {
  const [week, setWeek] = useState<DayStat[]>([])
  const [yesterday, setYesterday] = useState<DayStat | null>(null)
  const [streak, setStreak] = useState<StreakInfo | null>(null)
  const [level, setLevel] = useState<LevelInfo | null>(null)
  const [completedSeasonCount, setCompletedSeasonCount] = useState<number | null>(null)
  const [summary, setSummary] = useState<StatsSummary | null>(null)

  useEffect(() => {
    let mounted = true
    const load = () => {
      void window.api.stats.getDays('week').then((days) => {
        if (mounted) setWeek(days)
      })
      void window.api.stats.getDays('yesterday').then((days) => {
        if (mounted) setYesterday(days[0] ?? null)
      })
      void window.api.stats.getSummary().then((value) => {
        if (mounted) setSummary(value)
      })
      void window.api.gamification.get().then((snapshot) => {
        if (!mounted) return
        setStreak(snapshot.enabled ? snapshot.streak : null)
        setLevel(snapshot.enabled ? snapshot.level : null)
        setCompletedSeasonCount(snapshot.enabled ? snapshot.completedSeasonCount : null)
      })
    }
    load()
    const timer = setInterval(load, 5000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  const chartData = useMemo(
    () =>
      week.map((day) => ({
        date: day.date,
        Учёба: day.studySec / 3600,
        Работа: day.workSec / 3600
      })),
    [week]
  )

  const weekTotalSec = week.reduce((sum, day) => sum + day.totalSec, 0)
  const isGoalLoaded = goal.dayKey !== ''
  const hasDailyGoal = isGoalLoaded && goal.goalSec > 0
  const goalProgress = hasDailyGoal
    ? Math.floor(Math.min(1, Math.max(0, goal.accumulatedSec / goal.goalSec)) * 100)
    : 0
  const heading = !isGoalLoaded
    ? 'Сегодня — новый день.'
    : hasDailyGoal && goal.isMet
      ? 'Сегодня — цель достигнута.'
      : goal.accumulatedSec > 0
        ? 'Сегодня — хороший темп.'
        : 'Самое время начать.'
  const goalStatement = !isGoalLoaded
    ? 'Загружаем дневную цель…'
    : !hasDailyGoal
      ? 'Сегодня — в своём темпе.'
      : goal.isMet
        ? 'Дневная цель выполнена.'
        : goal.remainingSec < 60
          ? 'Осталось меньше минуты — и цель выполнена.'
          : `Ещё ${formatDuration(goal.remainingSec)} — и цель выполнена.`
  const weeklyComparisons = summary
    ? [
        {
          label: 'Эта неделя',
          seconds: summary.currentWeekSec,
          color: 'bg-clay',
          detail: formatDateRange(summary.weekStartDayKey, summary.dayKey)
        },
        {
          label: 'Те же дни прошлой недели',
          seconds: summary.previousWeekSameDaysSec,
          color: 'bg-sage',
          detail: formatDateRange(summary.previousWeekStartDayKey, shiftDayKey(summary.dayKey, -7))
        },
        {
          label: 'Прошлая неделя целиком',
          seconds: summary.previousWeekSec,
          color: 'bg-muted/50',
          detail: formatDateRange(
            summary.previousWeekStartDayKey,
            shiftDayKey(summary.weekStartDayKey, -1)
          )
        }
      ]
    : []
  const comparisonMaxSec = Math.max(1, ...weeklyComparisons.map((period) => period.seconds))
  const weeklyDifferenceSec = summary ? summary.currentWeekSec - summary.previousWeekSameDaysSec : 0

  return (
    <div className="mx-auto max-w-5xl text-ink">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="font-display text-3xl leading-tight font-normal sm:text-4xl">{heading}</h1>
        {isGoalLoaded && (
          <time dateTime={goal.dayKey} className="text-sm text-muted">
            {parseDayKey(goal.dayKey).toLocaleDateString('ru-RU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </time>
        )}
      </div>

      <section
        className="rounded-xl border border-line bg-surface p-5 sm:p-7"
        aria-label="Дневная цель"
      >
        <p className="text-sm text-muted">Дневная цель</p>
        <p className="mt-2 max-w-3xl font-display text-[26px] leading-snug font-normal sm:text-[30px]">
          {goalStatement}
        </p>
        {isGoalLoaded && (
          <p className="mt-2 text-base text-muted">
            Сегодня {formatDuration(goal.accumulatedSec)}
            {hasDailyGoal ? ` из ${formatDuration(goal.goalSec)}` : ' · дневная цель не задана'}
          </p>
        )}
        {hasDailyGoal && (
          <div className="mt-5 flex items-center gap-4">
            <div
              role="progressbar"
              aria-label="Выполнение дневной цели"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={goalProgress}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-clay transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            <span className="text-xs text-muted tabular-nums">{goalProgress}%</span>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button
            type="button"
            onClick={() => onNavigate('session')}
            className="rounded-lg bg-clay px-5 py-3 text-sm font-medium text-sidebar transition-colors hover:bg-clay/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
          >
            Перейти к сессии <span aria-hidden="true">→</span>
          </button>
          <p className="text-xs text-muted">Учёба и работа идут в общую цель</p>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="weekly-rhythm-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="weekly-rhythm-title" className="font-display text-2xl font-normal">
            Ритм недели
          </h2>
          {week.length > 0 && (
            <span className="text-xs text-muted">
              {formatDateRange(week[0].date, week[week.length - 1].date)} · пн–вс
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>За неделю · {formatDuration(weekTotalSec)}</p>
          <div className="flex gap-5">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-clay" />
              Учёба
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#788c5d]" />
              Работа
            </span>
          </div>
        </div>
        <div className="mt-4 h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2} maxBarSize={48}>
              <CartesianGrid strokeDasharray="3 4" stroke="#3a3834" vertical={false} />
              <XAxis
                dataKey="date"
                tick={renderDayTick}
                tickLine={false}
                axisLine={false}
                interval={0}
                height={52}
              />
              <YAxis
                stroke="#8f8c83"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                unit=" ч"
                width={42}
              />
              <Tooltip
                cursor={{ fill: 'rgba(250,249,245,0.035)' }}
                content={({ active, label }) => (
                  <DayTooltip day={active ? week.find((day) => day.date === label) : undefined} />
                )}
              />
              <Bar
                dataKey="Учёба"
                stackId="time"
                fill="#d97757"
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="Работа"
                stackId="time"
                fill="#788c5d"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-right text-xs text-faint">сб, вс — выходные</p>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-line py-5 text-sm">
        {streak && (
          <div>
            <p>{streak.current} дн. подряд</p>
            <p className="mt-1 text-xs text-faint">Рекорд — {streak.best} дн.</p>
          </div>
        )}
        {level && (
          <div>
            <p>
              Уровень {level.level} · {level.title}
            </p>
            <p className="mt-1 text-xs text-faint">{formatDuration(level.totalSec)} всего</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => onNavigate('progress')}
          className="ml-auto rounded-sm py-1 text-clay hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
        >
          К прогрессу <span aria-hidden="true">→</span>
        </button>
      </div>

      <details className="dashboard-statistics group border-t border-line">
        <summary className="flex cursor-pointer list-none items-center gap-4 rounded-sm py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay [&::-webkit-details-marker]:hidden">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="m4 7 6 6 6-6" />
          </svg>
          <span>
            <span className="block text-sm">Вся статистика</span>
            <span className="mt-1 block text-xs text-faint">Вчера, месяц и всё время</span>
          </span>
        </summary>
        <div className="space-y-4 pb-6 pt-2">
          <div className="grid gap-4 md:grid-cols-3">
            <StatisticCard
              title="Вчера"
              value={yesterday ? formatDuration(yesterday.totalSec) : '—'}
              subtitle={
                yesterday
                  ? parseDayKey(yesterday.date).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long'
                    })
                  : 'Загружаем статистику…'
              }
              iconPath="M12 3a9 9 0 1 1-6.4 2.6M3 3v5h5m4-1v5l3 2"
            >
              {yesterday && (
                <div className="mt-4">
                  <div
                    aria-hidden="true"
                    className="flex h-1.5 overflow-hidden rounded-full bg-line"
                  >
                    <span
                      className="bg-clay"
                      style={{
                        width: `${yesterday.totalSec > 0 ? (yesterday.studySec / yesterday.totalSec) * 100 : 0}%`
                      }}
                    />
                    <span
                      className="bg-sage"
                      style={{
                        width: `${yesterday.totalSec > 0 ? (yesterday.workSec / yesterday.totalSec) * 100 : 0}%`
                      }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted">
                    <span>Учёба · {formatDuration(yesterday.studySec)}</span>
                    <span>Работа · {formatDuration(yesterday.workSec)}</span>
                  </div>
                </div>
              )}
            </StatisticCard>
            <StatisticCard
              title="Этот месяц"
              value={summary ? formatDuration(summary.currentMonthSec) : '—'}
              subtitle={
                summary
                  ? parseDayKey(summary.dayKey).toLocaleDateString('ru-RU', {
                      month: 'long',
                      year: 'numeric'
                    })
                  : 'Загружаем статистику…'
              }
              iconPath="M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 9h2m4 0h2m-8 3h2"
            />
            <StatisticCard
              title="За всё время"
              value={summary ? formatDuration(summary.allTimeSec) : '—'}
              subtitle="С начала учёта · учёба и работа"
              iconPath="M4 20h16M6 16v-4m6 4V8m6 8V4"
            />
          </div>

          <div
            className={`grid gap-4 ${level || streak || completedSeasonCount !== null ? 'xl:grid-cols-3' : ''}`}
          >
            {summary && (
              <section
                className={`rounded-xl border border-line bg-surface p-5 ${level || streak || completedSeasonCount !== null ? 'xl:col-span-2' : ''}`}
                aria-labelledby="week-comparison-title"
              >
                <h3 id="week-comparison-title" className="font-display text-xl">
                  Неделя в сравнении
                </h3>
                <p
                  className={`mt-1 text-xs ${weeklyDifferenceSec > 0 ? 'text-sage' : 'text-muted'}`}
                >
                  {weeklyDifferenceSec === 0
                    ? 'Столько же, сколько за те же дни прошлой недели'
                    : `${weeklyDifferenceSec > 0 ? '+' : '−'} ${formatDuration(Math.abs(weeklyDifferenceSec))} к тем же дням прошлой недели`}
                </p>
                <dl className="mt-6 space-y-5">
                  {weeklyComparisons.map((period) => (
                    <div key={period.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-sm text-muted">{period.label}</dt>
                        <dd className="shrink-0 text-sm tabular-nums">
                          {formatDuration(period.seconds)}
                        </dd>
                      </div>
                      <div
                        aria-hidden="true"
                        className="mt-2 h-2 overflow-hidden rounded-full bg-line"
                      >
                        <div
                          className={`h-full rounded-full ${period.color}`}
                          style={{ width: `${(period.seconds / comparisonMaxSec) * 100}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-faint">{period.detail}</p>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
                  <div>
                    <p className="text-xs text-muted">В среднем за завершённую неделю</p>
                    <p className="mt-1 text-xs text-faint">
                      {summary.completedWeekCount > 0
                        ? `Завершённых недель: ${summary.completedWeekCount}`
                        : 'Появится после первой недели'}
                    </p>
                  </div>
                  <p className="text-xl tabular-nums">
                    {summary.averageWeekSec === null ? '—' : formatDuration(summary.averageWeekSec)}
                  </p>
                </div>
              </section>
            )}

            {(level || streak || completedSeasonCount !== null) && (
              <section
                className="rounded-xl border border-line bg-surface p-5"
                aria-label="Уровень и достижения"
              >
                <h3 className="font-display text-xl">Шаг за шагом</h3>
                {level && (
                  <>
                    <div className="mt-5 flex items-center gap-4">
                      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 80 80"
                          className="absolute inset-0 h-full w-full -rotate-90"
                          fill="none"
                          strokeWidth="4"
                        >
                          <circle cx="40" cy="40" r="35" className="stroke-line" />
                          <circle
                            cx="40"
                            cy="40"
                            r="35"
                            className="stroke-clay"
                            pathLength="100"
                            strokeDasharray={`${level.progress * 100} 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="text-2xl tabular-nums">{level.level}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-faint">Текущий уровень</p>
                        <p className="mt-1 text-sm">{level.title}</p>
                        <p className="mt-1 text-xs text-clay">
                          Пройдено {Math.floor(level.progress * 100)}%
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-muted">
                      До следующего уровня —{' '}
                      {formatDuration(Math.max(0, level.nextLevelSec - level.totalSec))}
                    </p>
                  </>
                )}
                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5">
                  {streak && (
                    <div>
                      <dt className="text-xs text-muted">Лучший стрик</dt>
                      <dd className="mt-2 text-2xl tabular-nums">
                        {streak.best}
                        <span className="ml-1 text-xs text-faint">дн.</span>
                      </dd>
                      <dd className="mt-1 text-xs text-faint">Сейчас: {streak.current} дн.</dd>
                    </div>
                  )}
                  {completedSeasonCount !== null && (
                    <div>
                      <dt className="text-xs text-muted">Завершено сезонов</dt>
                      <dd className="mt-2 text-2xl tabular-nums">{completedSeasonCount}</dd>
                      <dd className="mt-1 text-xs text-faint">Календарных месяцев</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
          </div>
          <p className="text-xs leading-relaxed text-faint">
            Неделя — с понедельника по воскресенье. Текущая сумма — на сегодня, день ещё идёт.
          </p>
        </div>
      </details>
    </div>
  )
}
