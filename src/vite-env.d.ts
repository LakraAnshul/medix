/// <reference types="vite/client" />

/**
 * Client-visible environment. These two are injected by the explicit allowlist in
 * vite.config.ts. Nothing else from .env reaches the browser, which is why there
 * is deliberately no entry here for the secret key or the database URL.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
