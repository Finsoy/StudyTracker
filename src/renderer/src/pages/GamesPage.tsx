import { useEffect, useState } from 'react'
import type { BlockedGame, SteamGameCandidate } from '@shared/types'
import { useToast } from '../components/toast'

export function GamesPage() {
  const { addToast } = useToast()
  const [games, setGames] = useState<BlockedGame[]>([])
  const [candidates, setCandidates] = useState<SteamGameCandidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)

  async function loadGames() {
    setGames(await window.api.games.list())
  }

  useEffect(() => {
    void window.api.games.list().then(setGames)
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
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-white">Заблокированные игры</h1>
      <p className="mb-6 text-sm text-gray-500">
        Эти игры закрываются автоматически, пока дневная цель не достигнута.
      </p>

      <div className="mb-6 flex gap-3">
        <button
          onClick={handleAddManual}
          className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          Добавить .exe вручную
        </button>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="rounded-lg border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:bg-white/5 disabled:opacity-50"
        >
          {scanning ? 'Сканирую Steam…' : 'Сканировать Steam'}
        </button>
      </div>

      {games.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-10 text-center text-sm text-gray-500">
          Пока нет заблокированных игр. Добавь .exe или просканируй Steam.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#0d1220]">
          {games.map((game) => (
            <div
              key={game.id}
              className="flex items-center gap-4 border-b border-white/5 px-5 py-4 last:border-b-0"
            >
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  game.type === 'steam'
                    ? 'bg-sky-500/15 text-sky-300'
                    : 'bg-violet-500/15 text-violet-300'
                }`}
              >
                {game.type === 'steam' ? 'Steam' : 'exe'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-gray-100">{game.displayName}</div>
                <div className="truncate text-xs text-gray-600">
                  {game.exeName ?? game.installDir}
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={game.enabled}
                  onChange={() => handleToggle(game)}
                  className="h-4 w-4 accent-indigo-500"
                />
                активна
              </label>
              <button
                onClick={() => handleRemove(game)}
                className="rounded-md px-2 py-1 text-xs text-gray-500 transition hover:bg-rose-500/10 hover:text-rose-300"
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}

      {candidates && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#0d1220] shadow-2xl">
            <div className="border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-semibold text-white">Игры из Steam</h2>
              <p className="text-xs text-gray-500">Отметь те, что хочешь блокировать.</p>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {candidates.length === 0 && (
                <div className="p-6 text-center text-sm text-gray-500">Ничего не найдено.</div>
              )}
              {candidates.map((game) => (
                <label
                  key={game.installDir}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(game.installDir)}
                    onChange={() => toggleSelected(game.installDir)}
                    className="h-4 w-4 accent-indigo-500"
                  />
                  <span className="text-sm text-gray-200">{game.name}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button
                onClick={() => setCandidates(null)}
                className="rounded-lg px-4 py-2 text-sm text-gray-400 transition hover:text-gray-200"
              >
                Отмена
              </button>
              <button
                onClick={handleAddSelected}
                disabled={selected.size === 0}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
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
