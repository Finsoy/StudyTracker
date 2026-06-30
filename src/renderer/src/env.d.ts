/// <reference types="vite/client" />
import type { StudyTrackerApi } from '@shared/ipc'

declare global {
  interface Window {
    api: StudyTrackerApi
  }
}

export {}
