import { useEffect, useState } from 'react'
import type { AppSettings, TogglStatus } from '@shared/types'
import { useToast } from '../components/toast'

function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint: string
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <div className="text-sm text-ink">{label}</div>
        <div className="mt-1.5 max-w-lg text-xs leading-relaxed text-muted">{hint}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay motion-reduce:transition-none ${
          checked ? 'bg-sage' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-ink transition-transform motion-reduce:transition-none ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

function NumberField({
  value,
  onChange,
  label,
  suffix,
  step,
  min,
  max
}: {
  value: number
  onChange: (value: number) => void
  label: string
  suffix: string
  step: number
  min: number
  max: number
}) {
  return (
    <label className="flex flex-wrap items-center justify-between gap-3 py-4">
      <span className="text-sm text-ink">{label}</span>
      <span className="flex shrink-0 items-center gap-3">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-24 rounded-lg border border-line bg-page px-3 py-2.5 text-right text-sm text-ink tabular-nums outline-none transition-colors hover:border-faint focus:border-clay focus:ring-2 focus:ring-clay/20"
        />
        <span className="w-10 text-xs text-faint">{suffix}</span>
      </span>
    </label>
  )
}

function TogglSection({
  enabled,
  onToggleEnabled
}: {
  enabled: boolean
  onToggleEnabled: (value: boolean) => void
}) {
  const { addToast } = useToast()
  const [status, setStatus] = useState<TogglStatus | null>(null)
  const [token, setToken] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void window.api.toggl.getStatus().then(setStatus)
  }, [])

  async function handleConnect() {
    if (!token.trim()) return
    setTesting(true)
    try {
      const info = await window.api.toggl.testConnection(token.trim())
      setToken('')
      setStatus(await window.api.toggl.getStatus())
      addToast(`Подключено: ${info.email} (${info.workspaceName})`, 'success')
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Не удалось подключиться', 'warning')
    } finally {
      setTesting(false)
    }
  }

  return (
    <section
      className="rounded-xl border border-line bg-surface p-5 sm:p-6"
      aria-labelledby="toggl-settings-title"
    >
      <h2 id="toggl-settings-title" className="font-display text-2xl font-normal">
        Toggl Track
      </h2>
      <p className="mt-2 mb-3 text-sm leading-relaxed text-muted">
        Твои сессии в одном рабочем пространстве.
      </p>
      <div className="divide-y divide-line">
        <Toggle
          label="Синхронизировать с Toggl Track"
          hint="Автоматически запускать и останавливать сессии в Toggl. Проект и категория сохранятся."
          checked={enabled}
          onChange={onToggleEnabled}
        />
        <div className="pt-5">
          <label htmlFor="toggl-api-token" className="mb-3 block text-sm text-ink">
            API-токен
          </label>
          <div className="mb-3 flex flex-wrap gap-3">
            <input
              id="toggl-api-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={
                status?.connected
                  ? 'Токен сохранён — введи новый для замены'
                  : 'Вставь API-токен из профиля Toggl'
              }
              aria-describedby="toggl-token-hint"
              className="min-w-0 flex-1 basis-60 rounded-lg border border-line bg-page px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint hover:border-faint focus:border-clay focus:ring-2 focus:ring-clay/20"
            />
            <button
              onClick={handleConnect}
              disabled={testing || !token.trim()}
              aria-busy={testing}
              className="rounded-lg bg-clay px-5 py-2.5 text-sm font-medium text-sidebar transition-colors hover:bg-clay/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay disabled:cursor-not-allowed disabled:opacity-40"
            >
              {testing ? 'Проверка…' : 'Проверить'}
            </button>
          </div>
          <p id="toggl-token-hint" className="text-xs leading-relaxed text-faint">
            Токен найдёшь в Toggl Track: Profile settings → API Token. Хранится в зашифрованном виде
            локально.
          </p>
          {status && (
            <div
              role="status"
              className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-page px-3 py-3 text-xs"
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  status.lastError ? 'bg-clay' : status.connected ? 'bg-sage' : 'bg-faint'
                }`}
              />
              <span
                className={
                  status.lastError ? 'text-clay' : status.connected ? 'text-sage' : 'text-muted'
                }
              >
                {status.lastError
                  ? `Ошибка: ${status.lastError}`
                  : status.connected
                    ? 'Подключено'
                    : 'Не подключено'}
              </span>
            </div>
          )}
          {!status && (
            <p role="status" className="mt-4 text-xs text-muted">
              Проверяем подключение…
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export function SettingsPage() {
  const { addToast } = useToast()
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
  }, [])

  async function patch(update: Partial<AppSettings>) {
    const next = await window.api.settings.update(update)
    setSettings(next)
  }

  if (!settings)
    return (
      <div className="mx-auto max-w-5xl text-ink">
        <h1 className="font-display text-3xl font-normal sm:text-4xl">Настройки</h1>
        <p role="status" className="mt-6 text-sm text-muted">
          Загружаем настройки…
        </p>
      </div>
    )

  const weekdayHours = settings.goalWeekdaySec / 3600
  const weekendHours = settings.goalWeekendSec / 3600

  return (
    <div className="mx-auto max-w-5xl text-ink">
      <h1 className="font-display text-3xl leading-tight font-normal sm:text-4xl">
        Твой ритм работы.
      </h1>
      <p className="mt-3 mb-8 text-sm text-muted">
        Дневные цели, защита фокуса и подключённые сервисы.
      </p>

      <div className="space-y-5">
        <section
          className="rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="daily-goal-settings-title"
        >
          <h2 id="daily-goal-settings-title" className="font-display text-2xl font-normal">
            Дневная цель
          </h2>
          <p className="mt-2 mb-3 text-sm leading-relaxed text-muted">
            Выбери комфортное время для будней и выходных.
          </p>
          <div className="divide-y divide-line">
            <NumberField
              label="Будни (Пн–Пт)"
              value={Number(weekdayHours.toFixed(2))}
              suffix="часов"
              step={0.5}
              min={0}
              max={24}
              onChange={(hours) => patch({ goalWeekdaySec: Math.round(hours * 3600) })}
            />
            <NumberField
              label="Выходные (Сб–Вс)"
              value={Number(weekendHours.toFixed(2))}
              suffix="часов"
              step={0.5}
              min={0}
              max={24}
              onChange={(hours) => patch({ goalWeekendSec: Math.round(hours * 3600) })}
            />
            <NumberField
              label="Час сброса счётчика"
              value={settings.resetHour}
              suffix="ч"
              step={1}
              min={0}
              max={23}
              onChange={(hour) => patch({ resetHour: Math.max(0, Math.min(23, Math.round(hour))) })}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-faint">
            Счётчик дня обнуляется в указанный час (например, в 4:00), чтобы поздние ночные сессии
            засчитывались в правильный день.
          </p>
        </section>

        <section
          className="rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="blocking-settings-title"
        >
          <h2 id="blocking-settings-title" className="font-display text-2xl font-normal">
            Блокировка и запуск
          </h2>
          <p className="mt-2 mb-3 text-sm leading-relaxed text-muted">
            Помоги себе держать внимание на главном.
          </p>
          <div className="divide-y divide-line">
            <Toggle
              label="Блокировать игры"
              hint="Закрывать запрещённые игры, пока цель не достигнута"
              checked={settings.blockingEnabled}
              onChange={(value) => {
                void patch({ blockingEnabled: value })
                addToast(value ? 'Блокировка включена' : 'Блокировка выключена', 'info')
              }}
            />
            <Toggle
              label="Запускать при старте Windows"
              hint="Автозапуск в трее, чтобы блокировка работала сразу"
              checked={settings.autostartEnabled}
              onChange={(value) => void patch({ autostartEnabled: value })}
            />
          </div>
        </section>

        <section
          className="rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="gamification-settings-title"
        >
          <h2 id="gamification-settings-title" className="font-display text-2xl font-normal">
            Прогресс и привычки
          </h2>
          <p className="mt-2 mb-3 text-sm leading-relaxed text-muted">
            Замечай свой рост и поддерживай регулярность.
          </p>
          <div className="divide-y divide-line">
            <Toggle
              label="Геймификация"
              hint="Стрик, уровень, сезоны и ачивки"
              checked={settings.gamificationEnabled}
              onChange={(value) => {
                void patch({ gamificationEnabled: value })
                addToast(value ? 'Геймификация включена' : 'Геймификация выключена', 'info')
              }}
            />
            <NumberField
              label="Порог зачётного дня для стрика"
              value={Math.round(settings.streakMinSec / 60)}
              suffix="мин"
              step={5}
              min={5}
              max={240}
              onChange={(minutes) =>
                patch({ streakMinSec: Math.max(5, Math.min(240, Math.round(minutes))) * 60 })
              }
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-faint">
            Порог стрика отдельно от дневной цели: достаточно короткой сессии, чтобы не рвать цепь.
            Выходные не рвут стрик.
          </p>
        </section>

        <TogglSection
          enabled={settings.togglEnabled}
          onToggleEnabled={(value) => {
            void patch({ togglEnabled: value })
            addToast(
              value ? 'Синхронизация с Toggl включена' : 'Синхронизация с Toggl выключена',
              'info'
            )
          }}
        />
      </div>
    </div>
  )
}
