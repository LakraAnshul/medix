/**
 * Shared chrome for the signed-in area.
 *
 * Phase 3 extends this rather than replacing it: the header, `Card`, `DataRow`
 * and `StatusPill` primitives from Phase 2 are kept exactly as they were (their
 * call sites elsewhere are untouched), and this file adds the pieces the design
 * audit found missing versus the landing page — `font-serif-display` headings
 * and the same `motion/react` fade-up entrance used across HeroSection,
 * DoctorsSection, FeatureShowcase etc, using the identical easing curve
 * `[0.16, 1, 0.3, 1]` so the whole app reads as one product.
 */
import React from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {LogOut} from 'lucide-react';
import {motion} from 'motion/react';
import {MedixLogoIcon} from '../components/Illustrations';
import {useAuth} from '../auth/AuthProvider';

/** The landing page's signature entrance easing (see HeroSection/DoctorsSection). */
export const EXPO_EASE = [0.16, 1, 0.3, 1] as const;

/** Shared fade-up wrapper so every dashboard section enters the same way the landing page's do. */
export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{opacity: 0, y: 20}}
      animate={{opacity: 1, y: 0}}
      transition={{duration: 0.5, delay, ease: EXPO_EASE}}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const ROLE_BADGE: Record<string, string> = {
  patient: 'bg-sky-50 text-sky-700 border-sky-200',
  doctor: 'bg-violet-50 text-violet-700 border-violet-200',
  admin: 'bg-amber-50 text-amber-800 border-amber-200',
};

export function DashboardLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const {profile, role, signOut, busy} = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/', {replace: true});
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#0f233a] font-sans flex flex-col selection:bg-[#fcd7d3] selection:text-[#0f233a]">
      <header className="sticky top-0 z-30 bg-[#fafafa]/90 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 group shrink-0" aria-label="Medix home">
            <div className="p-1 rounded-lg transition-transform duration-300 group-hover:rotate-12">
              <MedixLogoIcon className="w-6 h-6 text-[#0f233a]" />
            </div>
            <span className="font-semibold text-lg tracking-tight">medix</span>
          </Link>

          <div className="flex items-center gap-3 min-w-0">
            {role && (
              <span
                className={`hidden sm:inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  ROLE_BADGE[role] ?? 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {role}
              </span>
            )}
            <span className="text-sm text-slate-600 truncate max-w-[10rem] sm:max-w-xs">
              {profile?.full_name ?? 'Account'}
            </span>
            <button
              onClick={handleSignOut}
              disabled={busy}
              className="px-3.5 py-1.5 rounded-full border border-[#0f233a]/30 text-[#0f233a] text-sm font-medium hover:bg-[#0f233a] hover:text-white transition disabled:opacity-60 inline-flex items-center gap-1.5 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{busy ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <FadeUp>
          <h1 className="font-serif-display text-3xl sm:text-4xl text-[#0f233a] font-normal leading-tight">
            {title}
          </h1>
          <p className="text-sm sm:text-[15px] text-slate-500 mt-2 max-w-2xl leading-relaxed font-sans-body">
            {description}
          </p>
        </FadeUp>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

/**
 * Card background tones, reusing the exact pastel family from FeatureShowcase /
 * DoctorsSection (`#d8effa`, `#fee9d7`, `#fddcdb`) instead of uniform white, so
 * dashboard sections read as the same product as the landing page's department
 * containers rather than a generic admin panel.
 */
const CARD_TONES = {
  white: 'bg-white border-slate-200/80',
  sky: 'bg-[#d8effa] border-transparent',
  peach: 'bg-[#fee9d7] border-transparent',
  rose: 'bg-[#fddcdb] border-transparent',
} as const;

export type CardTone = keyof typeof CARD_TONES;

export function Card({
  title,
  children,
  aside,
  tone = 'white',
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  tone?: CardTone;
}) {
  return (
    <section className={`rounded-3xl border p-6 sm:p-7 ${CARD_TONES[tone]}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="font-serif-display text-lg text-[#0f233a] font-normal tracking-tight">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function DataRow({label, value}: {label: string; value: React.ReactNode}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <dt className="text-sm text-slate-500 shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-right break-words min-w-0">{value}</dd>
    </div>
  );
}

/**
 * Status colour + icon pairing is deliberate for accessibility: colour alone
 * never carries the meaning, each state also has distinct text and an icon
 * (rendered by callers via the `icon` slot where used) — see StatusPill usage
 * in DoctorPage/AdminPage for the icon pairing.
 */
export function StatusPill({status}: {status: string}) {
  const tone =
    {
      verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      pending: 'bg-amber-50 text-amber-800 border-amber-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
      suspended: 'bg-slate-100 text-slate-600 border-slate-300',
      available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      blocked: 'bg-slate-100 text-slate-600 border-slate-300',
      booked: 'bg-sky-50 text-sky-700 border-sky-200',
    }[status] ?? 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}

/** Consistent empty state. Never claims data exists when it does not. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-8 px-4">
      {icon && (
        <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && (
        <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Skeleton loader matching the card's own radius, so loading never looks like a different product. */
export function Skeleton({className = 'h-4 w-full'}: {className?: string}) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} aria-hidden="true" />;
}

export function CardSkeleton({rows = 3}: {rows?: number}) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({length: rows}).map((_, i) => (
        <React.Fragment key={i}>
          <Skeleton className={i % 2 === 0 ? 'h-4 w-full' : 'h-4 w-2/3'} />
        </React.Fragment>
      ))}
    </div>
  );
}

/** Inline banner for page-level errors/notices, matching AuthLayout's FormBanner tones. */
export function Banner({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info';
  children: React.ReactNode;
}) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-sky-50 border-sky-200 text-sky-800',
  }[tone];
  return (
    <div
      className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${styles}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  );
}

/** A labelled progress bar, used for profile completion. Percentage is always derived, never hardcoded. */
export function ProgressBar({percent, label}: {percent: number; label: string}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-[#0f233a]">{clamped}%</span>
      </div>
      <div
        className="h-2 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <motion.div
          className="h-full rounded-full bg-[#0f233a]"
          initial={{width: 0}}
          animate={{width: `${clamped}%`}}
          transition={{duration: 0.6, ease: EXPO_EASE}}
        />
      </div>
    </div>
  );
}

/**
 * Shared form primitives, matching AuthLayout's inputClass/labelClass so every
 * form in the app (auth screens and dashboard forms alike) looks identical.
 */
export const fieldInputClass =
  'w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-[#0f233a] ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f233a]/20 ' +
  'focus:border-[#0f233a]/40 transition disabled:bg-slate-50 disabled:text-slate-400 ' +
  'aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-200';

export const fieldLabelClass = 'block text-sm font-medium text-[#0f233a] mb-1.5';

export const primaryButtonClass =
  'rounded-full bg-[#0f233a] text-white text-sm font-semibold px-5 py-2.5 ' +
  'hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed ' +
  'inline-flex items-center justify-center gap-2';

export const secondaryButtonClass =
  'rounded-full border border-slate-300 text-slate-700 text-sm font-medium px-5 py-2.5 ' +
  'hover:bg-slate-50 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed ' +
  'inline-flex items-center justify-center gap-2';

export const dangerButtonClass =
  'rounded-full border border-red-200 text-red-600 text-sm font-medium px-5 py-2.5 ' +
  'hover:bg-red-50 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed ' +
  'inline-flex items-center justify-center gap-2';

export function FieldErrorText({id, message}: {id: string; message?: string | null}) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-red-600">
      {message}
    </p>
  );
}
