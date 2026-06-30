import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type BlockedPayload, type StudyTrackerApi, type TickPayload } from '@shared/ipc'

const api: StudyTrackerApi = {
  tracker: {
    getState: () => ipcRenderer.invoke(IPC.trackerGetState),
    start: (category, note, projectId, projectName) =>
      ipcRenderer.invoke(IPC.trackerStart, category, note, projectId, projectName),
    stop: () => ipcRenderer.invoke(IPC.trackerStop)
  },
  stats: {
    getDays: (kind) => ipcRenderer.invoke(IPC.statsGetDays, kind),
    getGoal: () => ipcRenderer.invoke(IPC.statsGetGoal)
  },
  games: {
    list: () => ipcRenderer.invoke(IPC.gamesList),
    addManual: () => ipcRenderer.invoke(IPC.gamesAddManual),
    scanSteam: () => ipcRenderer.invoke(IPC.gamesScanSteam),
    addSteam: (candidates) => ipcRenderer.invoke(IPC.gamesAddSteam, candidates),
    remove: (id) => ipcRenderer.invoke(IPC.gamesRemove, id),
    setEnabled: (id, enabled) => ipcRenderer.invoke(IPC.gamesSetEnabled, id, enabled)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },
  toggl: {
    getStatus: () => ipcRenderer.invoke(IPC.togglGetStatus),
    testConnection: (token) => ipcRenderer.invoke(IPC.togglTestConnection, token),
    setToken: (token) => ipcRenderer.invoke(IPC.togglSetToken, token),
    getProjects: () => ipcRenderer.invoke(IPC.togglGetProjects),
    createProject: (name) => ipcRenderer.invoke(IPC.togglCreateProject, name)
  },
  events: {
    onTick: (handler) => {
      const listener = (_event: IpcRendererEvent, payload: TickPayload) => handler(payload)
      ipcRenderer.on(IPC.eventTick, listener)
      return () => ipcRenderer.removeListener(IPC.eventTick, listener)
    },
    onBlocked: (handler) => {
      const listener = (_event: IpcRendererEvent, payload: BlockedPayload) => handler(payload)
      ipcRenderer.on(IPC.eventBlocked, listener)
      return () => ipcRenderer.removeListener(IPC.eventBlocked, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
