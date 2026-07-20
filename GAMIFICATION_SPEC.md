# StudyTracker — спецификация геймификации

> Документ-задание для модели-исполнителя (Grok 4.5 / GLM 5.2).
> Цель: встроить геймификацию (стрик, уровни/XP, сезоны, ачивки) в существующее
> desktop-приложение StudyTracker так, чтобы это усиливало мотивацию, а не
> превращалось в отдельный проект. Пиши в стиле существующего кода.

---

## 0. Как читать этот документ

Это не готовый код, а подробный план с псевдокодом и точками интеграции.
Ты (модель-исполнитель) должна:

1. Сначала **прочитать реальные файлы** (список ниже), чтобы повторить конвенции.
2. Реализовывать **фазами**: сперва Фаза 1 (стрик + уровень), убедиться что
   `npm run typecheck` и `npm run build` проходят, потом Фаза 2 (сезоны + ачивки).
3. Не переусложнять. Источник правды для всех метрик — таблица `sessions`.
   Не дублируй данные в счётчиках, которые могут разойтись с реальностью.
4. Все пользовательские строки — на русском (как в текущем UI). Код и комментарии —
   на английском, как в проекте. Комментарии — только про неочевидное «почему».

### Файлы, которые надо прочитать перед началом

- `src/shared/types.ts` — доменные типы.
- `src/shared/ipc.ts` — константы каналов IPC, `StudyTrackerApi`, payload'ы событий.
- `src/shared/time.ts` — `dayKeyFor`, `isWeekendDayKey`, `recentDayKeys`, `formatHms`.
- `src/main/db/database.ts` — инициализация SQLite, репозитории, паттерн settings.
- `src/main/services/TrackerService.ts` — учёт времени, `accumulatedTodaySec`.
- `src/main/services/GoalService.ts` — расчёт цели/статуса дня, `getDayStats`.
- `src/main/ipc.ts` — регистрация `ipcMain.handle`.
- `src/preload/index.ts` — проброс API в renderer через `contextBridge`.
- `src/main/index.ts` — wiring сервисов, `startTick()` (тик раз в секунду).
- `src/renderer/src/App.tsx` — подписка на `onTick`, состояние `goal`/`state`.
- `src/renderer/src/components/Sidebar.tsx` — навигация + карточка статуса блокировки.
- `src/renderer/src/pages/DashboardPage.tsx` — карточки статистики + график недели.

### Команды проверки (запускать после каждой фазы)

```bash
npm run typecheck   # tsc для node + web
npm run lint        # eslint
npm run build       # electron-vite build (должен пройти без ошибок)
```

---

## 1. Что именно строим (психология важнее фич)

Пользователю заходит механика «прогресс-бар хочется закрыть» и его прошлый опыт
прокачки в игре (растущий уровень, стрик закрытий, сезоны). Переносим ровно это:

| Механика | Игровой аналог | Что считаем |
|---|---|---|
| **Стрик** | серия закрытий без пропуска | дни подряд с осмысленным временем |
| **Уровень / XP** | ilvl, прокачка | суммарное время за всё время (только растёт) |
| **Сезон** | сезон в игре | 4–6-недельный блок с целью и итогом |
| **Ачивки** | достижения | разовые вехи (стрик N, X часов суммарно, сезон закрыт) |

Принципы (заложить в реализацию и в тексты UI):

- **«Не рвать цепь».** Стрик — главная механика. День засчитывается при небольшом
  пороге (по умолчанию 30 мин), а не при полном дневном гоале — чтобы плохой день
  не обнулял мотивацию. Порог настраивается отдельно от дневной цели.
- **XP только растёт и никогда не сбрасывается** — даже провальная неделя добавляет
  очки. Это снимает чувство «всё потеряно».
- **Сезоны дают чистый старт** без обнуления общего прогресса.
- Никакого дневного сна для метрик — «день» определяется `resetHour` (уже есть).

