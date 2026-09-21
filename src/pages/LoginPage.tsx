import React, {useState} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import {Eye, EyeOff} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {validate} from '../lib/errors';
import {isSupabaseConfigured} from '../lib/supabase';
import {
  AuthLayout,
  FieldError,
  FormBanner,
  inputClass,
  labelClass,
  submitClass,
} from './AuthLayout';

export default function LoginPage() {
  const {signIn, busy, error, clearError} = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{email?: string; password?: string}>({});

  /**
   * Where to go after signing in. Restricted to an allowlist of internal paths:
   * echoing an arbitrary `from` value into navigate() would be an open-redirect.
   */
  const rawFrom = (location.state as {from?: string} | null)?.from;
  const redirectTo =
    typeof rawFrom === 'string' &&
    rawFrom.startsWith('/') &&
    !rawFrom.startsWith('//') &&
    ['/dashboard', '/patient', '/doctor', '/admin'].includes(rawFrom)
      ? rawFrom
      : '/dashboard';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();

    const nextErrors = {
      email: validate.email(email) ?? undefined,
      password: password ? undefined : 'Password is required.',
    };
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    const result = await signIn(email, password);
    if (result.ok) navigate(redirectTo, {replace: true});
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your appointments and health profile."
      footer={
        <>
          New to Medix?{' '}
          <Link to="/signup" className="font-medium text-[#0f233a] underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      {!isSupabaseConfigured && (
        <FormBanner tone="error">
          Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code>, fill it
          in, and restart the dev server.
        </FormBanner>
      )}

      {error && <FormBanner tone="error">{error.message}</FormBanner>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label htmlFor="login-email" className={labelClass}>
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            className={inputClass}
            placeholder="you@example.com"
            disabled={busy}
          />
          <FieldError id="login-email-error" message={fieldErrors.email} />
        </div>

        <div className="mb-6">
          <label htmlFor="login-password" className={labelClass}>
            Password
          </label>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
              className={`${inputClass} pr-11`}
              placeholder="Your password"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <FieldError id="login-password-error" message={fieldErrors.password} />
        </div>

        <button type="submit" className={submitClass} disabled={busy || !isSupabaseConfigured}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
