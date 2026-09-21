/**
 * Turns Supabase/Postgres errors into messages that are safe to show a user.
 *
 * WHY THIS EXISTS
 *   Raw database errors are an information-disclosure channel. A PostgREST error
 *   body can carry constraint names, column names, SQL fragments and policy
 *   details — useful to an attacker mapping the schema. We map known SQLSTATEs to
 *   plain sentences and collapse everything unrecognised into one generic
 *   message, logging the technical detail to the console for the developer only.
 *
 *   Authentication failures are deliberately vague: "invalid email or password"
 *   never reveals *which* was wrong, and signup never confirms whether an address
 *   is already registered (that would be an account-enumeration oracle).
 */

export interface SafeError {
  /** Shown to the user. */
  message: string;
  /** Stable code for branching in the UI. */
  code: string;
}

const GENERIC: SafeError = {
  message: 'Something went wrong. Please try again.',
  code: 'unknown',
};

/** SQLSTATE -> user-facing sentence. */
const SQLSTATE_MESSAGES: Record<string, string> = {
  '23505': 'That record already exists.',
  '23503': 'The related record could not be found.',
  '23514': 'Some of the values submitted are not valid.',
  '23P01': 'That time slot has just been taken. Please choose another.',
  '42501': 'You are not allowed to perform this action.',
  '22007': 'One of the dates or times submitted is not valid.',
  '22P02': 'One of the values submitted was not in the expected format.',
  '40001': 'The request conflicted with another. Please try again.',
  '57014': 'That took too long. Please try again.',
};

/**
 * Messages raised by our own guard triggers. These are written to be safe for a
 * user to read, so they are passed through verbatim rather than masked.
 */
const SAFE_TRIGGER_MESSAGE_PATTERNS: Array<{re: RegExp; message: string}> = [
  {
    re: /not permitted to change your own role|cannot be self-assigned/i,
    message: 'You are not allowed to change your own role.',
  },
  {
    re: /only an administrator may change verification_status/i,
    message: 'Only an administrator can change verification status.',
  },
  {
    re: /only an administrator may review a credential/i,
    message: 'Only an administrator can review credentials.',
  },
  {
    re: /cannot review their own credential|cannot approve their own/i,
    message: 'A doctor cannot approve their own credentials.',
  },
  {
    re: /not verified and cannot be booked/i,
    message: 'This doctor is not yet verified and cannot be booked.',
  },
  {
    re: /not inside the doctor's published availability/i,
    message: 'That time is outside the doctor’s available hours.',
  },
  {
    re: /must be scheduled in the future|must end in the future/i,
    message: 'Please choose a time in the future.',
  },
  {
    re: /only book an appointment for yourself/i,
    message: 'You can only book an appointment for your own account.',
  },
  {
    re: /only the patient may grant consent|only the patient may modify/i,
    message: 'Only the patient can manage their own consent.',
  },
  {
    re: /status .* is final/i,
    message: 'This appointment can no longer be changed.',
  },
  {
    re: /only the treating doctor/i,
    message: 'Only the treating doctor can make that change.',
  },
  {
    re: /audit_logs is append-only/i,
    message: 'Audit records cannot be modified.',
  },
  {
    re: /date_of_birth cannot be in the future/i,
    message: 'Date of birth cannot be in the future.',
  },
  {
    re: /no approved credential/i,
    message: 'This doctor has no approved credential yet.',
  },
];

function looksLikeNetworkFailure(error: unknown): boolean {
  const message = String((error as {message?: string})?.message ?? error ?? '');
  return (
    /failed to fetch|networkerror|network request failed|load failed|err_internet/i.test(message)
  );
}

/** Maps any thrown value to something safe to render. */
export function toSafeError(error: unknown): SafeError {
  if (!error) return GENERIC;

  // Developers get the detail; users do not.
  if (import.meta.env.DEV) console.debug('[medix] error detail', error);

  if (looksLikeNetworkFailure(error)) {
    return {
      message: 'Cannot reach the server. Check your connection and try again.',
      code: 'network',
    };
  }

  const err = error as {message?: string; code?: string; status?: number; name?: string};
  const rawMessage = err.message ?? '';

  // --- Auth errors ---------------------------------------------------------
  if (/invalid login credentials/i.test(rawMessage)) {
    // Intentionally does not say which field was wrong.
    return {message: 'Invalid email or password.', code: 'invalid_credentials'};
  }
  if (/email not confirmed/i.test(rawMessage)) {
    return {
      message: 'Please confirm your email address, then sign in.',
      code: 'email_not_confirmed',
    };
  }
  if (/user already registered|already been registered/i.test(rawMessage)) {
    // Neutral wording: does not confirm the address exists.
    return {
      message:
        'If that email can be registered, we have sent a confirmation link. Otherwise, try signing in.',
      code: 'signup_conflict',
    };
  }
  if (/password.*(at least|should be|weak)/i.test(rawMessage)) {
    return {
      message: 'Please choose a longer password (at least 8 characters).',
      code: 'weak_password',
    };
  }
  if (/rate limit|too many requests/i.test(rawMessage) || err.status === 429) {
    return {message: 'Too many attempts. Please wait a moment and try again.', code: 'rate_limited'};
  }
  if (
    /jwt expired|token has expired|session_not_found|refresh_token_not_found|invalid refresh token/i.test(
      rawMessage,
    )
  ) {
    return {message: 'Your session has expired. Please sign in again.', code: 'session_expired'};
  }
  if (/user not found|user_not_found/i.test(rawMessage)) {
    return {message: 'This account is no longer available.', code: 'user_missing'};
  }

  // --- Our own guard triggers ---------------------------------------------
  for (const {re, message} of SAFE_TRIGGER_MESSAGE_PATTERNS) {
    if (re.test(rawMessage)) return {message, code: 'forbidden'};
  }

  // --- Postgres SQLSTATEs -------------------------------------------------
  if (err.code && SQLSTATE_MESSAGES[err.code]) {
    return {message: SQLSTATE_MESSAGES[err.code], code: err.code};
  }

  // PostgREST returns 403/401 for an RLS denial with no rows matched.
  if (err.code === 'PGRST301' || err.status === 401) {
    return {message: 'Your session has expired. Please sign in again.', code: 'session_expired'};
  }
  if (err.status === 403) {
    return {message: 'You are not allowed to perform this action.', code: 'forbidden'};
  }

  return GENERIC;
}

/** Client-side input checks. Never the only line of defence — the database re-validates. */
export const validate = {
  email(value: string): string | null {
    const v = value.trim();
    if (!v) return 'Email is required.';
    if (v.length > 254) return 'That email address is too long.';
    // Deliberately permissive: the authoritative check is the confirmation email.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.';
    return null;
  },
  password(value: string): string | null {
    if (!value) return 'Password is required.';
    if (value.length < 8) return 'Use at least 8 characters.';
    if (value.length > 72) return 'Passwords cannot be longer than 72 characters.';
    return null;
  },
  fullName(value: string): string | null {
    const v = value.trim();
    if (v.length < 2) return 'Enter your full name.';
    if (v.length > 120) return 'That name is too long.';
    return null;
  },
  phone(value: string): string | null {
    const v = value.trim();
    if (!v) return null; // optional
    if (!/^\+?[0-9]{7,15}$/.test(v)) return 'Enter digits only, optionally starting with +.';
    return null;
  },
};