---

## 2. Модель данных

### 2.1. Новые настройки (в существующий `settings` key/value + `AppSettings`)

В `src/shared/types.ts` расширить `AppSettings`:

```ts
export interface AppSettings {
  // ...существующие поля...
  streakMinSec: number      // порог «зачётного» дня для стрика. default: 30*60
  gamificationEnabled: boolean // общий выключатель. default: true
}
```

В `src/main/db/database.ts` в `DEFAULT_SETTINGS` добавить:

```ts
streakMinSec: 30 * 60,
gamificationEnabled: true,
```

и в `settingsRepo.get()` дочитать их через существующие `numberOr` / `boolOr`.

> Порог стрика намеренно НЕ равен дневной цели (`goalWeekdaySec`). Дневная цель
> разблокирует игры; стрик защищает мотивацию и должен быть легче.

### 2.2. Новые таблицы SQLite (в `initDatabase()`)

```sql
-- Сезоны: 4-6-недельные блоки с целью по времени.
CREATE TABLE IF NOT EXISTS seasons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  startDayKey TEXT NOT NULL,        -- 'YYYY-MM-DD' (логический день)
  endDayKey   TEXT NOT NULL,        -- включительно
  goalSec     INTEGER NOT NULL,     -- цель по суммарному времени за сезон
  status      TEXT NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'archived'
  createdAt   INTEGER NOT NULL
);

-- Разблокированные ачивки. Ключ = стабильный id определения ачивки из кода.
-- Храним ТОЛЬКО факт+время разблокировки; сами определения живут в коде.
CREATE TABLE IF NOT EXISTS milestone_unlocks (
  id         TEXT PRIMARY KEY,      -- напр. 'streak_7', 'hours_100'
  achievedAt INTEGER NOT NULL
);
```

> Уровень/XP и текущий стрик НЕ храним в БД — считаем на лету из `sessions`.
> Это исключает рассинхрон. Данных мало (одна машина, один пользователь),
> полные сканы дёшевы.

### 2.3. Что добавить в репозитории (`database.ts`)

В `sessionsRepo` добавить методы агрегации:

```ts
// Суммарное время за всё время (для XP/уровня).
totalSecAllTime(): number {
  const row = db.prepare('SELECT COALESCE(SUM(durationSec),0) AS total FROM sessions')
               .get() as { total: number }
  return row.total
}

// Карта dayKey -> суммарные секунды (для стрика и активных дней сезона).
// Возвращаем только дни с ненулевым временем.
dailyTotals(): Map<string, number> {
  const rows = db.prepare(
    `SELECT dayKey, SUM(durationSec) AS total
     FROM sessions GROUP BY dayKey HAVING total > 0`
  ).all() as { dayKey: string; total: number }[]
  return new Map(rows.map(r => [r.dayKey, r.total]))
}

// Сумма за диапазон логических дней (для прогресса сезона). Границы включительно.
sumForRange(startDayKey: string, endDayKey: string): number {
  const row = db.prepare(
    `SELECT COALESCE(SUM(durationSec),0) AS total
     FROM sessions WHERE dayKey >= ? AND dayKey <= ?`
  ).get(startDayKey, endDayKey) as { total: number }
  return row.total
}
```

Добавить новый репозиторий `seasonsRepo` (list/getActive/insert/update-status) и
`milestonesRepo` (listUnlocked/unlock) по образцу существующих (`gamesRepo`).
Пример на сезоны:

```ts
export const seasonsRepo = {
  getActive(): Season | null { /* SELECT * WHERE status='active' ORDER BY id DESC LIMIT 1 */ },
  list(): Season[] { /* SELECT * ORDER BY id DESC */ },
  insert(s: { name; startDayKey; endDayKey; goalSec; createdAt }): Season { /* ... */ },
  setStatus(id: number, status: SeasonStatus): void { /* UPDATE ... */ }
}

export const milestonesRepo = {
  listUnlocked(): Map<string, number> { /* id -> achievedAt */ },
  unlock(id: string, achievedAt: number): void {
    db.prepare('INSERT OR IGNORE INTO milestone_unlocks (id, achievedAt) VALUES (?, ?)')
      .run(id, achievedAt)
  }
}
```

