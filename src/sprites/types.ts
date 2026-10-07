/** AI state for colony / NPC cats. */
export type CatState = "idle" | "walking" | "sleeping" | "alert" | "fleeing" | "drinking";

/** Social disposition toward the player (affects indicators and narration). */
export type Disposition = "friendly" | "neutral" | "territorial" | "wary";
