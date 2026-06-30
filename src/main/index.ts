import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, Notification, Tray } from 'electron'
import { IPC } from '@shared/ipc'
import { initDatabase, settingsRepo } from './db/database'
import { TrackerService } from './services/TrackerService'
import { GoalService } from './services/GoalService'
import { BlockerService } from './services/BlockerService'
import { registerIpc } from './ipc'
import { syncAutostart } from './autostart'
import { createAppIcon } from './tray-icon'

const isDev = !!process.env.ELECTRON_RENDERER_URL

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let tickTimer: NodeJS.Timeout | null = null
let isQuitting = false

const tracker = new TrackerService()
const goal = new GoalService(tracker)
const blocker = new BlockerService(goal)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: createAppIcon(256),
    title: 'StudyTracker',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function requestQuit(): void {
  // Light anti-bypass friction: quitting stops blocking, so confirm while locked.
  if (goal.isBlockingActive()) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Остаться', 'Всё равно выйти'],
      defaultId: 0,
      cancelId: 0,
      title: 'Игры заблокированы',
      message: 'Цель на сегодня ещё не выполнена.',
      detail: 'Если выйти, блокировка игр перестанет работать. Точно выйти?'
    })
    if (choice !== 1) return
  }
  isQuitting = true
  app.quit()
}

function createTray(): void {
  tray = new Tray(createAppIcon(16))
  tray.setToolTip('StudyTracker')
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть StudyTracker', click: showWindow },
    { type: 'separator' },
    { label: 'Выход', click: requestQuit }
  ])
  tray.setContextMenu(menu)
  tray.on('click', showWindow)
}

function startTick(): void {
  tickTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(IPC.eventTick, {
      state: tracker.getState(),
      goal: goal.getStatus()
    })
  }, 1000)
}

function notifyBlocked(gameName: string): void {
  const status = goal.getStatus()
  const remainingMin = Math.ceil(status.remainingSec / 60)
  if (Notification.isSupported()) {
    new Notification({
      title: 'Игра заблокирована',
      body: `${gameName}: позанимайся ещё ${remainingMin} мин, чтобы разблокировать.`,
      icon: createAppIcon(64)
    }).show()
  }
  mainWindow?.webContents.send(IPC.eventBlocked, { gameName })
}

const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.whenReady().then(() => {
    app.setAppUserModelId('com.studytracker.app')
    initDatabase()
    syncAutostart(settingsRepo.get().autostartEnabled)

    registerIpc({ tracker, goal })
    blocker.setBlockHandler((event) => notifyBlocked(event.gameName))
    blocker.start()

    createWindow()
    createTray()
    startTick()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('window-all-closed', () => {
    // Keep running in the tray so blocking stays active even with no window.
  })

  app.on('will-quit', () => {
    if (tickTimer) clearInterval(tickTimer)
    blocker.stop()
    // Persist any session still running when the app exits.
    tracker.stop()
  })
}