---

## 3. Общие типы (`src/shared/types.ts`)

```ts
export type SeasonStatus = 'active' | 'completed' | 'archived'

export interface Season {
  id: number
  name: string
  startDayKey: string
  endDayKey: string
  goalSec: number
  status: SeasonStatus
  createdAt: number
}

export interface StreakInfo {
  current: number       // длина текущего стрика (в днях)
  best: number          // рекорд за всё время
  minSec: number        // порог зачётного дня
  todayQualified: boolean // сегодня уже набрано >= minSec
  aliveToday: boolean   // стрик ещё не порван (можно спасти сегодня)
}

export interface LevelInfo {
  level: number
  title: string         // текстовый ранг (см. §4.3)
  totalSec: number      // весь накопленный XP (в секундах)
  levelStartSec: number // порог начала текущего уровня
  nextLevelSec: number  // порог следующего уровня
  progress: number      // 0..1 внутри текущего уровня (для прогресс-бара)
}

export interface SeasonProgress {
  season: Season
  accumulatedSec: number
  goalSec: number
  progress: number      // 0..1
  daysTotal: number
  daysElapsed: number
  daysLeft: number
  activeDays: number    // сколько дней внутри сезона были зачётными
}

export type MilestoneKind = 'streak' | 'totalHours' | 'season'

export interface MilestoneStatus {
  id: string            // стабильный id, совпадает с ключом в milestone_unlocks
  kind: MilestoneKind
  label: string         // напр. «Стрик 7 дней»
  hint: string          // что нужно сделать
  achieved: boolean
  achievedAt: number | null
}

export interface GamificationSnapshot {
  enabled: boolean
  streak: StreakInfo
  level: LevelInfo
  season: SeasonProgress | null
  milestones: MilestoneStatus[]
}
```

---

## 4. Бэкенд: `GamificationService`

Новый файл `src/main/services/GamificationService.ts`. Зависит от `TrackerService`
(чтобы учитывать live-время текущей сессии в «сегодня») и репозиториев из `database.ts`.

```ts
export class GamificationService {
  constructor(private readonly tracker: TrackerService) {}

  getSnapshot(): GamificationSnapshot { /* см. ниже */ }
  // Проверяет и фиксирует новые ачивки. Возвращает список ТОЛЬКО что разблокированных.
  checkNewMilestones(): MilestoneStatus[] { /* см. §4.4 */ }

  createSeason(input: { name?: string; weeks?: number; goalHours?: number }): Season { /* §4.5 */ }
  completeActiveSeason(): void { /* status -> 'completed' */ }
}
```

### 4.1. Хелперы дат — добавить в `src/shared/time.ts`

Понадобится сдвиг ключа дня на N дней. Добавить:

```ts
/** Сдвигает логический dayKey на deltaDays (может быть отрицательным). */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + deltaDays)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Кол-во логических дней между двумя dayKey включительно (start<=end). */
export function daysBetweenInclusive(startDayKey: string, endDayKey: string): number {
  const [ys, ms, ds] = startDayKey.split('-').map(Number)
  const [ye, me, de] = endDayKey.split('-').map(Number)
  const start = new Date(ys, ms - 1, ds).getTime()
  const end = new Date(ye, me - 1, de).getTime()
  return Math.round((end - start) / 86_400_000) + 1
}
```

### 4.2. Стрик — псевдокод

Определение: «зачётный день» = суммарное время за логический день `>= streakMinSec`.
Для СЕГОДНЯ учитываем и живую активную сессию (чтобы бейдж «загорался» в реальном
времени). Стрик «жив», пока не пропущен ни один день; сегодня ещё можно спасти.

