import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SteamGameCandidate } from '@shared/types'
import { parseVdf, type VdfNode } from './vdf'

function isVdfNode(value: string | VdfNode | undefined): value is VdfNode {
  return typeof value === 'object' && value !== null
}

/** Reads Steam's install path from the Windows registry, with a default fallback. */
function findSteamRoot(): string | null {
  const candidates: string[] = []
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf8' }
    )
    const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/i)
    if (match) candidates.push(match[1].trim())
  } catch {
    // registry key missing or reg unavailable
  }
  candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam')
  return candidates.find((path) => existsSync(join(path, 'steamapps'))) ?? null
}

/** All Steam library roots declared in `libraryfolders.vdf` plus the main root. */
function findLibraryRoots(steamRoot: string): string[] {
  const roots = new Set<string>([steamRoot])
  const vdfPath = join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  if (!existsSync(vdfPath)) return [...roots]
  try {
    const parsed = parseVdf(readFileSync(vdfPath, 'utf8'))
    const folders = parsed.libraryfolders
    if (isVdfNode(folders)) {
      for (const entry of Object.values(folders)) {
        if (isVdfNode(entry) && typeof entry.path === 'string') {
          roots.add(entry.path)
        }
      }
    }
  } catch {
    // malformed file - fall back to main root only
  }
  return [...roots]
}

function readAppManifests(libraryRoot: string): SteamGameCandidate[] {
  const steamApps = join(libraryRoot, 'steamapps')
  if (!existsSync(steamApps)) return []
  const games: SteamGameCandidate[] = []
  for (const file of readdirSync(steamApps)) {
    if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue
    try {
      const parsed = parseVdf(readFileSync(join(steamApps, file), 'utf8'))
      const state = parsed.AppState
      if (!isVdfNode(state)) continue
      const appId = typeof state.appid === 'string' ? state.appid : ''
      const name = typeof state.name === 'string' ? state.name : ''
      const installdir = typeof state.installdir === 'string' ? state.installdir : ''
      if (!appId || !name || !installdir) continue
      const installDir = join(steamApps, 'common', installdir)
      games.push({ appId, name, installDir })
    } catch {
      // skip unreadable manifest
    }
  }
  return games
}

/** Scans all Steam libraries and returns installed games, ignoring runtime tools. */
export function scanSteamGames(): SteamGameCandidate[] {
  const steamRoot = findSteamRoot()
  if (!steamRoot) return []
  const ignoredAppIds = new Set(['228980']) // Steamworks Common Redistributables
  const games = new Map<string, SteamGameCandidate>()
  for (const libraryRoot of findLibraryRoots(steamRoot)) {
    for (const game of readAppManifests(libraryRoot)) {
      if (ignoredAppIds.has(game.appId)) continue
      games.set(game.installDir, game)
    }
  }
  return [...games.values()].sort((a, b) => a.name.localeCompare(b.name))
}
