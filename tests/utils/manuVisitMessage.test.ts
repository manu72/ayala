import { describe, it, expect } from 'vitest'
import { buildManuVisitedFluffyMessage } from '../../src/utils/manuVisitMessage'

/**
 * `buildManuVisitedFluffyMessage` is the pure surface-text helper
 * driving Fluffy's AI prompt context for "Manu was here today /
 * yesterday / N days ago". The CatDialogueController reads the raw
 * Phaser registry value for `MANU_VISITED_FLUFFY_DAY` and the current
 * `dayNight.dayCount` and feeds them straight into this helper, so
 * defensive handling of corrupt / missing / non-numeric registry reads
 * is part of the unit contract.
 */

describe('buildManuVisitedFluffyMessage — happy path', () => {
  it('returns the "today" line when Manu visited on the current game day', () => {
    expect(buildManuVisitedFluffyMessage(7, 7)).toBe(
      "Manu (Fluffy's favourite human) visited Fluffy today.",
    )
  })

  it('returns the "yesterday" line when the gap is exactly one day', () => {
    expect(buildManuVisitedFluffyMessage(6, 7)).toBe(
      "Manu (Fluffy's favourite human) last visited Fluffy yesterday.",
    )
  })

  it('returns the explicit days-ago line for gaps of two or more', () => {
    expect(buildManuVisitedFluffyMessage(2, 7)).toBe(
      "Manu (Fluffy's favourite human) last visited Fluffy 5 game days ago.",
    )
  })

  it('floors fractional registry values before rendering', () => {
    // Registry round-trips through JSON; future-proof against a
    // fractional day stamp slipping through (manual save edits, schema
    // drift). Math.floor(6.9) === 6, so day 7 reads as "yesterday".
    expect(buildManuVisitedFluffyMessage(6.9, 7)).toBe(
      "Manu (Fluffy's favourite human) last visited Fluffy yesterday.",
    )
    // Same-day floor — visited at fractional-day 7.4 on day 7 is "today".
    expect(buildManuVisitedFluffyMessage(7.4, 7)).toBe(
      "Manu (Fluffy's favourite human) visited Fluffy today.",
    )
  })

  it('clamps a future-dated last-visit (currentDay < lastDay) to "today"', () => {
    // Defensive: a save-time-travel edge case (e.g. day rolled back via
    // dev console) must never produce a negative-days-ago string.
    expect(buildManuVisitedFluffyMessage(10, 7)).toBe(
      "Manu (Fluffy's favourite human) visited Fluffy today.",
    )
  })
})

describe('buildManuVisitedFluffyMessage — defensive (no event)', () => {
  it('returns null when the registry value is absent', () => {
    expect(buildManuVisitedFluffyMessage(undefined, 7)).toBeNull()
    expect(buildManuVisitedFluffyMessage(null, 7)).toBeNull()
  })

  it('returns null when the registry value is not a finite number', () => {
    expect(buildManuVisitedFluffyMessage(NaN, 7)).toBeNull()
    expect(buildManuVisitedFluffyMessage(Infinity, 7)).toBeNull()
    expect(buildManuVisitedFluffyMessage(-Infinity, 7)).toBeNull()
  })

  it('returns null for non-numeric registry payloads', () => {
    expect(buildManuVisitedFluffyMessage('5', 7)).toBeNull()
    expect(buildManuVisitedFluffyMessage(true, 7)).toBeNull()
    expect(buildManuVisitedFluffyMessage({}, 7)).toBeNull()
    expect(buildManuVisitedFluffyMessage([], 7)).toBeNull()
  })

  it('returns null for sentinel / pre-record values (0 and negative)', () => {
    // A fresh save / pre-Chapter-5 run leaves the key unset → registry.get()
    // returns undefined which the controller maps to 0; explicit 0 must
    // also short-circuit so the prompt stays silent rather than claiming
    // a visit that never happened.
    expect(buildManuVisitedFluffyMessage(0, 7)).toBeNull()
    expect(buildManuVisitedFluffyMessage(-1, 7)).toBeNull()
  })

  it('returns null when the current day is non-finite', () => {
    expect(buildManuVisitedFluffyMessage(5, NaN)).toBeNull()
    expect(buildManuVisitedFluffyMessage(5, Infinity)).toBeNull()
  })
})
