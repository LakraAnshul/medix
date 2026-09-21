import React, {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Eye, EyeOff, Info} from 'lucide-react';
import {useAuth, type SignupRole} from '../auth/AuthProvider';
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

/**
 * Note what this form cannot do: there is no way to request an admin account.
 * Even if the request were hand-crafted, handle_new_user() maps anything other
 * than 'doctor' to 'patient', so the privilege boundary does not depend on this
 * form at all.
 */
export default function SignupPage() {
  const {signUp, busy, error, clearError} = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<SignupRole>('patient');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [qualification, setQualification] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();

    const nextErrors: Record<string, string | undefined> = {
      fullName: validate.fullName(fullName) ?? undefined,
      email: validate.email(email) ?? undefined,
      password: validate.password(password) ?? undefined,
      phone: validate.phone(phone) ?? undefined,
    };
    if (role === 'doctor') {
      if (specialization.trim().length < 2) nextErrors.specialization = 'Enter your specialization.';
      if (qualification.trim().length < 2) nextErrors.qualification = 'Enter your qualification.';
      if (registrationNumber.trim().length < 3)
        nextErrors.registrationNumber = 'Enter your medical registration number.';
    }

    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const result = await signUp({
      email,
      password,
      fullName,
      role,
      phone: phone.trim() || undefined,
      specialization,
      qualification,
      registrationNumber,
    });

    if (!result.ok) return;
    if (result.needsEmailConfirmation) {
      setConfirmationSent(true);
      return;
    }
    navigate('/dashboard', {replace: true});
  };

  if (confirmationSent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="We have sent you a confirmation link. Open it to finish creating your account."
        footer={
          <Link to="/login" className="font-medium text-[#0f233a] underline underline-offset-4">
            Back to sign in
          </Link>
        }
      >
        <FormBanner tone="success">
          Once your email is confirmed you can sign in and complete your profile.
        </FormBanner>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Book consultations, keep your health profile, and manage your records."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-[#0f233a] underline underline-offset-4">
            Sign in
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
        <fieldset className="mb-5">
          <legend className={labelClass}>I am signing up as</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
            {(['patient', 'doctor'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={role === option}
                onClick={() => setRole(option)}
                disabled={busy}
                className={`rounded-2xl border px-4 py-2.5 text-sm font-medium capitalize transition ${
                  role === option
                    ? 'border-[#0f233a] bg-[#0f233a] text-white'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mb-4">
          <label htmlFor="signup-name" className={labelClass}>
            Full name
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={Boolean(fieldErrors.fullName)}
            aria-describedby={fieldErrors.fullName ? 'signup-name-error' : undefined}
            className={inputClass}
            placeholder={role === 'doctor' ? 'Dr. Asha Menon' : 'Asha Menon'}
            disabled={busy}
          />
          <FieldError id="signup-name-error" message={fieldErrors.fullName} />
        </div>

        <div className="mb-4">
          <label htmlFor="signup-email" className={labelClass}>
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
            className={inputClass}
            placeholder="you@example.com"
            disabled={busy}
          />
          <FieldError id="signup-email-error" message={fieldErrors.email} />
        </div>

        <div className="mb-4">
          <label htmlFor="signup-password" className={labelClass}>
            Password
          </label>
          <div className="relative">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby="signup-password-hint signup-password-error"
              className={`${inputClass} pr-11`}
              placeholder="At least 8 characters"
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
          <p id="signup-password-hint" className="mt-1.5 text-xs text-slate-500">
            Use at least 8 characters. Passwords are stored and hashed by Supabase Auth.
          </p>
          <FieldError id="signup-password-error" message={fieldErrors.password} />
        </div>

        <div className="mb-4">
          <label htmlFor="signup-phone" className={labelClass}>
            Phone <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            id="signup-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? 'signup-phone-error' : undefined}
            className={inputClass}
            placeholder="+919876543210"
            disabled={busy}
          />
          <FieldError id="signup-phone-error" message={fieldErrors.phone} />
        </div>

        {role === 'doctor' && (
          <>
            <div className="mb-4">
              <label htmlFor="signup-specialization" className={labelClass}>
                Specialization
              </label>
              <input
                id="signup-specialization"
                type="text"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                aria-invalid={Boolean(fieldErrors.specialization)}
                aria-describedby={
                  fieldErrors.specialization ? 'signup-specialization-error' : undefined
                }
                className={inputClass}
                placeholder="Cardiology"
                disabled={busy}
              />
              <FieldError id="signup-specialization-error" message={fieldErrors.specialization} />
            </div>

            <div className="mb-4">
              <label htmlFor="signup-qualification" className={labelClass}>
                Qualification
              </label>
              <input
                id="signup-qualification"
                type="text"
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
                aria-invalid={Boolean(fieldErrors.qualification)}
                aria-describedby={
                  fieldErrors.qualification ? 'signup-qualification-error' : undefined
                }
                className={inputClass}
                placeholder="MBBS, MD"
                disabled={busy}
              />
              <FieldError id="signup-qualification-error" message={fieldErrors.qualification} />
            </div>

            <div className="mb-4">
              <label htmlFor="signup-registration" className={labelClass}>
                Medical registration number
              </label>
              <input
                id="signup-registration"
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                aria-invalid={Boolean(fieldErrors.registrationNumber)}
                aria-describedby="signup-registration-hint signup-registration-error"
                className={inputClass}
                placeholder="KMC/12345/2016"
                disabled={busy}
              />
              <FieldError
                id="signup-registration-error"
                message={fieldErrors.registrationNumber}
              />
            </div>

            <div className="mb-5 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 flex gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
              <span>
                Doctor accounts start as <strong>unverified</strong>. An administrator must review
                your credentials before your profile becomes visible or bookable.
              </span>
            </div>
          </>
        )}

        <button type="submit" className={submitClass} disabled={busy || !isSupabaseConfigured}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
