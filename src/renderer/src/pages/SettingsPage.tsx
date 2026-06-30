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
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="text-sm text-gray-200">{label}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-indigo-500' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
            checked ? 'left-[22px]' : 'left-0.5'
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
    <label className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-gray-200">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-24 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-right text-sm text-gray-100 outline-none focus:border-indigo-400/50"
        />
        <span className="w-10 text-xs text-gray-500">{suffix}</span>
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
    <div className="mt-6 rounded-2xl border border-white/5 bg-[#0d1220] p-6">
      <h2 className="mb-2 text-sm font-semibold text-white">Toggl Track</h2>
      <div className="divide-y divide-white/5">
        <Toggle
          label="Синхронизировать с Toggl Track"
          hint="Зеркалить старт/стоп сессий в Toggl (с проектом; категория идёт тегом)"
          checked={enabled}
          onChange={onToggleEnabled}
        />
        <div className="py-3">
          <div className="mb-2 text-sm text-gray-200">API-токен</div>
          <div className="mb-2 flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={status?.connected ? 'Токен сохранён — введи новый для замены' : 'Вставь API-токен из профиля Toggl'}
              className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-400/50"
            />
            <button
              onClick={handleConnect}
              disabled={testing || !token.trim()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
            >
              {testing ? 'Проверка…' : 'Проверить'}
            </button>
          </div>
          <p className="text-xs text-gray-600">
            Токен найдёшь в Toggl Track: Profile settings → API Token. Хранится в зашифрованном виде
            локально.
          </p>
          {status && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  status.lastError ? 'bg-amber-400' : status.connected ? 'bg-emerald-400' : 'bg-gray-500'
                }`}
              />
              <span className="text-gray-400">
                {status.lastError
                  ? `Ошибка: ${status.lastError}`
                  : status.connected
                    ? 'Подключено'
                    : 'Не подключено'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
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

  if (!settings) return null

  const weekdayHours = settings.goalWeekdaySec / 3600
  const weekendHours = settings.goalWeekendSec / 3600

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-white">Настройки</h1>
      <p className="mb-6 text-sm text-gray-500">Дневная цель, время сброса и блокировка.</p>

      <div className="rounded-2xl border border-white/5 bg-[#0d1220] p-6">
        <h2 className="mb-2 text-sm font-semibold text-white">Дневная цель</h2>
        <div className="divide-y divide-white/5">
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
        <p className="mt-3 text-xs text-gray-600">
          Счётчик дня обнуляется в указанный час (например, в 4:00), чтобы поздние ночные сессии
          засчитывались в правильный день.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-white/5 bg-[#0d1220] p-6">
        <h2 className="mb-2 text-sm font-semibold text-white">Блокировка и запуск</h2>
        <div className="divide-y divide-white/5">
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
      </div>

      <TogglSection
        enabled={settings.togglEnabled}
        onToggleEnabled={(value) => {
          void patch({ togglEnabled: value })
          addToast(value ? 'Синхронизация с Toggl включена' : 'Синхронизация с Toggl выключена', 'info')
        }}
      />
    </div>
  )
}
