export interface HumanAiBubbleEligibilityInput {
  hasPersona: boolean;
  aiServiceAvailable: boolean;
  aiInFlight: boolean;
  now: number;
  cooldownUntil: number;
  isMammaCatGreeting: boolean;
  distanceToMammaCat: number;
  maxMammaCatDistance: number;
}

export function shouldUseHumanAiBubble({
  hasPersona,
  aiServiceAvailable,
  aiInFlight,
  now,
  cooldownUntil,
  isMammaCatGreeting,
  distanceToMammaCat,
  maxMammaCatDistance,
}: HumanAiBubbleEligibilityInput): boolean {
  return (
    hasPersona &&
    aiServiceAvailable &&
    !aiInFlight &&
    now >= cooldownUntil &&
    isMammaCatGreeting &&
    distanceToMammaCat <= maxMammaCatDistance
  );
}

export function shouldUseNamedHumanScriptedBubble({
  hasPersona,
  isMammaCatGreeting,
  distanceToMammaCat,
  maxMammaCatDistance,
}: Pick<
  HumanAiBubbleEligibilityInput,
  "hasPersona" | "isMammaCatGreeting" | "distanceToMammaCat" | "maxMammaCatDistance"
>): boolean {
  return hasPersona && isMammaCatGreeting && distanceToMammaCat <= maxMammaCatDistance;
}
