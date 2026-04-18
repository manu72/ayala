import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * DialogueSystem reaches into three corners of Phaser:
 *   - scene.cameras.main (width/height)
 *   - scene.add.{rectangle,text,container}
 *   - scene.input.keyboard.addKey + Phaser.Input.Keyboard.KeyCodes.SPACE
 *
 * The mock below gives each game-object a tiny event bus so tests can
 * trigger `pointerdown` on the backdrop / close button and `down` on the
 * Space key without pulling in a real Phaser runtime.
 */
vi.mock('phaser', () => ({
  default: {
    Input: {
      Keyboard: {
        KeyCodes: { SPACE: 32 },
      },
    },
  },
}))

import { DialogueSystem } from '../../src/systems/DialogueSystem'

type Handler = (...args: unknown[]) => void

interface EventBus {
  on: (event: string, cb: Handler) => unknown
  emit: (event: string, ...args: unknown[]) => void
  handlers: Map<string, Handler[]>
}

function makeEventBus(): EventBus {
  const handlers = new Map<string, Handler[]>()
  return {
    handlers,
    on(event, cb) {
      const list = handlers.get(event) ?? []
      list.push(cb)
      handlers.set(event, list)
      return this
    },
    emit(event, ...args) {
      for (const cb of handlers.get(event) ?? []) cb(...args)
    },
  }
}

interface RectangleMock extends EventBus {
  kind: 'rectangle'
  x: number
  y: number
  w: number
  h: number
  color: number
  alpha: number
  visible: boolean
  depth: number
  origin: { x: number; y: number }
  input: { enabled: boolean } | null
  stroke: { width: number; color: number; alpha: number } | null
  setInteractive(_config?: unknown): RectangleMock
  setDepth(d: number): RectangleMock
  setVisible(v: boolean): RectangleMock
  setOrigin(x: number, y?: number): RectangleMock
  setStrokeStyle(w: number, c: number, a: number): RectangleMock
}

function makeRectangle(
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha: number,
): RectangleMock {
  const bus = makeEventBus()
  const r: RectangleMock = {
    ...bus,
    kind: 'rectangle',
    x,
    y,
    w,
    h,
    color,
    alpha,
    visible: true,
    depth: 0,
    origin: { x: 0.5, y: 0.5 },
    input: null,
    stroke: null,
    setInteractive(_config?: unknown) {
      r.input = { enabled: true }
      return r
    },
    setDepth(d: number) {
      r.depth = d
      return r
    },
    setVisible(v: boolean) {
      r.visible = v
      return r
    },
    setOrigin(x: number, y?: number) {
      r.origin = { x, y: y ?? x }
      return r
    },
    setStrokeStyle(w: number, c: number, a: number) {
      r.stroke = { width: w, color: c, alpha: a }
      return r
    },
  }
  return r
}

interface TextMock extends EventBus {
  kind: 'text'
  x: number
  y: number
  text: string
  style: unknown
  color: string | null
  visible: boolean
  origin: { x: number; y: number }
  input: { enabled: boolean } | null
  setInteractive(_config?: unknown): TextMock
  setOrigin(x: number, y?: number): TextMock
  setText(t: string): TextMock
  setColor(c: string): TextMock
  setVisible(v: boolean): TextMock
  setDepth(_d: number): TextMock
}

function makeText(x: number, y: number, text: string, style: unknown): TextMock {
  const bus = makeEventBus()
  const t: TextMock = {
    ...bus,
    kind: 'text',
    x,
    y,
    text,
    style,
    color: null,
    visible: true,
    origin: { x: 0, y: 0 },
    input: null,
    setInteractive(_config?: unknown) {
      t.input = { enabled: true }
      return t
    },
    setOrigin(x, y) {
      t.origin = { x, y: y ?? x }
      return t
    },
    setText(value: string) {
      t.text = value
      return t
    },
    setColor(c: string) {
      t.color = c
      return t
    },
    setVisible(v: boolean) {
      t.visible = v
      return t
    },
    setDepth(_d: number) {
      return t
    },
  }
  return t
}

interface ContainerMock {
  kind: 'container'
  x: number
  y: number
  children: unknown[]
  depth: number
  visible: boolean
  setDepth(d: number): ContainerMock
  setVisible(v: boolean): ContainerMock
}

