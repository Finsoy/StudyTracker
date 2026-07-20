import type { GoalStatus } from '@shared/types'
import { formatHms } from '@shared/time'

export type TabKey = 'dashboard' | 'session' | 'games' | 'settings' | 'progress'

interface SidebarProps {
  tab: TabKey
  onChange: (tab: TabKey) => void
  goal: GoalStatus
  active: boolean
  streakCurrent: number
}

const NAV_ITEMS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Дашборд', icon: '▣' },
  { key: 'session', label: 'Сессия', icon: '◷' },
  { key: 'progress', label: 'Прогресс', icon: '★' },
  { key: 'games', label: 'Игры', icon: '⛔' },
  { key: 'settings', label: 'Настройки', icon: '⚙' }
]

export function Sidebar({ tab, onChange, goal, active, streakCurrent }: SidebarProps) {
  const locked = !goal.isMet
  const streakDimmed = streakCurrent === 0

  return (
    <aside className="flex w-60 flex-col border-r border-white/5 bg-[#0d1220] px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/90 text-lg font-bold text-white">
          S
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">StudyTracker</div>
          <div className="text-xs text-gray-500">фокус важнее игр</div>
        </div>
        <div
          className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums ${
            streakDimmed
              ? 'bg-white/5 text-gray-500'
              : 'bg-orange-500/15 text-orange-300'
          }`}
          title={streakDimmed ? 'Начни цепь' : `Стрик: ${streakCurrent} дн.`}
        >
          🔥 {streakCurrent}
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
              tab === item.key
                ? 'bg-indigo-500/15 text-indigo-200'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <span className="w-5 text-center">{item.icon}</span>
            <span>{item.label}</span>
            {item.key === 'session' && active && (
              <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-white/5 bg-black/20 p-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium">
          <span
            className={`h-2 w-2 rounded-full ${locked ? 'bg-rose-400' : 'bg-emerald-400'}`}
          />
          <span className={locked ? 'text-rose-300' : 'text-emerald-300'}>
            {locked ? 'Игры заблокированы' : 'Игры разблокированы'}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          {locked
            ? `Осталось ${formatHms(goal.remainingSec)}`
            : 'Дневная цель выполнена'}
        </div>
      </div>
    </aside>
  )
}
