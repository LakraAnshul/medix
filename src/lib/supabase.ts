/**
 * Browser Supabase client.
 *
 * SECURITY
 *  - Uses the PUBLISHABLE key only. It is designed to be public; every table is
 *    protected by Row Level Security, so possessing it grants nothing beyond what
 *    an anonymous visitor is explicitly allowed to read.
 *  - The secret key is never referenced here and is not present in the bundle.
 *    vite.config.ts forwards exactly two variables to client code and refuses to
 *    build if a secret is prefixed with VITE_; scripts/security/check-bundle.mjs
 *    re-checks the built output.
 *  - Sessions are persisted in localStorage by supabase-js and refreshed
 *    automatically. Tokens are short-lived; the refresh token is the sensitive
 *    item, which is why signing out (below) always clears local state.
 */
import {createClient} from '@supabase/supabase-js';
import type {Database} from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** True when the app has been configured. Lets the UI show a helpful message. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // Names only. Never log values.
  console.warn(
    '[medix] Supabase is not configured. Copy .env.example to .env and set ' +
      'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, then restart the dev server.',
  );
}

export const supabase = createClient<Database>(
  supabaseUrl || 'http://localhost:54321',
  supabasePublishableKey || 'missing-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // PKCE is the correct flow for a public client: the code exchange is bound
      // to a verifier this browser generated, so an intercepted code is useless.
      flowType: 'pkce',
      // Needed for email-confirmation and recovery links that land back here.
      detectSessionInUrl: true,
      storageKey: 'medix-auth',
    },
    global: {
      headers: {'x-application-name': 'medix-web'},
    },
  },
);

export const SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS = 60;
