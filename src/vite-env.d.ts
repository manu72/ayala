/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Same-origin path to the AI chat proxy (e.g. /api/ai/chat). */
  readonly VITE_AI_PROXY_URL?: string;
  readonly VITE_AI_PRIMARY?: string;
  readonly VITE_AI_FALLBACK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const src: string;
  export default src;
}
