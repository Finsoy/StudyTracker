import type { TogglProject } from '@shared/types'

const API_BASE = 'https://api.track.toggl.com/api/v9'
const CREATED_WITH = 'StudyTracker'
const REQUEST_TIMEOUT_MS = 15000

export class TogglAuthError extends Error {
  constructor(message = 'Неверный токен Toggl') {
    super(message)
    this.name = 'TogglAuthError'
  }
}

export interface TogglMe {
  id: number
  email: string
  fullname: string
  default_workspace_id: number
}

export interface TogglWorkspace {
  id: number
  name: string
}

export interface TogglTimeEntry {
  id: number
  workspace_id: number
  description: string | null
  project_id: number | null
  start: string
  stop: string | null
  duration: number
  tags: string[] | null
}

/** Thin wrapper around the Toggl Track API v9 using Basic auth with an API token. */
export class TogglClient {
  private readonly authHeader: string

  constructor(apiToken: string) {
    const encoded = Buffer.from(`${apiToken}:api_token`).toString('base64')
    this.authHeader = `Basic ${encoded}`
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader,
          ...init?.headers
        }
      })
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === 'AbortError'
          ? 'Toggl не ответил вовремя'
          : 'Нет соединения с Toggl',
        { cause: error }
      )
    } finally {
      clearTimeout(timeout)
    }

    if (response.status === 403 || response.status === 401) {
      throw new TogglAuthError()
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Toggl вернул ${response.status}: ${body.slice(0, 200)}`)
    }

    if (response.status === 204) return undefined as T
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  async getMe(): Promise<TogglMe> {
    return this.request<TogglMe>('/me')
  }

  async getWorkspace(workspaceId: number): Promise<TogglWorkspace> {
    return this.request<TogglWorkspace>(`/workspaces/${workspaceId}`)
  }

  async listProjects(workspaceId: number): Promise<TogglProject[]> {
    const data = await this.request<TogglProject[] | { items: TogglProject[] } | null>(
      `/workspaces/${workspaceId}/projects?active=true`
    )
    if (Array.isArray(data)) return data
    return data?.items ?? []
  }

  async createProject(workspaceId: number, name: string): Promise<TogglProject> {
    return this.request<TogglProject>(`/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name, active: true })
    })
  }

  /** Starts a running time entry (duration -1) and returns it. */
  async startTimeEntry(input: {
    workspaceId: number
    description: string | null
    projectId: number | null
    tags: string[]
    startMs: number
  }): Promise<TogglTimeEntry> {
    return this.request<TogglTimeEntry>(`/workspaces/${input.workspaceId}/time_entries`, {
      method: 'POST',
      body: JSON.stringify({
        created_with: CREATED_WITH,
        workspace_id: input.workspaceId,
        description: input.description ?? '',
        project_id: input.projectId,
        tags: input.tags,
        duration: -1,
        start: new Date(input.startMs).toISOString()
      })
    })
  }

  async stopTimeEntry(workspaceId: number, entryId: number): Promise<TogglTimeEntry> {
    return this.request<TogglTimeEntry>(
      `/workspaces/${workspaceId}/time_entries/${entryId}/stop`,
      { method: 'PATCH' }
    )
  }
}
