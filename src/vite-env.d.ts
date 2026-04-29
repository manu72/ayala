/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Same-origin path to the AI chat proxy (e.g. /api/ai/chat). */
  readonly VITE_AI_PROXY_URL?: string;
  readonly VITE_AI_PRIMARY?: string;
  readonly VITE_AI_FALLBACK?: string;
  /** When `"true"`, logs full LLM system prompt, messages, and raw responses (see `src/config/aiDialogueDebug.ts`). */
  readonly VITE_AI_DEBUG_DIALOGUE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const src: string;
  export default src;
}

declare module "*.ts?raw" {
  const src: string;
  export default src;
}
