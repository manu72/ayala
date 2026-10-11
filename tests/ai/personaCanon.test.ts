import { describe, it, expect } from "vitest";
import { AI_PERSONAS } from "../../src/ai/personas";

const SECTIONS = [
  "Identity",
  "Backstory",
  "Personality",
  "Speech Style",
  "Knowledge",
  "Relationship to Mamma Cat",
  "Rules of Engagement",
];

const persona = (name: string): string => {
  const md = AI_PERSONAS[name];
  if (md === undefined) throw new Error(`missing persona ${name}`);
  return md;
};

describe("persona markdown canon", () => {
  it.each(Object.keys(AI_PERSONAS))("%s keeps the seven-section format and a compact size", (name) => {
    const md = persona(name);
    // The title is said out loud by the model, so it must be the in-game name (no "Twin 1" labels).
    expect(md.split("\n")[0]).toBe(`# ${name}`);
    expect([...md.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(SECTIONS);
    // Sent on every request for this speaker.
    expect(md.length).toBeLessThanOrEqual(2400);
  });

  it.each(Object.keys(AI_PERSONAS))("%s knows Mamma Cat never speaks words", (name) => {
    expect(persona(name)).toMatch(/meows and blinks, (never|not) words/);
  });

  it("never presumes an absence or a return", () => {
    for (const md of Object.values(AI_PERSONAS)) {
      expect(md).not.toMatch(/haven't seen you|in a while|back again|you're back|she's back/i);
    }
  });

  it("Fluffy is female and Manu is her human, in every file that says so", () => {
    expect(persona("Fluffy")).toContain("Species: cat (female)");
    expect(persona("Manu")).toContain("has decided Manu is her human");
    for (const md of Object.values(AI_PERSONAS)) expect(md).not.toMatch(/Manu is his human/);
  });

  it("Manu and Camille rescued Jayco together, years ago", () => {
    for (const name of ["Jayco", "Camille", "Manu"]) {
      expect(persona(name)).toMatch(/Years ago .*(Manu and Camille|she and her partner Manu|he and Camille) found/);
      expect(persona(name)).not.toMatch(/months ago/);
    }
  });

  it("Pedigree's friend was taken by the dark-clothes humans, and the collar ends her asking", () => {
    expect(persona("Pedigree")).toContain("the dark-clothes humans took her friend");
    expect(persona("Pedigree")).toMatch(/story facts .*collar.*never ask again/);
  });
});