```
function computeStreak(minSec):
  resetHour = settings.resetHour
  todayKey  = dayKeyFor(now, resetHour)
  totals    = sessionsRepo.dailyTotals()          // Map<dayKey, sec>

  // Live-добор для сегодняшнего дня (активная сессия ещё не в БД).
  todaySec = (totals.get(todayKey) ?? 0)
  if tracker.active belongs to todayKey:
      todaySec = tracker.accumulatedTodaySec()     // уже включает persisted+live
  todayQualified = todaySec >= minSec

  // qualified(key): зачётный ли день
  qualified(key) =
      key == todayKey ? todayQualified : (totals.get(key) ?? 0) >= minSec

  // Текущий стрик: считаем назад начиная с сегодня, а если сегодня ещё не зачтён —
  // с вчера (стрик пока «жив», пользователь может добить сегодня).
  cursor = todayQualified ? todayKey : shiftDayKey(todayKey, -1)
  current = 0
  while qualified(cursor):
      current += 1
      cursor = shiftDayKey(cursor, -1)

  aliveToday = todayQualified OR qualified(shiftDayKey(todayKey, -1))
  // aliveToday=false означает: и сегодня пусто, и вчера пусто -> цепь уже порвана.

  best = longestRun(totals, minSec)   // см. ниже
  return { current, best, minSec, todayQualified, aliveToday }
```

Рекорд (лучший стрик) — один проход по отсортированным зачётным дням:

```
function longestRun(totals, minSec):
  keys = sort( [k for k,v in totals if v >= minSec] )   // по возрастанию даты
  best = 0; run = 0; prev = null
  for key in keys:
      if prev != null AND key == shiftDayKey(prev, +1): run += 1
      else: run = 1
      best = max(best, run)
      prev = key
  return best
```

### 4.3. Уровень / XP — псевдокод

XP = суммарные секунды (`sessionsRepo.totalSecAllTime()`). Кривая уровней —
мягко растущая, чтобы первые уровни давались быстро (быстрая петля награды),
дальше медленнее. Формула через часы:

```
// Часы, необходимые, чтобы ЗАКОНЧИТЬ уровень n (n>=1). Кумулятивный порог входа
// в уровень n = sum_{i<n} hoursToClear(i). Простая возрастающая кривая:
hoursToClear(n) = 2 + (n - 1)        // L1: 2ч, L2: 3ч, L3: 4ч, ...

function computeLevel(totalSec):
  totalHours = totalSec / 3600
  level = 1
  clearedHours = 0
  loop:
      need = hoursToClear(level)
      if totalHours >= clearedHours + need:
          clearedHours += need
          level += 1
      else: break
  levelStartSec = clearedHours * 3600
  nextLevelSec  = (clearedHours + hoursToClear(level)) * 3600
  progress = (totalSec - levelStartSec) / (nextLevelSec - levelStartSec)
  return { level, title: titleFor(level), totalSec, levelStartSec, nextLevelSec, progress }
```

Ранги (`titleFor`) — конфиг-массив, показываем текстовый титул рядом с уровнем:

```
const TITLES = [
  { minLevel: 1,  title: 'Новичок' },
  { minLevel: 5,  title: 'Ученик' },
  { minLevel: 10, title: 'Практик' },
  { minLevel: 20, title: 'Профи' },
  { minLevel: 35, title: 'Мастер' },
  { minLevel: 50, title: 'Гуру' },
]
// titleFor(level) = title у наибольшего minLevel <= level
```

> Кривая и титулы — легко настраиваемые константы. Держи их в одном месте вверху
> `GamificationService.ts`, чтобы пользователь мог быстро подкрутить.

### 4.4. Ачивки — определения в коде + разблокировка