function makeContainer(x: number, y: number, children: unknown[]): ContainerMock {
  const c: ContainerMock = {
    kind: 'container',
    x,
    y,
    children,
    depth: 0,
    visible: true,
    setDepth(d) {
      c.depth = d
      return c
    },
    setVisible(v) {
      c.visible = v
      return c
    },
  }
  return c
}

interface KeyMock extends EventBus {
  keyCode: number
}

function makeSceneHarness() {
  const rectangles: RectangleMock[] = []
  const texts: TextMock[] = []
  const containers: ContainerMock[] = []
  const keys: KeyMock[] = []

  const scene = {
    cameras: { main: { width: 800, height: 600 } },
    add: {
      rectangle: vi.fn(
        (x: number, y: number, w: number, h: number, color: number, alpha: number) => {
          const r = makeRectangle(x, y, w, h, color, alpha)
          rectangles.push(r)
          return r
        },
      ),
      text: vi.fn((x: number, y: number, t: string, style: unknown) => {
        const tx = makeText(x, y, t, style)
        texts.push(tx)
        return tx
      }),
      container: vi.fn((x: number, y: number, children: unknown[]) => {
        const c = makeContainer(x, y, children)
        containers.push(c)
        return c
      }),
    },
    input: {
      keyboard: {
        addKey: vi.fn((keyCode: number) => {
          const bus = makeEventBus()
          const key: KeyMock = { ...bus, keyCode }
          keys.push(key)
          return key
        }),
      },
    },
  } as unknown as Phaser.Scene

  return { scene, rectangles, texts, containers, keys }
}

/**
 * Build a DialogueSystem + named references to the specific backdrop /
 * background / body-text / prompt / close-button / container / space-key
 * game-objects created during construction, so tests can assert against
 * them directly without indexing into arrays.
 */
function buildDialogue() {
  const h = makeSceneHarness()
  const system = new DialogueSystem(h.scene)
  // Construction creates, in order:
  //   rectangles[0] = backdrop (full-screen click catcher)
  //   rectangles[1] = background panel
  //   texts[0]      = body text
  //   texts[1]      = [Space] prompt
  //   texts[2]      = close (x) button
  //   containers[0] = dialogue container
  //   keys[0]       = SPACE advance key
  return {
    system,
    backdrop: h.rectangles[0]!,
    background: h.rectangles[1]!,
    body: h.texts[0]!,
    prompt: h.texts[1]!,
    closeBtn: h.texts[2]!,
    container: h.containers[0]!,
    spaceKey: h.keys[0]!,
  }
}

describe('DialogueSystem — constructor wiring', () => {
  it('creates a hidden container, hidden backdrop with disabled input, and a SPACE key', () => {
    const { container, backdrop, spaceKey } = buildDialogue()
    expect(container.visible).toBe(false)
    expect(container.depth).toBe(100)
    expect(backdrop.visible).toBe(false)
    expect(backdrop.input?.enabled).toBe(false)
    expect(spaceKey.keyCode).toBe(32)
  })

  it('close button toggles colour on pointerover / pointerout', () => {
    const { closeBtn } = buildDialogue()
    closeBtn.emit('pointerover')
    expect(closeBtn.color).toBe('#ffffff')
    closeBtn.emit('pointerout')
    expect(closeBtn.color).toBe('#666666')
  })
})

describe('DialogueSystem.show — activation and first line rendering', () => {
  it('marks the dialogue active, renders the first line, and enables the backdrop', () => {
    const { system, container, backdrop, body } = buildDialogue()
    expect(system.isActive).toBe(false)
    system.show(['Hello', 'World'])
    expect(system.isActive).toBe(true)
    expect(container.visible).toBe(true)
    expect(backdrop.visible).toBe(true)
    expect(backdrop.input?.enabled).toBe(true)
    expect(body.text).toBe('Hello')
  })

  it('is a no-op when show() is called on an already-active dialogue', () => {
    const { system, body } = buildDialogue()
    system.show(['First'], () => undefined)
    system.show(['Replacement'], () => undefined) // should be ignored
    expect(body.text).toBe('First')
  })

  it('renders an empty string when show() is called with an empty lines array', () => {
    const { system, body } = buildDialogue()
    system.show([])
    expect(system.isActive).toBe(true)
    expect(body.text).toBe('')
  })
})

