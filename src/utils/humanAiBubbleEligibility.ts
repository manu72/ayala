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