Определения — статический массив в `GamificationService.ts`. Состояние `achieved`
считается из текущих метрик; факт разблокировки фиксируется в `milestone_unlocks`
(для timestamp и разового «салюта»).

```
const MILESTONE_DEFS: { id; kind; threshold; label; hint }[] = [
  { id:'streak_3',   kind:'streak',     threshold:3,   label:'Стрик 3 дня',    hint:'3 зачётных дня подряд' },
  { id:'streak_7',   kind:'streak',     threshold:7,   label:'Неделя без пропусков', hint:'7 дней подряд' },
  { id:'streak_30',  kind:'streak',     threshold:30,  label:'Стрик 30 дней',  hint:'30 дней подряд' },
  { id:'hours_10',   kind:'totalHours', threshold:10,  label:'10 часов',       hint:'10 часов суммарно' },
  { id:'hours_50',   kind:'totalHours', threshold:50,  label:'50 часов',       hint:'50 часов суммарно' },
  { id:'hours_100',  kind:'totalHours', threshold:100, label:'100 часов',      hint:'100 часов суммарно' },
  { id:'season_1',   kind:'season',     threshold:1,   label:'Сезон закрыт',   hint:'Выполни цель сезона' },
]

function achievedNow(def, streak, level, season):
  switch def.kind:
    'streak':     return streak.best >= def.threshold
    'totalHours': return level.totalSec >= def.threshold * 3600
    'season':     return season != null AND season.accumulatedSec >= season.goalSec

function checkNewMilestones():
  unlocked = milestonesRepo.listUnlocked()   // Map<id, achievedAt>
  streak = computeStreak(...); level = computeLevel(...); season = getSeasonProgress()
  newly = []
  for def in MILESTONE_DEFS:
      if achievedNow(def, streak, level, season) AND !unlocked.has(def.id):
          milestonesRepo.unlock(def.id, now)
          newly.push(statusOf(def, achieved=true, achievedAt=now))
  return newly
```

`getSnapshot()` собирает всё вместе и строит `milestones: MilestoneStatus[]`
(achieved/achievedAt из `milestonesRepo.listUnlocked()` + вычисленный `achievedNow`
для тех, что ещё не зафиксированы, — чтобы UI мог показать «вот-вот»).

### 4.5. Сезоны — псевдокод

```
function createSeason({ name, weeks=4, goalHours }):
  resetHour = settings.resetHour
  startKey  = dayKeyFor(now, resetHour)
  endKey    = shiftDayKey(startKey, weeks*7 - 1)
  // Дефолт цели: прошлое среднее * длительность, но не задирать. Простой дефолт:
  goalSec   = (goalHours ?? weeks * 7 * 1.5) * 3600   // ~1.5ч/день по умолчанию
  // Автозакрытие предыдущего активного сезона.
  if seasonsRepo.getActive(): seasonsRepo.setStatus(active.id, 'archived')
  return seasonsRepo.insert({ name: name ?? defaultName(startKey), startKey, endKey, goalSec, createdAt: now })

function getSeasonProgress():
  s = seasonsRepo.getActive()
  if !s: return null
  todayKey = dayKeyFor(now, resetHour)
  accumulatedSec = sessionsRepo.sumForRange(s.startDayKey, s.endDayKey)
  daysTotal   = daysBetweenInclusive(s.startDayKey, s.endDayKey)
  daysElapsed = clamp(daysBetweenInclusive(s.startDayKey, min(todayKey, s.endDayKey)), 0, daysTotal)
  daysLeft    = max(0, daysTotal - daysElapsed)
  activeDays  = count(dayKeys in [start..min(today,end)] where totals[day] >= streakMinSec)
  progress    = clamp(accumulatedSec / s.goalSec, 0, 1)
  return { season:s, accumulatedSec, goalSec:s.goalSec, progress, daysTotal, daysElapsed, daysLeft, activeDays }
```

