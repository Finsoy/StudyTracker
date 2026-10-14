import { useEffect, useRef, useState } from 'react'
import type {
  GoalStatus,
  SessionCategory,
  TogglProject,
  TogglStatus,
  TrackerState
} from '@shared/types'
import { formatDuration, formatHms } from '@shared/time'
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

  const elapsedSec =
    active && nowMs ? Math.max(0, Math.round((nowMs - active.startedAt) / 1000)) : 0
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
    <div className="mx-auto max-w-5xl text-ink">
      <h1 className="font-display text-3xl leading-tight font-normal sm:text-4xl">
        {active ? 'Сейчас — время фокуса.' : 'Время для важного.'}
      </h1>
      <p className="mt-3 mb-6 text-sm text-muted">
        Запусти таймер на время учёбы или работы. Время суммируется в дневную цель.
      </p>

      {togglStatus?.enabled && (
        <div className="mb-5 flex items-start gap-2 text-xs leading-relaxed">
          <span
            aria-hidden="true"
            className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
              togglStatus.lastError
                ? 'bg-amber-400'
                : togglStatus.connected
                  ? 'bg-sage'
                  : 'bg-faint'
            }`}
          />
          <span className={togglStatus.lastError ? 'text-amber-300' : 'text-muted'}>
            {togglStatus.lastError
              ? `Toggl: ошибка синхронизации — ${togglStatus.lastError}`
              : togglStatus.connected
                ? 'Сессии синхронизируются с Toggl Track'
                : 'Toggl включён, но не подключён — задай токен в настройках'}
          </span>
        </div>
      )}

      <section
        className="rounded-xl border border-line bg-surface p-5 text-center sm:p-6"
        aria-label="Таймер сессии"
      >
        <p className="flex items-center justify-center gap-2 text-sm text-muted">
          {active && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sage" />}
          {active ? 'Текущая сессия' : 'Сегодня всего'}
        </p>
        <p className="my-5 font-mono text-4xl leading-none font-normal tracking-tight text-ink tabular-nums sm:text-5xl">
          {active ? formatHms(elapsedSec) : formatHms(state.todayTotalSec)}
        </p>
        <p className="text-sm text-muted">
          {!goal.dayKey
            ? 'Загружаем дневную цель…'
            : goal.goalSec > 0
              ? `Сегодня накоплено ${formatDuration(goal.accumulatedSec)} из ${formatDuration(goal.goalSec)}`
              : `Сегодня накоплено ${formatDuration(goal.accumulatedSec)} · дневная цель не задана`}
        </p>

        {goal.dayKey && goal.goalSec > 0 && (
          <div className="mx-auto mt-5 max-w-md">
            <div
              role="progressbar"
              aria-label="Выполнение дневной цели"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.floor(progress)}
              className="h-1.5 overflow-hidden rounded-full bg-line"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${goal.isMet ? 'bg-sage' : 'bg-clay'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {goal.isMet && <p className="mt-3 text-xs text-sage">Дневная цель выполнена.</p>}
          </div>
        )}
        <div className="mx-auto mt-6 grid max-w-2xl items-end gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-left text-sm text-muted">Занятие</legend>
            <div className="flex h-12 rounded-lg border border-line bg-page p-1">
              {(['study', 'work'] as SessionCategory[]).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={selectedCategory === value}
                  disabled={active !== null}
                  onClick={() => setCategory(value)}
                  className={`flex-1 rounded-md px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay disabled:cursor-default ${
                    selectedCategory === value
                      ? 'bg-clay/15 text-clay'
                      : 'text-muted hover:bg-surface hover:text-ink disabled:hover:bg-transparent disabled:hover:text-muted'
                  }`}
                >
                  {value === 'study' ? 'Учёба' : 'Работа'}
                </button>
              ))}
            </div>
          </fieldset>

          {active ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-clay px-5 py-3 text-sm font-medium text-sidebar transition-colors hover:bg-clay/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <rect x="5" y="5" width="10" height="10" rx="1" />
              </svg>
              Остановить и сохранить
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-clay px-5 py-3 text-sm font-medium text-sidebar transition-colors hover:bg-clay/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="m6 4 10 6-10 6V4Z" />
              </svg>
              Начать сессию
            </button>
          )}
        </div>
      </section>

      <section
        className="mt-5 rounded-xl border border-line bg-surface p-5 sm:p-6"
        aria-label="Параметры сессии"
      >
        <div>
          <label htmlFor="session-note" className="mb-2 block text-sm text-muted">
            Над чем работаешь? <span className="text-xs text-faint">Необязательно</span>
          </label>
          <input
            id="session-note"
            type="text"
            value={active?.note ?? note}
            disabled={active !== null}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Например, глава книги или рабочая задача"
            className="w-full rounded-lg border border-line bg-page px-4 py-3 text-sm text-ink placeholder:text-faint focus-visible:border-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay disabled:cursor-default disabled:text-muted"
          />
        </div>

        {togglOn && (
          <div className="mt-5">
            {active ? (
              <div>
                <p className="mb-2 text-sm text-muted">Проект Toggl</p>
                {active.projectName ? (
                  <p className="rounded-lg border border-line bg-page px-4 py-3 text-sm text-ink">
                    {active.projectName}
                  </p>
                ) : (
                  <p className="text-sm text-faint">Без проекта</p>
                )}
              </div>
            ) : selectedProject ? (
              <div>
                <p className="mb-2 text-sm text-muted">Проект Toggl</p>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-page px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: selectedProject.color || '#d97757' }}
                    />
                    {selectedProject.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProject(null)}
                    className="shrink-0 rounded px-2 py-1 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                    aria-label="Убрать проект"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative" ref={projectPickerRef}>
                <label htmlFor="session-project" className="mb-2 block text-sm text-muted">
                  Проект Toggl
                </label>
                <input
                  id="session-project"
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
                  placeholder="Выбери из списка или создай новый"
                  className="w-full rounded-lg border border-line bg-page px-4 py-3 text-sm text-ink placeholder:text-faint focus-visible:border-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                />
                {projectDropdownOpen && (
                  <div className="absolute z-10 mt-2 max-h-64 w-full overflow-y-auto overscroll-contain rounded-lg border border-line bg-sidebar shadow-lg">
                    {projectSuggestions.map((project) => (
                      <button
                        type="button"
                        key={project.id}
                        onClick={() => chooseProject(project)}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-muted hover:bg-surface hover:text-ink focus-visible:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-clay"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color || '#d97757' }}
                        />
                        {project.name}
                      </button>
                    ))}
                    {canCreateProject && (
                      <button
                        type="button"
                        onClick={() => void createProject(projectInput)}
                        disabled={creatingProject}
                        className="block w-full px-4 py-3 text-left text-sm text-clay hover:bg-surface focus-visible:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-clay disabled:opacity-50"
                      >
                        {creatingProject ? 'Создаём…' : `Создать проект «${projectInput.trim()}»`}
                      </button>
                    )}
                    {projectSuggestions.length === 0 && !canCreateProject && (
                      <p className="px-4 py-3 text-sm text-faint">Проекты не найдены</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