describe('DialogueSystem.advance — via SPACE key', () => {
  it('progresses through each line in order', () => {
    const { system, body, spaceKey } = buildDialogue()
    system.show(['One', 'Two', 'Three'])
    expect(body.text).toBe('One')
    spaceKey.emit('down')
    expect(body.text).toBe('Two')
    spaceKey.emit('down')
    expect(body.text).toBe('Three')
  })

  it('hides the dialogue and fires onComplete after the final line is advanced past', () => {
    const onComplete = vi.fn()
    const { system, container, backdrop, spaceKey } = buildDialogue()
    system.show(['One', 'Two'], onComplete)
    spaceKey.emit('down') // → "Two"
    expect(onComplete).not.toHaveBeenCalled()
    spaceKey.emit('down') // past the end → hide + onComplete
    expect(system.isActive).toBe(false)
    expect(container.visible).toBe(false)
    expect(backdrop.visible).toBe(false)
    expect(backdrop.input?.enabled).toBe(false)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('fires onComplete exactly once even if SPACE is pressed again after completion', () => {
    const onComplete = vi.fn()
    const { system, spaceKey } = buildDialogue()
    system.show(['Only line'], onComplete)
    spaceKey.emit('down') // end reached
    spaceKey.emit('down') // no-op (dialogue inactive)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(system.isActive).toBe(false)
  })

  it('omits onComplete gracefully when not supplied', () => {
    const { system, spaceKey } = buildDialogue()
    // No onComplete — advancing past the end must not throw.
    expect(() => {
      system.show(['A'])
      spaceKey.emit('down')
    }).not.toThrow()
    expect(system.isActive).toBe(false)
  })

  it('ignores SPACE while the dialogue is inactive', () => {
    const { system, body, spaceKey } = buildDialogue()
    spaceKey.emit('down')
    expect(system.isActive).toBe(false)
    expect(body.text).toBe('') // constructor initialised to empty
  })
})

describe('DialogueSystem.dismiss — early close never fires onComplete', () => {
  it('dismiss() hides the dialogue and does NOT invoke onComplete', () => {
    const onComplete = vi.fn()
    const { system, container, backdrop } = buildDialogue()
    system.show(['One', 'Two', 'Three'], onComplete)
    system.dismiss()
    expect(system.isActive).toBe(false)
    expect(container.visible).toBe(false)
    expect(backdrop.visible).toBe(false)
    expect(backdrop.input?.enabled).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('backdrop pointerdown dismisses without firing onComplete', () => {
    const onComplete = vi.fn()
    const { system, backdrop } = buildDialogue()
    system.show(['A', 'B'], onComplete)
    backdrop.emit('pointerdown')
    expect(system.isActive).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('close-button pointerdown dismisses without firing onComplete', () => {
    const onComplete = vi.fn()
    const { system, closeBtn } = buildDialogue()
    system.show(['A', 'B'], onComplete)
    closeBtn.emit('pointerdown')
    expect(system.isActive).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('dismiss() on an inactive dialogue is a harmless no-op', () => {
    const { system } = buildDialogue()
    expect(() => system.dismiss()).not.toThrow()
    expect(system.isActive).toBe(false)
  })

  it('SPACE after dismiss is a no-op (cannot resurrect a dismissed dialogue)', () => {
    const onComplete = vi.fn()
    const { system, spaceKey } = buildDialogue()
    system.show(['A', 'B'], onComplete)
    system.dismiss()
    spaceKey.emit('down')
    spaceKey.emit('down')
    expect(system.isActive).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('re-showing after dismiss starts fresh from line 0 and allows completion', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { system, body, spaceKey } = buildDialogue()
    system.show(['X', 'Y'], first)
    system.dismiss()
    system.show(['P', 'Q'], second)
    expect(body.text).toBe('P')
    spaceKey.emit('down')
    expect(body.text).toBe('Q')
    spaceKey.emit('down')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

// ──────────────────────────────────────────────────────────────
// Degraded-environment guard
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// Paired-surface hooks — used by the Camille encounter loop to keep
// a floating spoken bubble in lockstep with the modal narrator line.
// ──────────────────────────────────────────────────────────────

describe('DialogueSystem — onLineShown + onHide hooks', () => {
  it('fires onLineShown(0) synchronously from show() before the player can advance', () => {
    const onLineShown = vi.fn()
    const { system } = buildDialogue()
    system.show(['A', 'B'], undefined, { onLineShown })
    // Must fire BEFORE the player has a chance to press Space —
    // callers rely on this to spawn the paired bubble for line 0.
    expect(onLineShown).toHaveBeenCalledTimes(1)
    expect(onLineShown).toHaveBeenCalledWith(0)
  })

  it('fires onLineShown(n) for each subsequent line as SPACE advances', () => {
    const onLineShown = vi.fn()
    const { system, spaceKey } = buildDialogue()
    system.show(['One', 'Two', 'Three'], undefined, { onLineShown })
    onLineShown.mockClear() // ignore the initial index-0 call for this assertion
    spaceKey.emit('down') // → "Two"
    expect(onLineShown).toHaveBeenLastCalledWith(1)
    spaceKey.emit('down') // → "Three"
    expect(onLineShown).toHaveBeenLastCalledWith(2)
    // The final SPACE that advances past the end hides the dialogue and
    // must NOT fire onLineShown (the dialogue is gone).
    spaceKey.emit('down')
    expect(onLineShown).toHaveBeenCalledTimes(2)
  })

  it('fires onHide() when the final line is advanced past (natural completion)', () => {
    const onComplete = vi.fn()
    const onHide = vi.fn()
    const { system, spaceKey } = buildDialogue()
    system.show(['A'], onComplete, { onHide })
    spaceKey.emit('down') // past the end → hide
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onHide).toHaveBeenCalledTimes(1)
    expect(system.isActive).toBe(false)
  })

  it('fires onHide() on dismiss() even though onComplete does not fire', () => {
    const onComplete = vi.fn()
    const onHide = vi.fn()
    const { system } = buildDialogue()
    system.show(['A', 'B'], onComplete, { onHide })
    system.dismiss()
    expect(onComplete).not.toHaveBeenCalled()
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('fires onHide() on backdrop pointerdown and close-button dismiss paths', () => {
    const a = vi.fn()
    const { system: s1, backdrop } = buildDialogue()
    s1.show(['A'], undefined, { onHide: a })
    backdrop.emit('pointerdown')
    expect(a).toHaveBeenCalledTimes(1)

    const b = vi.fn()
    const { system: s2, closeBtn } = buildDialogue()
    s2.show(['A'], undefined, { onHide: b })
    closeBtn.emit('pointerdown')
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('clears hooks between calls so a fresh show() is not cross-contaminated', () => {
    const firstHide = vi.fn()
    const secondHide = vi.fn()
    const { system, spaceKey } = buildDialogue()
    system.show(['A'], undefined, { onHide: firstHide })
    system.dismiss() // fires firstHide
    expect(firstHide).toHaveBeenCalledTimes(1)

    system.show(['B'], undefined, { onHide: secondHide })
    spaceKey.emit('down') // completion → hides
    // Only the current invocation's onHide should fire, not the first one again.
    expect(firstHide).toHaveBeenCalledTimes(1)
    expect(secondHide).toHaveBeenCalledTimes(1)
  })

  it('tolerates hooks being omitted entirely (back-compat with two-arg callers)', () => {
    const { system, spaceKey } = buildDialogue()
    expect(() => {
      system.show(['A'])
      spaceKey.emit('down')
    }).not.toThrow()
  })
})

describe('DialogueSystem — degraded keyboard fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('works when scene.input.keyboard is null (no SPACE advance, dismiss still works)', () => {
    const h = makeSceneHarness()
    // Simulate a headless or keyboard-less input manager.
    ;(h.scene as unknown as { input: { keyboard: unknown } }).input.keyboard = null
    const system = new DialogueSystem(h.scene)
    const onComplete = vi.fn()
    system.show(['A', 'B'], onComplete)
    // No space key registered — pointer dismiss is the only exit.
    system.dismiss()
    expect(system.isActive).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
  })
})
