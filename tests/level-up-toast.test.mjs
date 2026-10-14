import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers'
import { test } from 'node:test'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import typescript from 'typescript'

const appSource = typescript.transpileModule(
  readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
      jsx: typescript.JsxEmit.ReactJSX
    }
  }
).outputText

const flush = () => new Promise(setImmediate)

function createFixture(store = { lastSeenLevel: 4 }, currentLevel = 5) {
  const state = {
    currentLevel,
    isEnabled: true,
    isVisible: true,
    isFocused: true,
    pendingSnapshot: null,
    shouldFailSave: false,
    shouldFailRead: false
  }
  const toasts = []
  const errors = []
  const timers = new Set()
  const windowEvents = new EventEmitter()
  const documentEvents = new EventEmitter()
  const effects = []
  let cleanups = []
  const exports = {}
  const snapshot = () => ({
    enabled: state.isEnabled,
    level: { level: state.currentLevel, title: state.currentLevel >= 5 ? 'Ученик' : 'Новичок' },
    streak: { current: 0 }
  })
  const createElement = (type, props) => ({ type, props })
  runInNewContext(appSource, {
    exports,
    require: (specifier) => {
      if (specifier === 'react')
        return {
          useState: (value) => [value, () => {}],
          useEffect: (setup) => effects.push(setup)
        }
      if (specifier === 'react/jsx-runtime') return { jsx: createElement, jsxs: createElement }
      if (specifier === './components/toast')
        return {
          useToast: () => ({ addToast: (message, kind) => toasts.push({ message, kind }) })
        }
      return {}
    },
    console: { error: (...values) => errors.push(values) },
    setInterval: (callback) => {
      timers.add(callback)
      return callback
    },
    clearInterval: (callback) => timers.delete(callback),
    document: {
      get visibilityState() {
        return state.isVisible ? 'visible' : 'hidden'
      },
      hasFocus: () => state.isFocused,
      addEventListener: (event, handler) => documentEvents.on(event, handler),
      removeEventListener: (event, handler) => documentEvents.off(event, handler)
    },
    window: {
      addEventListener: (event, handler) => windowEvents.on(event, handler),
      removeEventListener: (event, handler) => windowEvents.off(event, handler),
      api: {
        tracker: { getState: async () => ({ active: null, todayTotalSec: 0 }) },
        stats: { getGoal: async () => ({}) },
        events: {
          onTick: () => () => {},
          onBlocked: () => () => {},
          onMilestone: () => () => {}
        },
        gamification: {
          get: async () => {
            if (state.shouldFailRead) throw new Error('Read failed')
            return state.pendingSnapshot ?? snapshot()
          }
        },
        settings: {
          get: async () => ({ ...store }),
          update: async (patch) => {
            if (state.shouldFailSave) throw new Error('Save failed')
            Object.assign(store, patch)
            return { ...store }
          }
        }
      }
    }
  })
  return {
    state,
    store,
    toasts,
    errors,
    timers,
    windowEvents,
    documentEvents,
    snapshot,
    mount() {
      effects.length = 0
      exports.default().props.children.type()
      cleanups = effects.map((setup) => setup())
    },
    unmount() {
      cleanups.forEach((cleanup) => cleanup?.())
    },
    tick: () => Promise.all([...timers].map((callback) => callback()))
  }
}

test('first launch records the existing level without celebrating old progress', async () => {
  const fixture = createFixture({ lastSeenLevel: null }, 8)
  fixture.mount()
  await flush()
  assert.equal(fixture.store.lastSeenLevel, 8)
  assert.equal(fixture.toasts.length, 0)
  fixture.state.currentLevel = 9
  await fixture.tick()
  assert.equal(fixture.toasts.length, 1)
  assert.equal(fixture.store.lastSeenLevel, 9)
})