> Автозавершение сезона по дате не обязательно делать по таймеру. Достаточно при
> `getSnapshot()`: если активный сезон и `todayKey > endDayKey` — перевести в
> `completed` (и, если цель достигнута, `season_1` разблокируется через ачивки).

---

## 5. IPC (проброс в renderer)

### 5.1. `src/shared/ipc.ts`

Добавить каналы в объект `IPC`:

```ts
gamificationGet: 'gamification:get',
seasonCreate: 'season:create',
seasonComplete: 'season:complete',
eventMilestone: 'event:milestone',   // push новой ачивки в UI
```

Расширить `TickPayload` лёгким полем стрика (чтобы бейдж в сайдбаре обновлялся
без отдельного поллинга), но НЕ класть в тик весь снапшот (дорого каждую секунду):

```ts
export interface TickPayload {
  state: TrackerState
  goal: GoalStatus
  streakCurrent: number   // дешёвое число для бейджа в Sidebar
}

export interface MilestonePayload { milestone: MilestoneStatus }
```

Расширить `StudyTrackerApi`:

```ts
gamification: {
  get(): Promise<GamificationSnapshot>
  createSeason(input: { name?: string; weeks?: number; goalHours?: number }): Promise<Season>
  completeSeason(): Promise<void>
}
events: {
  onTick(...) // существует
  onBlocked(...) // существует
  onMilestone(handler: (p: MilestonePayload) => void): () => void
}
```

### 5.2. `src/main/ipc.ts`

Добавить сервис в `IpcServices` и хендлеры:

```ts
ipcMain.handle(IPC.gamificationGet, () => gamification.getSnapshot())
ipcMain.handle(IPC.seasonCreate, (_e, input) => gamification.createSeason(input))
ipcMain.handle(IPC.seasonComplete, () => gamification.completeActiveSeason())
```

### 5.3. `src/preload/index.ts`

Пробросить по образцу существующих секций (`stats`, `events`):

```ts
gamification: {
  get: () => ipcRenderer.invoke(IPC.gamificationGet),
  createSeason: (input) => ipcRenderer.invoke(IPC.seasonCreate, input),
  completeSeason: () => ipcRenderer.invoke(IPC.seasonComplete),
},
// в events добавить:
onMilestone: (handler) => {
  const listener = (_e, payload) => handler(payload)
  ipcRenderer.on(IPC.eventMilestone, listener)
  return () => ipcRenderer.removeListener(IPC.eventMilestone, listener)
}
```

### 5.4. `src/main/index.ts` (wiring + события)

```ts
const gamification = new GamificationService(tracker)
// ...
registerIpc({ tracker, goal, toggl, gamification })

// В startTick(): добавить streakCurrent в payload (дёшево, но если хочется —
// пересчитывай стрик не каждую секунду, а раз в ~15с и кэшируй число).
mainWindow.webContents.send(IPC.eventTick, {
  state: tracker.getState(),
  goal: goal.getStatus(),
  streakCurrent: gamification.getSnapshot().streak.current // или кэш
})

// Проверять ачивки при остановке сессии — там появляется новое время.
// Вариант А (проще): после tracker.stop() в IPC-хендлере trackerStop вызвать
//   gamification.checkNewMilestones() и, для каждой новой, послать eventMilestone.
// Реализуй в main/ipc.ts, т.к. там есть доступ и к tracker, и к gamification,
// и к отправке в окно (получить окно через BrowserWindow.fromWebContents(event.sender)).
```

> Важно: `trackerStop` сейчас возвращает `TrackerState`. Не меняй сигнатуру —
> просто после `tracker.stop()` дополнительно дерни проверку ачивок и пуш события.

---

## 6. Renderer (UI)

Стиль: Tailwind, тёмная тема, карточки `rounded-2xl border border-white/5 bg-[#0d1220]`
(как в `DashboardPage`/`StatCard`). Переиспользуй визуальный язык.

