import type { TogglConnectionInfo, TogglProject, TogglStatus } from '@shared/types'
import { settingsRepo, togglTokenRepo } from '../db/database'
import { TogglClient } from './TogglClient'

/**
 * Mirrors local sessions into Toggl Track. StudyTracker is the source of truth:
 * Toggl calls run as background side effects and never block local tracking.
 */
export class TogglService {
  private currentEntryId: number | null = null
  private pendingStart: Promise<number | null> | null = null
  private lastError: string | null = null

  private getClient(): TogglClient | null {
    const token = togglTokenRepo.get()
    return token ? new TogglClient(token) : null
  }

  private requireClient(): TogglClient {
    const client = this.getClient()
    if (!client) throw new Error('Токен Toggl не задан')
    return client
  }

  getStatus(): TogglStatus {
    const settings = settingsRepo.get()
    return {
      enabled: settings.togglEnabled,
      connected: togglTokenRepo.hasToken() && settings.togglWorkspaceId !== null,
      lastError: this.lastError
    }
  }

  /**
   * Validates a token, persists it, and stores the default workspace so the
   * mirror can run without further setup.
   */
  async testAndSaveToken(token: string): Promise<TogglConnectionInfo> {
    const client = new TogglClient(token)
    const me = await client.getMe()
    let workspaceName: string
    try {
      workspaceName = (await client.getWorkspace(me.default_workspace_id)).name
    } catch {
      workspaceName = `Workspace ${me.default_workspace_id}`
    }
    togglTokenRepo.set(token)
    settingsRepo.update({ togglWorkspaceId: me.default_workspace_id })
    this.lastError = null
    return {
      email: me.email,
      fullName: me.fullname,
      workspaceId: me.default_workspace_id,
      workspaceName
    }
  }

  async getProjects(): Promise<TogglProject[]> {
    const workspaceId = settingsRepo.get().togglWorkspaceId
    if (workspaceId === null) return []
    return this.requireClient().listProjects(workspaceId)
  }

  async createProject(name: string): Promise<TogglProject> {
    const workspaceId = settingsRepo.get().togglWorkspaceId
    if (workspaceId === null) throw new Error('Не выбран воркспейс Toggl')
    return this.requireClient().createProject(workspaceId, name)
  }

  /** Fire-and-forget: starts a running entry in Toggl mirroring the local session. */
  mirrorStart(input: {
    description: string | null
    projectId: number | null
    tags: string[]
    startMs: number
  }): void {
    const settings = settingsRepo.get()
    const client = this.getClient()
    if (!settings.togglEnabled || settings.togglWorkspaceId === null || !client) return
    const workspaceId = settings.togglWorkspaceId

    this.pendingStart = client
      .startTimeEntry({
        workspaceId,
        description: input.description,
        projectId: input.projectId,
        tags: input.tags,
        startMs: input.startMs
      })
      .then((entry) => {
        this.currentEntryId = entry.id
        this.lastError = null
        return entry.id
      })
      .catch((error: unknown) => {
        this.currentEntryId = null
        this.lastError = error instanceof Error ? error.message : 'Ошибка Toggl'
        return null
      })
  }

  /** Fire-and-forget: stops the mirrored running entry, waiting for a pending start. */
  mirrorStop(): void {
    const settings = settingsRepo.get()
    const client = this.getClient()
    if (!settings.togglEnabled || settings.togglWorkspaceId === null || !client) {
      this.currentEntryId = null
      this.pendingStart = null
      return
    }
    const workspaceId = settings.togglWorkspaceId
    const pending = this.pendingStart ?? Promise.resolve(this.currentEntryId)

    void pending
      .then((entryId) => {
        if (entryId === null) return
        return client.stopTimeEntry(workspaceId, entryId).then(() => {
          this.lastError = null
        })
      })
      .catch((error: unknown) => {
        this.lastError = error instanceof Error ? error.message : 'Ошибка Toggl'
      })
      .finally(() => {
        this.currentEntryId = null
        this.pendingStart = null
      })
  }
}