test('celebrates once and preserves the acknowledgement across restart', async () => {
  const fixture = createFixture()
  fixture.mount()
  await flush()
  assert.deepEqual(fixture.toasts, [
    {
      message: 'Ура! Новый уровень 5 — Ученик. Отличная работа!',
      kind: 'success'
    }
  ])
  fixture.windowEvents.emit('focus')
  fixture.documentEvents.emit('visibilitychange')
  await fixture.tick()
  assert.equal(fixture.toasts.length, 1)
  fixture.unmount()
  const restarted = createFixture(fixture.store)
  restarted.mount()
  await flush()
  assert.equal(restarted.toasts.length, 0)
})

test('hidden or unfocused windows defer the latest level until return', async () => {
  for (const visibilityFlag of ['isVisible', 'isFocused']) {
    const fixture = createFixture()
    fixture.state[visibilityFlag] = false
    fixture.mount()
    await flush()
    await fixture.tick()
    assert.equal(fixture.toasts.length, 0)
    assert.equal(fixture.store.lastSeenLevel, 4)
    fixture.state.currentLevel = 7
    fixture.state[visibilityFlag] = true
    fixture.windowEvents.emit('focus')
    fixture.documentEvents.emit('visibilitychange')
    await flush()
    assert.equal(fixture.toasts.length, 1)
    assert.match(fixture.toasts[0].message, /уровень 7/)
    assert.equal(fixture.store.lastSeenLevel, 7)
  }
})

test('disabled gamification leaves the unseen level pending', async () => {
  const fixture = createFixture()
  fixture.state.isEnabled = false
  fixture.mount()
  await flush()
  assert.equal(fixture.toasts.length, 0)
  assert.equal(fixture.store.lastSeenLevel, 4)
  fixture.state.isEnabled = true
  await fixture.tick()
  assert.equal(fixture.toasts.length, 1)
})

test('losing focus during a request neither displays nor acknowledges the level', async () => {
  const fixture = createFixture({ lastSeenLevel: 4 }, 4)
  fixture.mount()
  await flush()
  fixture.state.currentLevel = 5
  let resolveSnapshot
  fixture.state.pendingSnapshot = new Promise((resolve) => {
    resolveSnapshot = resolve
  })
  const checking = fixture.tick()
  fixture.windowEvents.emit('focus')
  fixture.state.isFocused = false
  resolveSnapshot(fixture.snapshot())
  await checking
  assert.equal(fixture.toasts.length, 0)
  assert.equal(fixture.store.lastSeenLevel, 4)
  fixture.state.pendingSnapshot = null
  fixture.state.isFocused = true
  fixture.windowEvents.emit('focus')
  await flush()
  assert.equal(fixture.toasts.length, 1)
})

test('effect cleanup and Strict Mode setup do not duplicate the toast', async () => {
  const fixture = createFixture()
  fixture.mount()
  fixture.unmount()
  assert.equal(fixture.timers.size, 0)
  assert.equal(fixture.windowEvents.listenerCount('focus'), 0)
  assert.equal(fixture.documentEvents.listenerCount('visibilitychange'), 0)
  fixture.mount()
  await flush()
  assert.equal(fixture.toasts.length, 1)
  assert.equal(fixture.store.lastSeenLevel, 5)
})

test('read and save failures recover without repeating the celebration', async () => {
  const fixture = createFixture({ lastSeenLevel: 4 }, 4)
  fixture.mount()
  await flush()
  fixture.state.currentLevel = 5
  fixture.state.shouldFailRead = true
  await fixture.tick()
  assert.equal(fixture.toasts.length, 0)
  fixture.state.shouldFailRead = false
  fixture.state.shouldFailSave = true
  await fixture.tick()
  assert.equal(fixture.toasts.length, 1)
  assert.equal(fixture.store.lastSeenLevel, 4)
  fixture.state.shouldFailSave = false
  await fixture.tick()
  assert.equal(fixture.store.lastSeenLevel, 5)
  assert.equal(fixture.toasts.length, 1)
  assert.equal(fixture.errors.length, 2)
})