### Фаза 1 (минимум, максимальный эффект)

1. **Бейдж стрика в `Sidebar.tsx`.** Рядом с логотипом или в нижней карточке —
   «🔥 N» (current streak). Данные — из `goal`-тика: прими новый проп `streakCurrent`
   (App прокидывает из `TickPayload`). Если `aliveToday=false` и `current=0` —
   показывать тускло/серым как призыв «начни цепь».

2. **Две карточки на дашборде** (`DashboardPage`, в существующий grid `StatCard`):
   - «Стрик» → `${streak.current} дн.` (accent — оранжевый), подпись рекорда.
   - «Уровень» → `Ур. ${level.level} · ${level.title}` + маленький прогресс-бар
     `level.progress` под числом (тот самый «бар, который хочется закрыть»).
   Данные тянуть новым вызовом `window.api.gamification.get()` в `useEffect` с
   поллингом раз в 5с (как уже сделано для `stats.getDays`).

3. **Тост на новую ачивку.** В `App.tsx` подписаться на `events.onMilestone` и
   показать `addToast('Ачивка: ' + milestone.label, 'success')` (ToastProvider уже есть).

После Фазы 1: `npm run typecheck && npm run build`. Убедиться, что тик с новым
полем `streakCurrent` типобезопасен во всех местах создания `TickPayload`.

### Фаза 2 (отдельная страница)

4. **Новая вкладка «Прогресс».** В `Sidebar.tsx`:
   - расширить `TabKey`: `'dashboard' | 'session' | 'games' | 'settings' | 'progress'`;
   - добавить в `NAV_ITEMS` пункт `{ key:'progress', label:'Прогресс', icon:'★' }`;
   - в `App.tsx` отрендерить `{tab === 'progress' && <ProgressPage />}`.

5. **`src/renderer/src/pages/ProgressPage.tsx`** — грузит `gamification.get()` (поллинг 5с):
   - **Блок «Уровень»**: крупный номер уровня, титул, широкий прогресс-бар
     `level.progress`, подписи `formatHms(level.totalSec)` всего и сколько до
     след. уровня (`nextLevelSec - totalSec`).
   - **Блок «Стрик»**: текущий/рекорд, статус `aliveToday` («цепь жива, добей
     сегодня» / «цепь порвана — начни заново»). Опционально — мини-полоска
     последних 14 дней (зелёный/серый) из `stats.getDays('last30')` обрезанной.
   - **Блок «Сезон»**: если `season != null` — имя, прогресс-бар `season.progress`,
     `daysLeft`, `activeDays`, кнопка «Завершить сезон». Если `null` — кнопка
     «Начать сезон» (вызывает `createSeason({ weeks:4 })`; можно дать выбрать 4/6
     недель и цель в часах).
   - **Сетка ачивок**: карточки из `snapshot.milestones`; разблокированные —
     яркие с датой (`achievedAt`), остальные — тусклые с `hint`.

6. **Настройки (`SettingsPage.tsx`)** — по желанию: поле «Порог зачётного дня для
   стрика» (`streakMinSec`, минуты) и тумблер `gamificationEnabled`, через
   существующий `settings.update`.

---

## 7. Как добавлять новые метрики потом (расширяемость)

Держи систему из ДВУХ типов сущностей — не заводи третий:

- **Ежедневная привычка** (встал вовремя, поел без сериала и т.п.) → механика
  стрика. Технически это отдельный «зачётный признак дня». Если понадобится —
  обобщи `computeStreak` до `computeStreak(qualifyFn)` и заведи несколько стриков,
  но только когда реально нужно. Пока — один стрик по времени.
- **Накопительное усилие** (часы, решённые задачи) → XP/счётчик. Новый счётчик =
  ещё одно `SUM(...)` по `sessions` (или по новой таблице событий) + запись в
  `LevelInfo`-подобную структуру.

