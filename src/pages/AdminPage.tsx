/**
 * /admin — administrative review queue.
 *
 * The data on this page is readable because the signed-in user's profiles.role is
 * 'admin' and the RLS policies call public.is_admin(). A patient who forces this
 * route open sees the same layout with empty lists and a permission error — the
 * page is not what protects the data.
 *
 * Verification order is enforced by the database, not by this UI: a doctor cannot
 * be marked verified until at least one of their credentials is approved
 * (guard_doctor_profiles_write), and no administrator can approve a credential
 * belonging to themselves (doctor_credentials_reviewer_not_self).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import type {
  AuditLogRow,
  DoctorCredentialRow,
  DoctorProfileRow,
} from '../lib/database.types';
import {DashboardLayout, Card, StatusPill} from './DashboardLayout';

export default function AdminPage() {
  const {profile} = useAuth();
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [credentials, setCredentials] = useState<DoctorCredentialRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SafeError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [doctorsResult, credentialsResult, logsResult] = await Promise.all([
        supabase
          .from('doctor_profiles')
          .select('*')
          .order('created_at', {ascending: false})
          .limit(50),
        supabase
          .from('doctor_credentials')
          .select('*')
          .eq('verification_status', 'pending')
          .order('created_at', {ascending: true})
          .limit(50),
        supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', {ascending: false})
          .limit(25),
      ]);

      if (doctorsResult.error) throw doctorsResult.error;
      if (credentialsResult.error) throw credentialsResult.error;
      if (logsResult.error) throw logsResult.error;

      setDoctors((doctorsResult.data as DoctorProfileRow[]) ?? []);
      setCredentials((credentialsResult.data as DoctorCredentialRow[]) ?? []);
      setLogs((logsResult.data as AuditLogRow[]) ?? []);
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewCredential = async (id: string, approve: boolean) => {
    setNotice(null);
    setError(null);
    const patch = approve
      ? {verification_status: 'verified' as const}
      : {
          verification_status: 'rejected' as const,
          rejection_reason: 'Document did not meet verification requirements.',
        };

    // The database is what authorises this, not the type: a non-admin session
    // issuing the identical request is rejected with SQLSTATE 42501.
    const {error: updateError} = await supabase
      .from('doctor_credentials')
      .update(patch)
      .eq('id', id);

    if (updateError) {
      setError(toSafeError(updateError));
      return;
    }
    setNotice(approve ? 'Credential approved.' : 'Credential rejected.');
    await load();
  };

  const setDoctorVerification = async (
    userId: string,
    status: 'verified' | 'rejected' | 'suspended',
  ) => {
    setNotice(null);
    setError(null);
    const {error: updateError} = await supabase
      .from('doctor_profiles')
      .update({verification_status: status})
      .eq('user_id', userId);

    if (updateError) {
      setError(toSafeError(updateError));
      return;
    }
    setNotice(`Doctor marked ${status}.`);
    await load();
  };

  return (
    <DashboardLayout
      title="Administration"
      description={`Signed in as ${profile?.full_name ?? 'admin'}. Review doctor credentials and verification.`}
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error.message}
        </div>
      )}
      {notice && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </div>
      )}

      <div className="grid gap-6">
        <Card
          title="Pending credentials"
          aside={<span className="text-xs text-slate-400">{credentials.length} waiting</span>}
        >
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : credentials.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing waiting for review.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {credentials.map((cred) => (
                <li key={cred.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{cred.document_name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {cred.credential_type.replace(/_/g, ' ')} · doctor {cred.doctor_id.slice(0, 8)}…
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => void reviewCredential(cred.id, true)}
                      className="px-3 py-1.5 rounded-full bg-[#0f233a] text-white text-xs font-semibold hover:opacity-90"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void reviewCredential(cred.id, false)}
                      className="px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Doctors"
          aside={<span className="text-xs text-slate-400">{doctors.length} total</span>}
        >
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : doctors.length === 0 ? (
            <p className="text-sm text-slate-500">No doctor accounts yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {doctors.map((doc) => (
                <li key={doc.user_id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.specialization}</p>
                    <p className="text-xs text-slate-500 truncate">
                      reg {doc.registration_number} · {doc.user_id.slice(0, 8)}…
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={doc.verification_status} />
                    {doc.verification_status !== 'verified' ? (
                      <button
                        onClick={() => void setDoctorVerification(doc.user_id, 'verified')}
                        className="px-3 py-1.5 rounded-full bg-[#0f233a] text-white text-xs font-semibold hover:opacity-90"
                      >
                        Verify
                      </button>
                    ) : (
                      <button
                        onClick={() => void setDoctorVerification(doc.user_id, 'suspended')}
                        className="px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                      >
                        Suspend
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent audit activity">
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500">No audit entries visible.</p>
          ) : (
            <ul className="divide-y divide-slate-100 font-mono text-xs">
              {logs.map((log) => (
                <li key={log.id} className="py-2 flex items-baseline justify-between gap-3">
                  <span className="truncate">
                    <span className="font-semibold">{log.action}</span>{' '}
                    <span className="text-slate-500">{log.resource_type}</span>
                  </span>
                  <span className="text-slate-400 shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
