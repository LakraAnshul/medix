import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

/**
 * SECURITY — client environment allowlist.
 *
 * `.env` intentionally stores its variables WITHOUT a `VITE_` prefix so that Vite
 * never auto-inlines them into the browser bundle. Only the variables listed in
 * CLIENT_SAFE_ENV are forwarded to client code, exposed as
 * `import.meta.env.VITE_<NAME>`.
 *
 * NEVER add SUPABASE_SECRET_KEY or DATABASE_URL to this list. They grant
 * RLS-bypassing access to the whole database and are server-side only.
 */
const CLIENT_SAFE_ENV = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const;

/** Variables that must never reach the browser, regardless of prefix. */
const SERVER_ONLY_ENV = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'DATABASE_URL',
];

/** Value shapes that indicate a secret was pasted into a public variable. */
const SECRET_VALUE_PATTERNS = [
  /^sb_secret_/i,
  /^postgres(ql)?:\/\//i,
  /^eyJ[A-Za-z0-9_-]+\./, // raw JWT (legacy service_role keys)
];

function assertNoSecretsExposed(env: Record<string, string>): void {
  const secretValues = SERVER_ONLY_ENV.map((k) => env[k]).filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );

  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('VITE_')) continue;

    if (SERVER_ONLY_ENV.some((name) => key.includes(name))) {
      throw new Error(
        `[security] Refusing to build: "${key}" is prefixed with VITE_ and would be inlined ` +
          `into the browser bundle. Server-side secrets must not use the VITE_ prefix.`,
      );
    }
    if (secretValues.includes(value)) {
      throw new Error(
        `[security] Refusing to build: "${key}" holds the same value as a server-side secret ` +
          `and would be inlined into the browser bundle.`,
      );
    }
    if (SECRET_VALUE_PATTERNS.some((re) => re.test(value ?? ''))) {
      throw new Error(
        `[security] Refusing to build: "${key}" looks like a secret key or database URL ` +
          `(pattern match) and would be inlined into the browser bundle.`,
      );
    }
  }
}

export default defineConfig(({mode}) => {
  // The empty prefix loads every variable into this Node-side object. Nothing is
  // forwarded to the client except the explicit allowlist built below.
  const env = loadEnv(mode, process.cwd(), '');

  assertNoSecretsExposed(env);

  const define: Record<string, string> = {};
  for (const key of CLIENT_SAFE_ENV) {
    define[`import.meta.env.VITE_${key}`] = JSON.stringify(env[key] ?? '');
  }

  return {
    plugins: [react(), tailwindcss()],
    define,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
