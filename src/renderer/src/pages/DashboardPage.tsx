import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { DayStat, GoalStatus, LevelInfo, StreakInfo } from '@shared/types'
import { formatHms } from '@shared/time'

interface DashboardPageProps {
  goal: GoalStatus
}

function labelForDate(dayKey: string): string {
  const [, month, day] = dayKey.split('-')
  return `${day}.${month}`
}

function StatCard({
  title,
  value,
  accent,
  subtitle,
  progress
}: {
  title: string
  value: string
  accent?: string
  subtitle?: string
  progress?: number
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#0d1220] p-5">
      <div className="text-xs uppercase tracking-wider text-gray-500">{title}</div>
      <div className={`mt-2 font-mono text-2xl font-bold tabular-nums ${accent ?? 'text-white'}`}>
        {value}
      </div>
      {subtitle && <div className="mt-1 text-xs text-gray-500">{subtitle}</div>}
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-indigo-400 transition-[width] duration-500"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function DashboardPage({ goal }: DashboardPageProps) {
  const [week, setWeek] = useState<DayStat[]>([])
  const [streak, setStreak] = useState<StreakInfo | null>(null)
  const [level, setLevel] = useState<LevelInfo | null>(null)

  useEffect(() => {
    let mounted = true
    const load = () => {
      void window.api.stats.getDays('week').then((days) => {
        if (mounted) setWeek(days)
      })
      void window.api.gamification.get().then((snapshot) => {
        if (!mounted || !snapshot.enabled) return
        setStreak(snapshot.streak)
        setLevel(snapshot.level)
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
        date: labelForDate(day.date),
        Учёба: Number((day.studySec / 3600).toFixed(2)),
        Работа: Number((day.workSec / 3600).toFixed(2))
      })),
    [week]
  )

  const yesterday = week.length >= 2 ? week[week.length - 2] : null
  const weekTotalSec = week.reduce((sum, day) => sum + day.totalSec, 0)

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-white">Дашборд</h1>
      <p className="mb-8 text-sm text-gray-500">Сколько важного времени ты набрал за последние дни.</p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard title="Сегодня" value={formatHms(goal.accumulatedSec)} accent="text-indigo-300" />
        <StatCard title="Цель на день" value={formatHms(goal.goalSec)} />
        <StatCard
          title="Осталось"
          value={goal.isMet ? 'выполнено' : formatHms(goal.remainingSec)}
          accent={goal.isMet ? 'text-emerald-300' : 'text-amber-300'}
        />
        <StatCard
          title="Вчера"
          value={yesterday ? formatHms(yesterday.totalSec) : '00:00:00'}
        />
      </div>

      {(streak || level) && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          {streak && (
            <StatCard
              title="Стрик"
              value={`${streak.current} дн.`}
              accent="text-orange-300"
              subtitle={`Рекорд: ${streak.best} дн.`}
            />
          )}
          {level && (
            <StatCard
              title="Уровень"
              value={`Ур. ${level.level} · ${level.title}`}
              accent="text-indigo-300"
              progress={level.progress}
            />
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-white/5 bg-[#0d1220] p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-white">Последние 7 дней</h2>
          <span className="text-xs text-gray-500">Всего за неделю: {formatHms(weekTotalSec)}</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickLine={false} />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                unit="ч"
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: '#0d1220',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  color: '#e5e7eb'
                }}
                formatter={(value) => [`${value} ч`, '']}
              />
              <Bar dataKey="Учёба" stackId="time" fill="#818cf8" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Работа" stackId="time" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" /> Учёба
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Работа
          </span>
        </div>
      </div>
    </div>
  )
}
