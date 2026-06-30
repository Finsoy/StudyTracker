import { execFile } from 'node:child_process'

export interface RunningProcess {
  pid: number
  name: string
  execPath: string | null
}

interface CimProcess {
  ProcessId: number
  Name: string
  ExecutablePath: string | null
}

const POWERSHELL_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  'Get-CimInstance Win32_Process | Select-Object ProcessId,Name,ExecutablePath | ConvertTo-Json -Compress'
]

/**
 * Enumerates running processes on Windows via PowerShell CIM. Unlike `ps-list`
 * this also returns the full executable path, which the blocker needs to match
 * Steam games by their install directory.
 */
export function listProcesses(): Promise<RunningProcess[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      POWERSHELL_ARGS,
      { maxBuffer: 1024 * 1024 * 16, windowsHide: true },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(stdout) as CimProcess | CimProcess[]
          const list = Array.isArray(parsed) ? parsed : [parsed]
          resolve(
            list
              .filter((item) => item && typeof item.ProcessId === 'number')
              .map((item) => ({
                pid: item.ProcessId,
                name: (item.Name ?? '').toLowerCase(),
                execPath: item.ExecutablePath ? item.ExecutablePath.toLowerCase() : null
              }))
          )
        } catch {
          resolve([])
        }
      }
    )
  })
}

/** Force-terminates a process tree on Windows. */
export function killProcess(pid: number): Promise<void> {
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/F', '/T'], { windowsHide: true }, () => resolve())
  })
}
