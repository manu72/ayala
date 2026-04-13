import { type RpgSceneMapHooks } from '@rpgjs/client'
import { Graphics } from 'pixi.js'

const DAY_CYCLE_MS = 180_000 // 3 minutes = one full day cycle

// Time-of-day phases (fraction of cycle)
const PHASES = {
    DAY:     { start: 0.00, end: 0.40 },  // 0-40%: bright day
    EVENING: { start: 0.40, end: 0.55 },  // 40-55%: golden evening
    DUSK:    { start: 0.55, end: 0.65 },  // 55-65%: transition
    NIGHT:   { start: 0.65, end: 0.90 },  // 65-90%: dark night
    DAWN:    { start: 0.90, end: 1.00 },  // 90-100%: transition to day
}

function getOverlayColor(phase: number): { r: number; g: number; b: number; a: number } {
    if (phase < PHASES.DAY.end) {
        // Day: no overlay
        return { r: 0, g: 0, b: 0, a: 0 }
    }
    if (phase < PHASES.EVENING.end) {
        // Evening: warm golden tint, fade in
        const t = (phase - PHASES.EVENING.start) / (PHASES.EVENING.end - PHASES.EVENING.start)
        return { r: 200, g: 150, b: 50, a: t * 0.25 }
    }
    if (phase < PHASES.DUSK.end) {
        // Dusk: transition from golden to blue
        const t = (phase - PHASES.DUSK.start) / (PHASES.DUSK.end - PHASES.DUSK.start)
        return {
            r: Math.round(200 * (1 - t) + 30 * t),
            g: Math.round(150 * (1 - t) + 20 * t),
            b: Math.round(50 * (1 - t) + 80 * t),
            a: 0.25 + t * 0.15
        }
    }
    if (phase < PHASES.NIGHT.end) {
        // Night: dark blue/purple
        return { r: 30, g: 20, b: 80, a: 0.4 }
    }
    // Dawn: transition from night to day
    const t = (phase - PHASES.DAWN.start) / (PHASES.DAWN.end - PHASES.DAWN.start)
    return {
        r: Math.round(30 * (1 - t)),
        g: Math.round(20 * (1 - t)),
        b: Math.round(80 * (1 - t)),
        a: 0.4 * (1 - t)
    }
}

let overlay: Graphics | null = null
let startTime = Date.now()

const sceneMap: RpgSceneMapHooks = {
    onAfterLoading(scene) {
        if (!scene.viewport) return

        overlay = new Graphics()
        overlay.zIndex = 10000
        scene.viewport.addChild(overlay)
        startTime = Date.now()
    },

    onDraw(scene, t) {
        if (!overlay || !scene.viewport) return

        const elapsed = Date.now() - startTime
        const phase = (elapsed % DAY_CYCLE_MS) / DAY_CYCLE_MS
        const color = getOverlayColor(phase)

        overlay.clear()
        if (color.a > 0) {
            const rgb = (color.r << 16) | (color.g << 8) | color.b
            overlay.beginFill(rgb, color.a)
            // Cover the entire map area
            overlay.drawRect(
                -1000, -1000,
                scene.viewport.worldWidth + 2000,
                scene.viewport.worldHeight + 2000
            )
            overlay.endFill()
        }
    }
}

export default sceneMap
