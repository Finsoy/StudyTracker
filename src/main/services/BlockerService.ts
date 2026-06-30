import { sep } from 'node:path'
import type { BlockedGame } from '@shared/types'
import { gamesRepo } from '../db/database'
import { killProcess, listProcesses, type RunningProcess } from './ProcessMonitor'
import type { GoalService } from './GoalService'

const POLL_INTERVAL_MS = 2000

export interface BlockEvent {
  gameName: string
}

export class BlockerService {
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private onBlock: (event: BlockEvent) => void = () => {}

  constructor(private readonly goal: GoalService) {}

  setBlockHandler(handler: (event: BlockEvent) => void): void {
    this.onBlock = handler
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS)
    void this.tick()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      if (!this.goal.isBlockingActive()) return
      const games = gamesRepo.list().filter((game) => game.enabled)
      if (games.length === 0) return
      const processes = await listProcesses()
      for (const process of processes) {
        const matched = this.matchGame(process, games)
        if (matched) {
          await killProcess(process.pid)
          this.onBlock({ gameName: matched.displayName })
        }
      }
    } finally {
      this.polling = false
    }
  }

  private matchGame(process: RunningProcess, games: BlockedGame[]): BlockedGame | null {
    for (const game of games) {
      if (game.type === 'manual' && game.exeName) {
        if (process.name === game.exeName.toLowerCase()) return game
      }
      if (game.type === 'steam' && game.installDir && process.execPath) {
        const dir = game.installDir.toLowerCase()
        if (process.execPath.startsWith(dir + sep) || process.execPath.startsWith(dir + '/')) {
          return game
        }
      }
    }
    return null
  }
}
