/**
 * /dashboard — sends the user to the area matching their role.
 *
 * The role comes from the profiles row, which the client cannot change. This is
 * navigation only; each destination is independently gated and every query it
 * makes is re-authorised by RLS.
 */
import React from 'react';
import {Navigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {DashboardLayout, Card} from './DashboardLayout';

export default function DashboardPage() {
  const {role, profile, initialising} = useAuth();

  if (initialising) return null;

  if (role === 'patient') return <Navigate to="/patient" replace />;
  if (role === 'doctor') return <Navigate to="/doctor" replace />;
  if (role === 'admin') return <Navigate to="/admin" replace />;

  // Signed in, but no profile row resolved. Rare: the signup trigger failed, or
  // the auth user was removed while the tab was open.
  return (
    <DashboardLayout
      title="Account setup incomplete"
      description="You are signed in, but we could not load your profile."
    >
      <Card title="What happened">
        <p className="text-sm text-slate-600 leading-relaxed">
          Your profile record is missing. Sign out and sign in again. If it keeps happening, the
          account may have been removed by an administrator.
        </p>
        {profile === null && (
          <p className="mt-3 text-xs text-slate-400">No profile row is readable for this session.</p>
        )}
      </Card>
    </DashboardLayout>
  );
}
