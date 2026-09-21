/**
 * Auth-aware navbar buttons.
 *
 * Purely presentational routing sugar: which buttons appear follows the cached
 * role from AuthProvider. It is not an access control — see ProtectedRoute for
 * why. Styling matches the existing navbar (same radius, palette and sizing) so
 * the landing page design is unchanged.
 */
import React from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {LayoutDashboard, LogOut, UserRound} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';

export const NavbarAuthButtons: React.FC<{variant?: 'desktop' | 'mobile'}> = ({
  variant = 'desktop',
}) => {
  const {session, profile, initialising, busy, signOut} = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/', {replace: true});
  };

  if (initialising) {
    return (
      <div
        className={
          variant === 'mobile'
            ? 'h-10 w-full rounded-full bg-slate-100 animate-pulse'
            : 'h-9 w-28 rounded-full bg-slate-100 animate-pulse'
        }
        aria-hidden="true"
      />
    );
  }

  if (variant === 'mobile') {
    return session ? (
      <div className="flex flex-col gap-3">
        <Link
          to="/dashboard"
          className="w-full py-2.5 rounded-full bg-[#0f233a] text-white font-medium text-center flex items-center justify-center gap-2"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>{profile?.full_name ? `${profile.full_name.split(' ')[0]}’s dashboard` : 'Dashboard'}</span>
        </Link>
        <button
          onClick={handleSignOut}
          disabled={busy}
          className="w-full py-2.5 rounded-full border border-slate-300 text-slate-700 font-medium text-center hover:bg-slate-50 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>{busy ? 'Signing out…' : 'Sign out'}</span>
        </button>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <Link
          to="/login"
          className="w-full py-2.5 rounded-full border border-slate-300 text-slate-700 font-medium text-center hover:bg-slate-50"
        >
          Sign in
        </Link>
        <Link
          to="/signup"
          className="w-full py-2.5 rounded-full bg-[#fcd7d3] text-[#0f233a] font-semibold text-center"
        >
          Create account
        </Link>
      </div>
    );
  }

  return session ? (
    <div className="flex items-center gap-2">
      <Link
        to="/dashboard"
        id="nav-dashboard-btn"
        className="px-4 py-2 rounded-full bg-[#0f233a] text-white text-sm font-medium hover:opacity-90 transition-all duration-200 cursor-pointer active:scale-95 inline-flex items-center gap-1.5"
      >
        <LayoutDashboard className="w-4 h-4" />
        <span>Dashboard</span>
      </Link>
      <button
        id="nav-signout-btn"
        onClick={handleSignOut}
        disabled={busy}
        className="px-4 py-2 rounded-full border border-[#0f233a]/30 text-[#0f233a] text-sm font-medium hover:bg-[#0f233a] hover:text-white transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-60"
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Link
        to="/login"
        id="nav-signin-btn"
        className="px-4 py-2 rounded-full text-[#1e293b] text-sm font-medium hover:text-[#0f233a] transition-colors cursor-pointer inline-flex items-center gap-1.5"
      >
        <UserRound className="w-4 h-4" />
        <span>Sign in</span>
      </Link>
      <Link
        to="/signup"
        id="nav-signup-btn"
        className="px-5 py-2 rounded-full bg-[#0f233a] text-white text-sm font-medium hover:opacity-90 transition-all duration-200 cursor-pointer shadow-2xs active:scale-95"
      >
        Get started
      </Link>
    </div>
  );
};
