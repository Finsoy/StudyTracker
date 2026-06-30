import { app } from 'electron'

/** Registers or removes the app from OS login items. */
export function applyAutostart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ['--autostart']
  })
}

export function syncAutostart(enabled: boolean): void {
  const current = app.getLoginItemSettings().openAtLogin
  if (current !== enabled) applyAutostart(enabled)
}
