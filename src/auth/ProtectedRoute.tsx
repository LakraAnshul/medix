/**
 * Route gating.
 *
 * IMPORTANT — THIS IS NOT SECURITY.
 *
 * Hiding /admin from a patient is a usability feature, not an authorization
 * control. Anyone can edit the JavaScript in their own browser and render any
 * route they like. What actually protects the data is Row Level Security and the
 * guard triggers in the database: a patient who forces their way onto /admin sees
 * an admin-shaped page with no admin data in it, because every query is
 * re-authorised server-side against the verified JWT.
 *
 * Keeping that distinction explicit matters, because the common failure is to add
 * a check like this one and then assume the backend no longer needs its own.
 */
import React from 'react';
import {Navigate, useLocation} from 'react-router-dom';
import {useAuth} from './AuthProvider';
import type {AppRole} from '../lib/database.types';

function FullPageMessage({title, detail}: {title: string; detail?: string}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#fafafa] px-6"
      role="status"
      aria-live="polite"
    >
      <div className="text-center max-w-sm">
        <div
          className="w-10 h-10 mx-auto mb-4 rounded-full border-2 border-[#0f233a]/15 border-t-[#0f233a] animate-spin"
          aria-hidden="true"
        />
        <p className="text-[#0f233a] font-medium">{title}</p>
        {detail && <p className="text-sm text-slate-500 mt-1">{detail}</p>}
      </div>
    </div>
  );
}

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  /** When omitted, any authenticated user may see the route. */
  allowedRoles?: readonly AppRole[];
}) {
  const {session, role, initialising, profile} = useAuth();
  const location = useLocation();

  // Never redirect while the persisted session is still being restored, or a
  // refresh would bounce a signed-in user to /login.
  if (initialising) return <FullPageMessage title="Restoring your session…" />;

  if (!session) {
    return <Navigate to="/login" replace state={{from: location.pathname}} />;
  }

  // Session exists but the profile has not arrived yet.
  if (!profile && !role) return <FullPageMessage title="Loading your account…" />;

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/** Sends an already-signed-in user away from /login and /signup. */
export function PublicOnlyRoute({children}: {children: React.ReactNode}) {
  const {session, initialising} = useAuth();
  if (initialising) return <FullPageMessage title="Checking your session…" />;
  if (session) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
