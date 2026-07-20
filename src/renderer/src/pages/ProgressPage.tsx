import { useEffect, useState } from 'react'
import type { DayStat, GamificationSnapshot } from '@shared/types'
import { formatHms } from '@shared/time'
import { ActivityHeatmap } from '../components/ActivityHeatmap'
import { useToast } from '../components/toast'

function ProgressBar({ value, accent = 'bg-indigo-400' }: { value: number; accent?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/5">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${accent}`}
        style={{ width: `${pct}%` }}
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

export function ProgressPage() {
  const { addToast } = useToast()
  const [snapshot, setSnapshot] = useState<GamificationSnapshot | null>(null)
  const [yearDays, setYearDays] = useState<DayStat[]>([])
  const [weeks, setWeeks] = useState(4)
  const [goalHours, setGoalHours] = useState(42)
  const [busy, setBusy] = useState(false)

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

  async function handleStartSeason() {
    setBusy(true)
    try {
      await window.api.gamification.createSeason({ weeks, goalHours })
      const next = await window.api.gamification.get()
      setSnapshot(next)
      if (next.season) {
        addToast(`Сезон «${next.season.season.name}» начат`, 'success')
      } else {
        addToast('Сезон создан, но не отобразился — перезапусти приложение', 'warning')
      }
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Не удалось начать сезон. Перезапусти приложение.',
        'warning'
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleCompleteSeason() {
    setBusy(true)
    try {
      await window.api.gamification.completeSeason()
      setSnapshot(await window.api.gamification.get())
      addToast('Сезон завершён', 'info')
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Не удалось завершить сезон',
        'warning'
      )
    } finally {
      setBusy(false)
    }
  }

  if (!snapshot) return null

  if (!snapshot.enabled) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold text-white">Прогресс</h1>
        <p className="text-sm text-gray-500">Геймификация выключена в настройках.</p>
      </div>
    )
  }

  const { level, streak, season, milestones } = snapshot
  const toNextSec = Math.max(0, level.nextLevelSec - level.totalSec)
  const todayKey = yearDays.length > 0 ? yearDays[yearDays.length - 1].date : ''

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-white">Прогресс</h1>
      <p className="mb-8 text-sm text-gray-500">Уровень, стрик, сезон и ачивки.</p>

      <div className="rounded-2xl border border-white/5 bg-[#0d1220] p-6">
        <div className="mb-1 text-xs uppercase tracking-wider text-gray-500">Уровень</div>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-4xl font-bold tabular-nums text-indigo-300">
            {level.level}
          </span>
          <span className="text-lg text-gray-200">{level.title}</span>
        </div>
        <div className="mt-4">
          <ProgressBar value={level.progress} />
        </div>
        <div className="mt-3 flex justify-between text-xs text-gray-500">
          <span>Всего: {formatHms(level.totalSec)}</span>
          <span>До след. уровня: {formatHms(toNextSec)}</span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/5 bg-[#0d1220] p-6">
        <div className="mb-1 text-xs uppercase tracking-wider text-gray-500">Стрик</div>
        <div className="flex items-baseline gap-4">
          <span className="font-mono text-3xl font-bold tabular-nums text-orange-300">
            {streak.current} дн.
          </span>
          <span className="text-sm text-gray-500">рекорд {streak.best} дн.</span>
        </div>
        <p className="mt-2 text-sm text-gray-400">
          {streak.aliveToday
            ? streak.todayQualified
              ? 'Сегодня уже засчитано — цепь жива.'
              : 'Цепь жива — добей сегодня ещё немного.'
            : 'Цепь порвана — начни заново.'}
        </p>
        {todayKey && <ActivityHeatmap days={yearDays} todayKey={todayKey} />}
      </div>

      <div className="mt-4 rounded-2xl border border-white/5 bg-[#0d1220] p-6">
        <div className="mb-1 text-xs uppercase tracking-wider text-gray-500">Сезон</div>
        {season ? (
          <>
            <div className="text-lg font-semibold text-white">{season.season.name}</div>
            <div className="mt-4">
              <ProgressBar value={season.progress} accent="bg-emerald-400" />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>
                {formatHms(season.accumulatedSec)} / {formatHms(season.goalSec)}
              </span>
              <span>осталось {season.daysLeft} дн.</span>
              <span>зачётных дней: {season.activeDays}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleCompleteSeason()}
              disabled={busy}
              className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              {busy ? 'Завершаем…' : 'Завершить сезон'}
            </button>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-400">Нет активного сезона. Задай цель на 4–6 недель.</p>
            <div className="mb-4 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                Недель
                <select
                  value={weeks}
                  onChange={(event) => {
                    const nextWeeks = Number(event.target.value)
                    setWeeks(nextWeeks)
                    setGoalHours(Math.round(nextWeeks * 7 * 1.5))
                  }}
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-100 outline-none"
                >
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                Цель
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={goalHours}
                  onChange={(event) => setGoalHours(Number(event.target.value))}
                  className="w-20 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-100 outline-none"
                />
                <span className="text-xs text-gray-500">ч</span>
              </label>
            </div>
            <button
              type="button"
              onClick={() => void handleStartSeason()}
              disabled={busy || !Number.isFinite(goalHours) || goalHours <= 0}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
            >
              {busy ? 'Создаём…' : 'Начать сезон'}
            </button>
          </>
        )}
      </div>

      <div className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Ачивки</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {milestones.map((milestone) => (
            <div
              key={milestone.id}
              className={`rounded-2xl border p-4 ${
                milestone.achieved
                  ? 'border-indigo-400/30 bg-indigo-500/10'
                  : 'border-white/5 bg-[#0d1220] opacity-60'
              }`}
            >
              <div
                className={`text-sm font-semibold ${
                  milestone.achieved ? 'text-indigo-200' : 'text-gray-400'
                }`}
              >
                {milestone.label}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {milestone.achieved && milestone.achievedAt
                  ? `Получено ${formatUnlockedDate(milestone.achievedAt)}`
                  : milestone.hint}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
