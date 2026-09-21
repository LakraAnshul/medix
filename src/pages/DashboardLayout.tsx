/**
 * Shared chrome for the signed-in area. Deliberately plain — Phase 2 only needs
 * enough surface to prove that auth, role routing and RLS work end to end. The
 * real dashboards belong to later phases.
 */
import React from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {LogOut} from 'lucide-react';
import {MedixLogoIcon} from '../components/Illustrations';
import {useAuth} from '../auth/AuthProvider';

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
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">{description}</p>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

export function Card({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="font-semibold text-[15px] tracking-tight">{title}</h2>
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

export function StatusPill({status}: {status: string}) {
  const tone =
    {
      verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      pending: 'bg-amber-50 text-amber-800 border-amber-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
      suspended: 'bg-slate-100 text-slate-600 border-slate-300',
    }[status] ?? 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}
