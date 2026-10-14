import type { GoalStatus } from '@shared/types'
import { formatDuration } from '@shared/time'

export type TabKey = 'dashboard' | 'session' | 'games' | 'settings' | 'progress'

interface SidebarProps {
  tab: TabKey
  onChange: (tab: TabKey) => void
  goal: GoalStatus
  active: boolean
  streakCurrent: number
}

const NAV_ITEMS: { key: TabKey; label: string; iconPath: string }[] = [
  { key: 'dashboard', label: 'Дашборд', iconPath: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9' },
  {
    key: 'session',
    label: 'Сессия',
    iconPath: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM10 8l6 4-6 4Z'
  },
  { key: 'progress', label: 'Прогресс', iconPath: 'M3 13h4v8H3ZM10 8h4v13h-4ZM17 3h4v18h-4Z' },
  {
    key: 'games',
    label: 'Игры',
    iconPath:
      'M7 6h10c2 0 3 2 3.5 4l1 7c.3 2-1.5 3-3 1l-2-3h-9l-2 3c-1.5 2-3.3 1-3-1l1-7C4 8 5 6 7 6ZM8 9v5M5.5 11.5h5M16 10h.01M18 12h.01'
  },
  {
    key: 'settings',
    label: 'Настройки',
    iconPath: 'M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6'
  }
]

export function Sidebar({ tab, onChange, goal, active, streakCurrent }: SidebarProps) {
  const locked = !goal.isMet
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar px-4 py-7">
      <div className="mb-9 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-clay font-display text-3xl text-ink">
          S
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg text-ink">StudyTracker</div>
          <div className="mt-0.5 text-xs text-muted">фокус важнее игр</div>
        </div>
      </div>

      <nav aria-label="Основная навигация" className="flex flex-1 flex-col gap-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-current={tab === item.key ? 'page' : undefined}
            onClick={() => onChange(item.key)}
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay ${
              item.key === 'settings' ? 'mt-auto' : ''
            } ${
              tab === item.key
                ? 'bg-clay/20 text-ink'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 shrink-0"
            >
              <path d={item.iconPath} />
            </svg>
            <span>{item.label}</span>
            {item.key === 'session' && active && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sage" aria-label="Сессия идёт" />
            )}
            {item.key === 'progress' && streakCurrent > 0 && (
              <span className="ml-auto text-xs text-muted" title={`Серия: ${streakCurrent} дн.`}>
                {streakCurrent}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-6 flex items-center gap-3 border-t border-line px-2 pt-5">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={`h-6 w-6 shrink-0 ${locked ? 'text-muted' : 'text-sage'}`}
        >
          <rect x="4" y="10" width="16" height="12" rx="2" />
          <path d={locked ? 'M8 10V6a4 4 0 0 1 8 0v4' : 'M8 10V6a4 4 0 0 1 8 0'} />
          <path d="M12 15v3" />
        </svg>
        <div>
          <div className="text-xs text-ink">
            {!goal.dayKey
              ? 'Загрузка цели…'
              : locked
                ? 'Игры заблокированы'
                : 'Игры разблокированы'}
          </div>
          {goal.dayKey && (
            <div className="mt-1 text-xs text-muted">
              {locked ? `До цели — ${formatDuration(goal.remainingSec)}` : 'Дневная цель выполнена'}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
