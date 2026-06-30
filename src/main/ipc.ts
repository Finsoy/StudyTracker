import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  SessionCategory,
  StatsRangeKind,
  SteamGameCandidate
} from '@shared/types'
import { gamesRepo, settingsRepo } from './db/database'
import { scanSteamGames } from './services/SteamScanner'
import type { TrackerService } from './services/TrackerService'
import type { GoalService } from './services/GoalService'
import { applyAutostart } from './autostart'

interface IpcServices {
  tracker: TrackerService
  goal: GoalService
}

export function registerIpc(services: IpcServices): void {
  const { tracker, goal } = services

  ipcMain.handle(IPC.trackerGetState, () => tracker.getState())

  ipcMain.handle(
    IPC.trackerStart,
    (_event, category: SessionCategory, note: string | null) => tracker.start(category, note)
  )

  ipcMain.handle(IPC.trackerStop, () => tracker.stop())

  ipcMain.handle(IPC.statsGetDays, (_event, kind: StatsRangeKind) => goal.getDayStats(kind))

  ipcMain.handle(IPC.statsGetGoal, () => goal.getStatus())

  ipcMain.handle(IPC.gamesList, () => gamesRepo.list())

  ipcMain.handle(IPC.gamesAddManual, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(window!, {
      title: 'Выберите исполняемый файл игры',
      properties: ['openFile'],
      filters: [{ name: 'Приложения', extensions: ['exe'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const exeName = basename(filePath)
    return gamesRepo.insert({
      type: 'manual',
      displayName: exeName.replace(/\.exe$/i, ''),
      exeName,
      installDir: null
    })
  })

  ipcMain.handle(IPC.gamesScanSteam, () => scanSteamGames())

  ipcMain.handle(IPC.gamesAddSteam, (_event, candidates: SteamGameCandidate[]) => {
    const added = []
    for (const candidate of candidates) {
      if (gamesRepo.existsSteam(candidate.installDir)) continue
      added.push(
        gamesRepo.insert({
          type: 'steam',
          displayName: candidate.name,
          exeName: null,
          installDir: candidate.installDir
        })
      )
    }
    return added
  })

  ipcMain.handle(IPC.gamesRemove, (_event, id: number) => gamesRepo.remove(id))

  ipcMain.handle(IPC.gamesSetEnabled, (_event, id: number, enabled: boolean) =>
    gamesRepo.setEnabled(id, enabled)
  )

  ipcMain.handle(IPC.settingsGet, () => settingsRepo.get())

  ipcMain.handle(IPC.settingsUpdate, (_event, patch: Partial<AppSettings>) => {
    const updated = settingsRepo.update(patch)
    if (patch.autostartEnabled !== undefined) {
      applyAutostart(updated.autostartEnabled)
    }
    return updated
  })
}
