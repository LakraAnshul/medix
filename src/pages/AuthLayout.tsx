/**
 * Shared shell for /login and /signup. Matches the landing page palette so the
 * auth screens do not feel bolted on.
 */
import React from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft, ShieldCheck} from 'lucide-react';
import {MedixLogoIcon} from '../components/Illustrations';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#0f233a] font-sans flex flex-col selection:bg-[#fcd7d3] selection:text-[#0f233a]">
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group" aria-label="Medix home">
          <div className="p-1 rounded-lg transition-transform duration-300 group-hover:rotate-12">
            <MedixLogoIcon className="w-6 h-6 text-[#0f233a]" />
          </div>
          <span className="font-semibold text-xl tracking-tight">medix</span>
        </Link>
        <Link
          to="/"
          className="text-sm text-slate-600 hover:text-[#0f233a] transition-colors inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to site
        </Link>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-6 pb-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-7 sm:p-9">
            <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight leading-tight">
              {title}
            </h1>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">{subtitle}</p>

            <div className="mt-7">{children}</div>
          </div>

          {footer && <div className="mt-5 text-center text-sm text-slate-600">{footer}</div>}

          <p className="mt-6 text-[11px] leading-relaxed text-slate-400 flex items-start gap-1.5 justify-center text-center">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Medix is a student project. Do not enter real medical information or
              a password you use elsewhere.
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}

/** Inline field error, wired to its input with aria-describedby by the caller. */
export function FieldError({id, message}: {id: string; message?: string | null}) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-red-600">
      {message}
    </p>
  );
}

/** Non-field-specific error or notice. */
export function FormBanner({
  tone,
  children,
}: {
  tone: 'error' | 'info' | 'success';
  children: React.ReactNode;
}) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-700',
    info: 'bg-slate-50 border-slate-200 text-slate-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }[tone];

  return (
    <div
      className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${styles}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  );
}

export const inputClass =
  'w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-[#0f233a] ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f233a]/20 ' +
  'focus:border-[#0f233a]/40 transition disabled:bg-slate-50 disabled:text-slate-400 ' +
  'aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-200';

export const labelClass = 'block text-sm font-medium text-[#0f233a] mb-1.5';

export const submitClass =
  'w-full rounded-full bg-[#0f233a] text-white py-3 text-sm font-semibold ' +
  'hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed';
