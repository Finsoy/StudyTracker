/**
 * Returns the logical "day key" (YYYY-MM-DD) a timestamp belongs to, taking the
 * configurable reset hour into account. Times earlier than `resetHour` count
 * towards the previous calendar day, so a goal can roll over at e.g. 4am.
 */
export function dayKeyFor(timestampMs: number, resetHour: number): string {
  const shifted = new Date(timestampMs - resetHour * 60 * 60 * 1000)
  const year = shifted.getFullYear()
  const month = String(shifted.getMonth() + 1).padStart(2, '0')
  const day = String(shifted.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Whether the logical day key falls on Saturday or Sunday. */
export function isWeekendDayKey(dayKey: string): boolean {
  const [year, month, day] = dayKey.split('-').map(Number)
  const weekday = new Date(year, month - 1, day).getDay()
  return weekday === 0 || weekday === 6
}

/** Inclusive list of day keys for the last `count` days ending at `dayKey`. */
export function recentDayKeys(dayKey: string, count: number): string[] {
  const [year, month, day] = dayKey.split('-').map(Number)
  const base = new Date(year, month - 1, day)
  const keys: string[] = []
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(base)
    date.setDate(base.getDate() - offset)
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    keys.push(`${yyyy}-${mm}-${dd}`)
  }
  return keys
}

export function formatHms(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
