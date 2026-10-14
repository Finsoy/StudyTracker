import { useEffect, useState } from 'react'
import type { DayStat, GamificationSnapshot } from '@shared/types'
import { formatDuration } from '@shared/time'
import { ActivityHeatmap } from '../components/ActivityHeatmap'

function ProgressBar({
  value,
  label,
  accent = 'bg-clay'
}: {
  value: number
  label: string
  accent?: string
}) {
  const percentage = Math.floor(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      className="h-1.5 overflow-hidden rounded-full bg-line"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${accent}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

function formatUnlockedDate(achievedAt: number): string {
  const date = new Date(achievedAt)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

function formatSeasonDate(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long'
  })
}

export function ProgressPage() {
  const [snapshot, setSnapshot] = useState<GamificationSnapshot | null>(null)
  const [yearDays, setYearDays] = useState<DayStat[]>([])
  const [achievementFilter, setAchievementFilter] = useState<'upcoming' | 'achieved'>('upcoming')

  useEffect(() => {
    let mounted = true
    const load = () => {
      void window.api.gamification.get().then((value) => {
        if (mounted) setSnapshot(value)
      })
      void window.api.stats.getDays('year').then((days) => {
        if (mounted) setYearDays(days)
      })
    }
    load()
    const timer = setInterval(load, 5000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  if (!snapshot) return <p className="text-sm text-muted">Загружаем прогресс…</p>

  if (!snapshot.enabled) {
    return (
      <div>
        <h1 className="mb-3 font-display text-3xl font-normal text-ink">Прогресс</h1>
        <p className="text-sm text-muted">Геймификация выключена в настройках.</p>
      </div>
    )
  }

  const { level, streak, season, milestones, completedSeasonCount } = snapshot
  const achievedCount = milestones.filter((milestone) => milestone.achieved).length
  const visibleMilestones = milestones.filter((milestone) =>
    achievementFilter === 'achieved' ? milestone.achieved : !milestone.achieved
  )
  const toNextSec = Math.max(0, level.nextLevelSec - level.totalSec)
  const todayKey = yearDays.length > 0 ? yearDays[yearDays.length - 1].date : ''

  return (
    <div className="mx-auto max-w-5xl text-ink">
      <h1 className="font-display text-[30px] leading-tight font-normal sm:text-[34px]">
        Маленькие шаги. Заметный прогресс.
      </h1>
      <p className="mt-3 mb-6 text-sm text-muted">Каждая сессия добавляет к твоему результату.</p>

      <section
        className="rounded-xl border border-line bg-surface p-5 sm:p-6"
        aria-label="Текущий уровень"
      >
        <div className="grid items-center gap-6 md:grid-cols-2">
          <div className="flex items-center gap-5">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-clay/70 font-display text-3xl text-clay"
              aria-hidden="true"
            >
              {level.level}
            </div>
            <div>
              <p className="text-sm text-muted">Уровень {level.level}</p>
              <h2 className="mt-1 font-display text-3xl font-normal">{level.title}</h2>
            </div>
          </div>
          <div className="md:border-l md:border-line md:pl-6">
            <p className="text-xs text-muted">До следующего уровня</p>
            <p className="mt-1 mb-3 text-base">{formatDuration(toNextSec)}</p>
            <ProgressBar value={level.progress} label="Прогресс текущего уровня" />
            <p className="mt-3 text-xs text-faint">
              Всего в фокусе · {formatDuration(level.totalSec)}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <section
          className="min-w-0 rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-label="Серия и активность"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-normal">{streak.current} дн. подряд</h2>
            <span className="text-xs text-muted">Рекорд — {streak.best} дн.</span>
          </div>
          <p className={`mt-2 text-sm ${streak.todayQualified ? 'text-sage' : 'text-muted'}`}>
            {streak.todayQualified
              ? 'Сегодня засчитано.'
              : streak.aliveToday
                ? 'Серия продолжается — сегодня ещё можно добавить зачётный день.'
                : 'Новая серия начинается с одного зачётного дня.'}
          </p>
          {todayKey && <ActivityHeatmap days={yearDays} todayKey={todayKey} />}
          <p className="mt-4 text-xs leading-relaxed text-faint">
            Зачётный день — от {formatDuration(streak.minSec)}. Выходные без занятий не прерывают
            серию.
          </p>
        </section>

        <section
          className="rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-label="Сезон месяца"
        >
          <p className="text-xs text-muted">Сезон месяца</p>
          {season ? (
            <>
              <h2 className="mt-2 font-display text-2xl font-normal">{season.season.name}</h2>
              <p className="mt-2 text-xs text-muted">
                {formatSeasonDate(season.season.startDayKey)} —{' '}
                {formatSeasonDate(season.season.endDayKey)}
              </p>
              <p className="mt-5 text-base">
                {formatDuration(season.accumulatedSec)}
                {season.goalSec > 0 ? ` из ${formatDuration(season.goalSec)}` : ' учтено'}
              </p>
              {season.goalSec > 0 ? (
                <div className="mt-3">
                  <ProgressBar value={season.progress} label="Цель месяца" accent="bg-sage" />
                  {season.accumulatedSec >= season.goalSec && (
                    <p className="mt-2 text-xs text-sage">Цель месяца выполнена.</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">Цель на месяц не задана</p>
              )}
              <dl className="mt-4 space-y-2 text-xs text-muted">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>
                    {season.daysLeft === 0 ? 'Последний день сезона' : 'Осталось полных дней'}
                  </dt>
                  <dd>{season.daysLeft > 0 ? season.daysLeft : 'Сегодня'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Зачётных дней</dt>
                  <dd>{season.activeDays}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">Текущий сезон пока недоступен.</p>
          )}
          <p className="mt-5 text-xs leading-relaxed text-faint">
            Цель складывается из дневных целей. Новый сезон начнётся автоматически в следующем
            месяце.
          </p>
          <p className="mt-3 text-xs text-muted">Завершено сезонов: {completedSeasonCount}</p>
        </section>
      </div>

      <section
        className="mt-5 rounded-xl border border-line bg-surface p-5 sm:p-6"
        aria-labelledby="achievements-title"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="achievements-title" className="font-display text-2xl font-normal">
            Достижения
          </h2>
          <span className="text-xs text-muted">
            {achievedCount} из {milestones.length} получено
          </span>
        </div>
        <div className="mt-4 mb-4 flex gap-5 border-b border-line">
          <button
            type="button"
            aria-pressed={achievementFilter === 'upcoming'}
            onClick={() => setAchievementFilter('upcoming')}
            className="border-b-2 border-transparent pb-2 text-sm text-muted aria-pressed:border-clay aria-pressed:text-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
          >
            Ближайшие
          </button>
          <button
            type="button"
            aria-pressed={achievementFilter === 'achieved'}
            onClick={() => setAchievementFilter('achieved')}
            className="border-b-2 border-transparent pb-2 text-sm text-muted aria-pressed:border-clay aria-pressed:text-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
          >
            Полученные
          </button>
        </div>
        {visibleMilestones.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visibleMilestones.map((milestone) => (
              <article key={milestone.id} className="rounded-lg border border-line p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-xl font-normal">{milestone.label}</h3>
                  {milestone.achieved && (
                    <span className="shrink-0 text-xs text-sage">Получено</span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{milestone.hint}</p>
                {!milestone.achieved &&
                milestone.targetValue !== null &&
                milestone.targetValue > 0 ? (
                  <div className="mt-4">
                    <p className="mb-3 text-xs text-muted tabular-nums">
                      {milestone.kind === 'streak'
                        ? `Текущая серия: ${milestone.currentValue} / ${milestone.targetValue} дн.`
                        : `${formatDuration(milestone.currentValue)} из ${formatDuration(milestone.targetValue)}`}
                    </p>
                    {!milestone.achieved && (
                      <>
                        <ProgressBar
                          value={milestone.currentValue / milestone.targetValue}
                          label={milestone.label}
                          accent={milestone.kind === 'streak' ? 'bg-clay' : 'bg-sage'}
                        />
                        <p className="mt-3 text-xs text-faint">
                          До цели:{' '}
                          {milestone.kind === 'streak'
                            ? `${Math.max(0, milestone.targetValue - milestone.currentValue)} дн.`
                            : formatDuration(milestone.targetValue - milestone.currentValue)}
                        </p>
                      </>
                    )}
                  </div>
                ) : !milestone.achieved ? (
                  <p className="mt-3 text-xs text-faint">Цель месяца пока не задана.</p>
                ) : null}
                {milestone.achieved && (
                  <p className="mt-3 text-xs text-sage">
                    {milestone.achievedAt !== null
                      ? `Получено ${formatUnlockedDate(milestone.achievedAt)}`
                      : 'Цель достигнута'}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted">
            {achievementFilter === 'achieved'
              ? 'Полученных достижений пока нет. Каждая сессия приближает к первому.'
              : 'Все доступные достижения уже получены.'}
          </p>
        )}
      </section>
    </div>
  )
}
