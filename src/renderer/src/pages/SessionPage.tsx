import { useState } from 'react'
import type { GoalStatus, SessionCategory, TrackerState } from '@shared/types'
import { formatHms } from '@shared/time'
import { useToast } from '../components/toast'

interface SessionPageProps {
  state: TrackerState
  goal: GoalStatus
  nowMs: number
}

export function SessionPage({ state, goal, nowMs }: SessionPageProps) {
  const { addToast } = useToast()
  const [category, setCategory] = useState<SessionCategory>('study')
  const [note, setNote] = useState('')
  const active = state.active
  const selectedCategory = active ? active.category : category

  const elapsedSec = active && nowMs ? Math.max(0, Math.round((nowMs - active.startedAt) / 1000)) : 0
  const progress = goal.goalSec > 0 ? Math.min(100, (goal.accumulatedSec / goal.goalSec) * 100) : 0

  async function handleStart() {
    await window.api.tracker.start(category, note.trim() || null)
    addToast('Сессия запущена', 'success')
  }

  async function handleStop() {
    await window.api.tracker.stop()
    setNote('')
    addToast('Сессия сохранена', 'success')
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-white">Сессия</h1>
      <p className="mb-8 text-sm text-gray-500">
        Запусти таймер на время учёбы или работы. Время суммируется в дневную цель.
      </p>

      <div className="rounded-2xl border border-white/5 bg-[#0d1220] p-8 text-center">
        <div className="text-xs uppercase tracking-widest text-gray-500">
          {active ? 'Текущая сессия' : 'Сегодня всего'}
        </div>
        <div className="my-3 font-mono text-6xl font-bold tracking-tight text-white tabular-nums">
          {active ? formatHms(elapsedSec) : formatHms(state.todayTotalSec)}
        </div>
        <div className="text-sm text-gray-400">
          Сегодня накоплено {formatHms(goal.accumulatedSec)} из {formatHms(goal.goalSec)}
        </div>

        <div className="mx-auto mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full rounded-full transition-all ${goal.isMet ? 'bg-emerald-400' : 'bg-indigo-400'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/5 bg-[#0d1220] p-6">
        <div className="mb-4 flex gap-2">
          {(['study', 'work'] as SessionCategory[]).map((value) => (
            <button
              key={value}
              disabled={active !== null}
              onClick={() => setCategory(value)}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition disabled:opacity-50 ${
                selectedCategory === value
                  ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200'
                  : 'border-white/5 bg-black/20 text-gray-400 hover:text-gray-200'
              }`}
            >
              {value === 'study' ? 'Учёба' : 'Работа'}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={active?.note ?? note}
          disabled={active !== null}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Над чем работаешь? (необязательно)"
          className="mb-4 w-full rounded-lg border border-white/5 bg-black/20 px-4 py-3 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:border-indigo-400/50 disabled:opacity-50"
        />

        {active ? (
          <button
            onClick={handleStop}
            className="w-full rounded-lg bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400"
          >
            Остановить и сохранить
          </button>
        ) : (
          <button
            onClick={handleStart}
            className="w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            Начать сессию
          </button>
        )}
      </div>
    </div>
  )
}