Новая ачивка = одна строка в `MILESTONE_DEFS` (id стабильный, чтобы разблокировки
не потерялись). Новый ранг = одна строка в `TITLES`. Никаких миграций для этого не
нужно.

---

## 8. Крайние случаи и на что обратить внимание

- **Live-сессия и «сегодня».** Для сегодняшнего дня в стрике и XP учитывай
  `tracker.accumulatedTodaySec()`, иначе прогресс не будет «живым» до `stop()`.
  XP «всего» из `sessions` не включает активную сессию — можно прибавлять
  `tracker.activeElapsedSec()` для отображения, если хочешь плавности.
- **`resetHour`.** Все границы дней — через `dayKeyFor`/`shiftDayKey`, НЕ через
  сырые календарные даты. Ночная работа до 3–4 утра должна падать в правильный день.
- **Часовые пояса / переход через полночь при закрытом приложении.** Всё считается
  из `sessions.dayKey`, который проставлен на момент старта сессии, — пересчёт при
  каждом `getSnapshot()` корректен без фоновых таймеров.
- **Стоимость тика.** Не считай полный снапшот каждую секунду. В тик клади только
  `streakCurrent`; полный `getSnapshot()` — по запросу/поллингу раз в 5с.
- **Идемпотентность ачивок.** `milestone_unlocks` PRIMARY KEY по id + `INSERT OR
  IGNORE` — повторная разблокировка невозможна, тост не задваивается.
- **Пустая БД / первый запуск.** `dailyTotals()` пустой → стрик 0, уровень 1,
  сезон null, ачивки все закрыты. Проверить, что UI не падает на нулях.
- **Ретро-правки времени.** Метрики вычисляемые, поэтому любая правка `sessions`
  автоматически отражается — отдельная синхронизация не нужна.

---

## 9. Чек-лист приёмки

Фаза 1:
- [ ] `AppSettings` расширен (`streakMinSec`, `gamificationEnabled`), дефолты в БД.
- [ ] `sessionsRepo`: `totalSecAllTime`, `dailyTotals`, `sumForRange`.
- [ ] `shared/time.ts`: `shiftDayKey`, `daysBetweenInclusive`.
- [ ] `GamificationService.getSnapshot()` возвращает корректные streak+level на
      реальных данных (проверить руками на существующей БД).
- [ ] IPC `gamification:get` + проброс в preload + типы в `StudyTrackerApi`.
- [ ] `TickPayload.streakCurrent` заполняется во всех местах отправки тика.
- [ ] Sidebar: бейдж стрика. Dashboard: карточки «Стрик» и «Уровень» с прогресс-баром.
- [ ] `npm run typecheck && npm run lint && npm run build` — зелёные.

Фаза 2:
- [ ] Таблицы `seasons`, `milestone_unlocks` создаются в `initDatabase()`.
- [ ] `seasonsRepo`, `milestonesRepo`, методы сезонов/ачивок в сервисе.
- [ ] IPC для сезонов + событие `event:milestone` + тост в `App.tsx`.
- [ ] Вкладка «Прогресс» с блоками уровень/стрик/сезон/ачивки.
- [ ] Создание и завершение сезона работают; ачивка `season_1` выдаётся при цели.
- [ ] Повторная проверка `typecheck/lint/build`.

---

## 10. Границы задачи (чего НЕ делать)

- Не переписывать существующую логику трекинга/блокировки/Toggl.
- Не менять сигнатуры существующих IPC (только добавлять новые).
- Не вводить внешние зависимости ради геймификации (хватит текущего стека:
  better-sqlite3 + React + Tailwind; для конфетти/анимаций — не тянуть библиотеки,
  максимум CSS).
- Не хранить вычислимые метрики (стрик, XP, уровень) в БД — считать из `sessions`.
- Не делать сложную RPG: две механики (стрик + уровень) — ядро, сезоны и ачивки —
  надстройка. Всё остальное — потом.
```
