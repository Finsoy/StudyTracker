import { useMemo } from 'react'
import type { DayStat } from '@shared/types'
import { formatHms, shiftDayKey } from '@shared/time'

const MONTH_LABELS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек'
]

const LEVEL_CLASS = [
  'bg-[#161b22]',
  'bg-emerald-900/70',
  'bg-emerald-700/80',
  'bg-emerald-500/85',
  'bg-emerald-400'
] as const

function parseDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function weekdayOf(dayKey: string): number {
  return parseDayKey(dayKey).getDay()
}

/** 0 = empty … 4 = most active (GitHub-style intensity). */
function activityLevel(totalSec: number): number {
  if (totalSec <= 0) return 0
  if (totalSec < 30 * 60) return 1
  if (totalSec < 60 * 60) return 2
  if (totalSec < 2 * 60 * 60) return 3
  return 4
}

function formatDayLabel(dayKey: string): string {
  const date = parseDayKey(dayKey)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${date.getFullYear()}`
}

interface ActivityHeatmapProps {
  days: DayStat[]
  todayKey: string
}

export function ActivityHeatmap({ days, todayKey }: ActivityHeatmapProps) {
  const { weeks, monthLabels, activeDays } = useMemo(() => {
    const byDate = new Map(days.map((day) => [day.date, day.totalSec]))

    // Align to the Sunday of the week that contains (today - 364 days).
    let startKey = shiftDayKey(todayKey, -364)
    startKey = shiftDayKey(startKey, -weekdayOf(startKey))

    const weeksBuilt: { date: string; totalSec: number; future: boolean }[][] = []
    let cursor = startKey

    for (;;) {
      const week: { date: string; totalSec: number; future: boolean }[] = []
      for (let weekday = 0; weekday < 7; weekday++) {
        const future = cursor > todayKey
        week.push({
          date: cursor,
          totalSec: future ? 0 : (byDate.get(cursor) ?? 0),
          future
        })
        cursor = shiftDayKey(cursor, 1)
      }
      weeksBuilt.push(week)
      if (week.some((cell) => cell.date === todayKey)) break
    }

    const labels: { weekIndex: number; label: string }[] = []
    let previousMonth = -1
    weeksBuilt.forEach((week, weekIndex) => {
      const month = parseDayKey(week[0].date).getMonth()
      if (month !== previousMonth) {
        labels.push({ weekIndex, label: MONTH_LABELS[month] })
        previousMonth = month
      }
    })

    const counted = weeksBuilt.flat().filter((cell) => !cell.future && cell.totalSec > 0).length
    return { weeks: weeksBuilt, monthLabels: labels, activeDays: counted }
  }, [days, todayKey])

  return (
    <div className="mt-4">
      <div className="mb-2 text-xs text-gray-500">
        {activeDays} активных {activeDays === 1 ? 'день' : activeDays < 5 ? 'дня' : 'дней'} за год
      </div>

      <div className="w-full">
        <div
          className="mb-1 grid gap-[2px]"
          style={{
            gridTemplateColumns: `1.75rem repeat(${weeks.length}, minmax(0, 1fr))`
          }}
        >
          <div />
          {weeks.map((_, weekIndex) => {
            const label = monthLabels.find((entry) => entry.weekIndex === weekIndex)
            return (
              <div key={weekIndex} className="relative h-3 overflow-visible text-[10px] leading-3 text-gray-500">
                {label ? <span className="absolute left-0 whitespace-nowrap">{label.label}</span> : null}
              </div>
            )
          })}
        </div>

        <div className="flex gap-[2px]">
          <div className="flex w-7 shrink-0 flex-col gap-[2px] text-[10px] leading-[10px] text-gray-500">
            <span className="h-2.5" />
            <span className="h-2.5">пн</span>
            <span className="h-2.5" />
            <span className="h-2.5">ср</span>
            <span className="h-2.5" />
            <span className="h-2.5">пт</span>
            <span className="h-2.5" />
          </div>

          <div
            className="grid min-w-0 flex-1 gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
          >
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[2px]">
                {week.map((cell) => {
                  if (cell.future) {
                    return (
                      <div
                        key={cell.date}
                        className="aspect-square w-full rounded-[2px] bg-transparent"
                      />
                    )
                  }
                  const level = activityLevel(cell.totalSec)
                  return (
                    <div
                      key={cell.date}
                      title={`${formatDayLabel(cell.date)}: ${formatHms(cell.totalSec)}`}
                      className={`aspect-square w-full rounded-[2px] ${LEVEL_CLASS[level]}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-gray-500">
          <span>Меньше</span>
          {LEVEL_CLASS.map((className, index) => (
            <div key={index} className={`h-2.5 w-2.5 rounded-[2px] ${className}`} />
          ))}
          <span>Больше</span>
        </div>
      </div>
    </div>
  )
}
