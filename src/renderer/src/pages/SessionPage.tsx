import { useEffect, useRef, useState } from 'react'
import type {
  GoalStatus,
  SessionCategory,
  TogglProject,
  TogglStatus,
  TrackerState
} from '@shared/types'
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
  const [togglStatus, setTogglStatus] = useState<TogglStatus | null>(null)
  const [projects, setProjects] = useState<TogglProject[]>([])
  const [selectedProject, setSelectedProject] = useState<TogglProject | null>(null)
  const [projectInput, setProjectInput] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false)
  const projectPickerRef = useRef<HTMLDivElement>(null)
  const active = state.active
  const selectedCategory = active ? active.category : category
  const togglOn = Boolean(togglStatus?.enabled && togglStatus?.connected)

  const elapsedSec = active && nowMs ? Math.max(0, Math.round((nowMs - active.startedAt) / 1000)) : 0
  const progress = goal.goalSec > 0 ? Math.min(100, (goal.accumulatedSec / goal.goalSec) * 100) : 0

  async function refreshTogglStatus() {
    const status = await window.api.toggl.getStatus()
    setTogglStatus(status)
    return status
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const status = await window.api.toggl.getStatus()
      if (cancelled) return
      setTogglStatus(status)
      if (status.enabled && status.connected) {
        try {
          const list = await window.api.toggl.getProjects()
          if (!cancelled) setProjects(list)
        } catch {
          if (!cancelled) setProjects([])
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!projectDropdownOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (!projectPickerRef.current?.contains(event.target as Node)) {
        setProjectDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [projectDropdownOpen])

  function chooseProject(project: TogglProject) {
    setSelectedProject(project)
    setProjectInput('')
    setProjectDropdownOpen(false)
  }

  async function createProject(name: string) {
    const trimmed = name.trim()
    if (!trimmed || creatingProject) return
    setCreatingProject(true)
    try {
      const project = await window.api.toggl.createProject(trimmed)
      setProjects((prev) => [project, ...prev])
      setSelectedProject(project)
      setProjectInput('')
      setProjectDropdownOpen(false)
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Не удалось создать проект', 'warning')
    } finally {
      setCreatingProject(false)
    }
  }

  async function handleStart() {
    await window.api.tracker.start(
      category,
      note.trim() || null,
      selectedProject?.id ?? null,
      selectedProject?.name ?? null
    )
    addToast('Сессия запущена', 'success')
    if (togglOn) void refreshTogglStatus()
  }

  async function handleStop() {
    await window.api.tracker.stop()
    setNote('')
    setSelectedProject(null)
    setProjectInput('')
    addToast('Сессия сохранена', 'success')
    if (togglOn) void refreshTogglStatus()
  }

  const projectQuery = projectInput.trim().toLowerCase()
  const projectSuggestions = projects.filter((project) =>
    project.name.toLowerCase().includes(projectQuery)
  )
  const canCreateProject =
    projectInput.trim().length > 0 &&
    !projects.some((project) => project.name.toLowerCase() === projectQuery)

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-white">Сессия</h1>
      <p className="mb-4 text-sm text-gray-500">
        Запусти таймер на время учёбы или работы. Время суммируется в дневную цель.
      </p>

      {togglStatus?.enabled && (
        <div className="mb-6 flex items-center gap-2 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              togglStatus.lastError
                ? 'bg-amber-400'
                : togglStatus.connected
                  ? 'bg-emerald-400'
                  : 'bg-gray-500'
            }`}
          />
          <span className="text-gray-400">
            {togglStatus.lastError
              ? `Toggl: ошибка синхронизации — ${togglStatus.lastError}`
              : togglStatus.connected
                ? 'Сессии синхронизируются с Toggl Track'
                : 'Toggl включён, но не подключён — задай токен в настройках'}
          </span>
        </div>
      )}

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

        {togglOn && (
          <div className="mb-4">
            {active ? (
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <span className="text-xs uppercase tracking-widest text-gray-500">Проект</span>
                {active.projectName ? (
                  <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200">
                    {active.projectName}
                  </span>
                ) : (
                  <span className="text-xs text-gray-600">Без проекта</span>
                )}
              </div>
            ) : selectedProject ? (
              <div className="flex items-center justify-between rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm text-indigo-100">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: selectedProject.color || '#818cf8' }}
                  />
                  {selectedProject.name}
                </span>
                <button
                  onClick={() => setSelectedProject(null)}
                  className="text-indigo-300/70 hover:text-white"
                  aria-label="Убрать проект"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="relative" ref={projectPickerRef}>
                <input
                  type="text"
                  value={projectInput}
                  onChange={(event) => {
                    setProjectInput(event.target.value)
                    setProjectDropdownOpen(true)
                  }}
                  onFocus={() => setProjectDropdownOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canCreateProject) {
                      event.preventDefault()
                      void createProject(projectInput)
                    } else if (event.key === 'Escape') {
                      setProjectDropdownOpen(false)
                    }
                  }}
                  placeholder="Проект Toggl: выбери из списка или создай новый"
                  className="w-full rounded-lg border border-white/5 bg-black/20 px-4 py-2.5 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:border-indigo-400/50"
                />
                {projectDropdownOpen && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[#0d1220] shadow-lg">
                    {projectSuggestions.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => chooseProject(project)}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/5"
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color || '#818cf8' }}
                        />
                        {project.name}
                      </button>
                    ))}
                    {canCreateProject && (
                      <button
                        onClick={() => void createProject(projectInput)}
                        disabled={creatingProject}
                        className="block w-full px-4 py-2 text-left text-sm text-indigo-300 hover:bg-white/5 disabled:opacity-50"
                      >
                        {creatingProject
                          ? 'Создаём…'
                          : `Создать проект «${projectInput.trim()}»`}
                      </button>
                    )}
                    {projectSuggestions.length === 0 && !canCreateProject && (
                      <div className="px-4 py-2 text-sm text-gray-600">Проекты не найдены</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
