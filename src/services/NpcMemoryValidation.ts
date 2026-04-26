export const NPC_MEMORY_KINDS = ["identity", "preference", "event", "relationship", "trait"] as const;

export type NpcMemoryKind = typeof NPC_MEMORY_KINDS[number];

export const NPC_MEMORY_LABEL_MAX = 48;
export const NPC_MEMORY_VALUE_MAX = 240;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const NPC_MEMORY_KIND_SET = new Set<string>(NPC_MEMORY_KINDS);

export function isNpcMemoryKind(value: unknown): value is NpcMemoryKind {
  return typeof value === "string" && NPC_MEMORY_KIND_SET.has(value);
}

export function normalizeNpcMemoryText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  if (CONTROL_CHARS.test(value)) return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}
