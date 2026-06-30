import { useEffect, useState } from 'react'
import type { GoalStatus, TrackerState } from '@shared/types'
import { ToastProvider, useToast } from './components/toast'
import { Sidebar, type TabKey } from './components/Sidebar'
import { DashboardPage } from './pages/DashboardPage'
import { SessionPage } from './pages/SessionPage'
import { GamesPage } from './pages/GamesPage'
import { SettingsPage } from './pages/SettingsPage'

const EMPTY_GOAL: GoalStatus = {
  dayKey: '',
  goalSec: 0,
  accumulatedSec: 0,
  remainingSec: 0,
  isMet: false,
  isWeekend: false
}

const EMPTY_STATE: TrackerState = { active: null, todayTotalSec: 0 }

function AppShell() {
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [state, setState] = useState<TrackerState>(EMPTY_STATE)
  const [goal, setGoal] = useState<GoalStatus>(EMPTY_GOAL)
  const [nowMs, setNowMs] = useState(0)
  const { addToast } = useToast()

  useEffect(() => {
    void window.api.tracker.getState().then((value) => {
      setState(value)
      setNowMs(Date.now())
    })
    void window.api.stats.getGoal().then(setGoal)

    const offTick = window.api.events.onTick((payload) => {
      setState(payload.state)
      setGoal(payload.goal)
      setNowMs(Date.now())
    })
    const offBlocked = window.api.events.onBlocked((payload) => {
      addToast(`«${payload.gameName}» заблокирована — цель ещё не достигнута`, 'warning')
    })
    return () => {
      offTick()
      offBlocked()
    }
  }, [addToast])

  return (
    <div className="flex h-full">
      <Sidebar tab={tab} onChange={setTab} goal={goal} active={state.active !== null} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          {tab === 'dashboard' && <DashboardPage goal={goal} />}
          {tab === 'session' && <SessionPage state={state} goal={goal} nowMs={nowMs} />}
          {tab === 'games' && <GamesPage />}
          {tab === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  )
}
