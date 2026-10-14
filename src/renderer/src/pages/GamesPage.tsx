import { useEffect, useState } from 'react'
import type { BlockedGame, SteamGameCandidate } from '@shared/types'
import { useToast } from '../components/toast'

export function GamesPage() {
  const { addToast } = useToast()
  const [games, setGames] = useState<BlockedGame[]>([])
  const [isLoadingGames, setIsLoadingGames] = useState(true)
  const [candidates, setCandidates] = useState<SteamGameCandidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)

  async function loadGames() {
    setGames(await window.api.games.list())
  }

  useEffect(() => {
    void window.api.games
      .list()
      .then(setGames)
      .finally(() => setIsLoadingGames(false))
  }, [])

  async function handleAddManual() {
    const added = await window.api.games.addManual()
    if (added) {
      await loadGames()
      addToast(`«${added.displayName}» добавлена в блок-лист`, 'success')
    }
  }

  async function handleScan() {
    setScanning(true)
    try {
      const found = await window.api.games.scanSteam()
      setCandidates(found)
      setSelected(new Set())
      if (found.length === 0) addToast('Steam-игры не найдены', 'warning')
    } finally {
      setScanning(false)
    }
  }

  async function handleAddSelected() {
    if (!candidates) return
    const chosen = candidates.filter((game) => selected.has(game.installDir))
    if (chosen.length === 0) return
    const added = await window.api.games.addSteam(chosen)
    await loadGames()
    setCandidates(null)
    addToast(`Добавлено игр: ${added.length}`, 'success')
  }

  async function handleToggle(game: BlockedGame) {
    await window.api.games.setEnabled(game.id, !game.enabled)
    await loadGames()
  }

  async function handleRemove(game: BlockedGame) {
    await window.api.games.remove(game.id)
    await loadGames()
  }

  function toggleSelected(installDir: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(installDir)) next.delete(installDir)
      else next.add(installDir)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-5xl text-ink">
      <h1 className="font-display text-3xl leading-tight font-normal sm:text-4xl">
        Меньше отвлечений.
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        Добавь игры в блок-лист. Они будут закрываться автоматически, пока дневная цель не
        достигнута.
      </p>

      <div className="mt-6 mb-8 flex flex-wrap gap-3">
        <button
          onClick={handleAddManual}
          className="rounded-lg bg-clay px-5 py-3 text-sm font-medium text-sidebar transition-colors hover:bg-clay/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
        >
          Добавить .exe вручную
        </button>
        <button
          onClick={handleScan}
          disabled={scanning}
          aria-busy={scanning}
          className="rounded-lg border border-line bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay disabled:cursor-wait disabled:opacity-50"
        >
          {scanning ? 'Сканирую Steam…' : 'Сканировать Steam'}
        </button>
      </div>

      {isLoadingGames ? (
        <p
          role="status"
          className="rounded-xl border border-line bg-surface p-6 text-sm text-muted"
        >
          Загружаем список игр…
        </p>
      ) : games.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mx-auto mb-5 h-10 w-10 text-faint"
          >
            <path d="M8 7h8a4 4 0 0 1 4 3.4l1 6.1a2.5 2.5 0 0 1-4.2 2.2L14 16h-4l-2.8 2.7A2.5 2.5 0 0 1 3 16.5l1-6.1A4 4 0 0 1 8 7Z" />
            <path d="M8 10v4m-2-2h4m5-1h.01M18 13h.01" />
          </svg>
          <h2 className="font-display text-2xl font-normal">Пока всё спокойно</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
            В блок-листе ещё нет игр. Выбери .exe вручную или найди установленные игры в Steam.
          </p>
        </section>
      ) : (
        <section
          className="overflow-hidden rounded-xl border border-line bg-surface"
          aria-label="Заблокированные игры"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-5 sm:px-6">
            <h2 className="font-display text-2xl font-normal">Твой блок-лист</h2>
            <span className="text-xs text-muted">Всего: {games.length}</span>
          </div>
          {games.map((game) => (
            <div
              key={game.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-4 border-b border-line px-5 py-5 last:border-b-0 sm:px-6"
            >
              <span className="w-14 shrink-0 rounded-md border border-line bg-page px-2 py-1.5 text-center text-xs text-muted">
                {game.type === 'steam' ? 'Steam' : 'exe'}
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <div className="truncate text-sm text-ink">{game.displayName}</div>
                <div
                  className="mt-1 truncate text-xs text-faint"
                  title={game.exeName ?? game.installDir ?? undefined}
                >
                  {game.exeName ?? game.installDir}
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-3 text-xs text-muted">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`Блокировка игры ${game.displayName}`}
                  aria-checked={game.enabled}
                  checked={game.enabled}
                  onChange={() => handleToggle(game)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-sage peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-clay after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-ink after:transition-transform peer-checked:after:translate-x-5 motion-reduce:transition-none motion-reduce:after:transition-none"
                />
                <span className={game.enabled ? 'w-20 text-sage' : 'w-20 text-faint'}>
                  {game.enabled ? 'Включена' : 'Выключена'}
                </span>
              </label>
              <button
                onClick={() => handleRemove(game)}
                aria-label={`Удалить игру ${game.displayName}`}
                className="rounded-md px-2 py-2 text-xs text-faint transition-colors hover:bg-clay/10 hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
              >
                Удалить
              </button>
            </div>
          ))}
        </section>
      )}

      {candidates && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-sidebar/80 p-4 backdrop-blur-sm sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="steam-games-title"
            aria-describedby="steam-games-description"
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-line bg-surface text-ink shadow-2xl"
          >
            <div className="border-b border-line px-6 py-5">
              <h2 id="steam-games-title" className="font-display text-2xl font-normal">
                Игры из Steam
              </h2>
              <p id="steam-games-description" className="mt-2 text-sm text-muted">
                Отметь те, что хочешь блокировать.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {candidates.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="font-display text-xl">Игры не найдены</p>
                  <p className="mt-2 text-sm text-muted">Можно добавить .exe вручную.</p>
                </div>
              )}
              {candidates.map((game) => (
                <label
                  key={game.installDir}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-page has-checked:bg-page"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(game.installDir)}
                    onChange={() => toggleSelected(game.installDir)}
                    className="h-4 w-4 shrink-0 accent-clay focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
                  />
                  <span className="min-w-0 text-sm break-words text-ink">{game.name}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-5">
              <button
                onClick={() => setCandidates(null)}
                className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted transition-colors hover:bg-line hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
              >
                Отмена
              </button>
              <button
                onClick={handleAddSelected}
                disabled={selected.size === 0}
                className="rounded-lg bg-clay px-4 py-2.5 text-sm font-medium text-sidebar transition-colors hover:bg-clay/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay disabled:cursor-not-allowed disabled:opacity-40"
              >
                Добавить ({selected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
