/**
 * Mamma Cat's stats in words for NPC prompts. Hunger and thirst are FULLNESS
 * (100 = full) and energy 100 = rested, so raw numbers read backwards to a
 * model; it only ever sees these words.
 */
export function mammaCatCondition(hunger: number, thirst: number, energy: number): string {
  const words = [
    hunger < 30 ? "very hungry" : hunger < 60 ? "a little hungry" : null,
    thirst < 30 ? "very thirsty" : thirst < 60 ? "a little thirsty" : null,
    energy < 30 ? "exhausted" : energy < 60 ? "tired" : null,
  ].filter((w): w is string => w !== null);
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : (words[0] ?? "");
}

/** "She is very hungry and tired." / "She seems well." */
export function describeMammaCatCondition(hunger: number, thirst: number, energy: number): string {
  const condition = mammaCatCondition(hunger, thirst, energy);
  return condition ? `She is ${condition}.` : "She seems well.";
}
