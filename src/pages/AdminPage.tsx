/**
 * /admin — administrative verification queue.
 *
 * The data on this page is readable because the signed-in user's profiles.role is
 * 'admin' and the RLS policies call public.is_admin(). A patient who forces this
 * route open sees the same layout with empty lists and a permission error — the
 * page is not what protects the data.
 *
 * Verification order is enforced by the database, not by this UI: a doctor cannot
 * be marked verified until at least one of their credentials is approved
 * (guard_doctor_profiles_write), and no administrator can approve a credential
 * belonging to themselves (doctor_credentials_reviewer_not_self). A rejection
 * without a reason is impossible even from this screen — see RejectModal below,
 * and doctor_credentials_rejection_has_reason on the database side.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {ClipboardList, Eye, ScrollText} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import type {AuditLogRow, DoctorCredentialRow, DoctorProfileRow} from '../lib/database.types';
import {
  Banner,
  Card,
  CardSkeleton,
  DashboardLayout,
  EmptyState,
  FadeUp,
  StatusPill,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './DashboardLayout';

/**
 * Rejecting without a reason is blocked here in the UI, and independently by
 * doctor_credentials_rejection_has_reason on the server — a hand-crafted
 * request that omits it is refused with SQLSTATE 23514 regardless of this modal.
 */
function RejectModal({
  open,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  if (!open) return null;

  const trimmed = reason.trim();
  const invalid = touched && trimmed.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10">
        <h3 className="font-serif-display text-xl text-[#0f233a] font-normal">Reject credential</h3>
        <p className="text-sm text-slate-500 mt-1.5">
          A reason is required. The doctor will see exactly what you write here.
        </p>
        <div className="mt-4">
          <label htmlFor="rejection_reason" className={fieldLabelClass}>
            Rejection reason
          </label>
          <textarea
            id="rejection_reason"
            rows={3}
            className={fieldInputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'rejection-reason-error' : undefined}
            autoFocus
            maxLength={2000}
          />
          {invalid && (
            <p id="rejection-reason-error" className="mt-1.5 text-xs text-red-600">
              A rejection reason is required.
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-red-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-red-700 active:scale-[0.98] transition disabled:opacity-60"
            disabled={busy || trimmed.length === 0}
            onClick={() => {
              if (trimmed.length === 0) {
                setTouched(true);
                return;
              }
              onConfirm(trimmed);
            }}
          >
            {busy ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const {profile} = useAuth();
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [credentials, setCredentials] = useState<DoctorCredentialRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SafeError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

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

  const approveCredential = async (id: string) => {
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      const {error: updateError} = await supabase
        .from('doctor_credentials')
        .update({verification_status: 'verified'})
        .eq('id', id);
      if (updateError) throw updateError;
      setNotice('Credential approved.');
      await load();
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setBusyId(null);
    }
  };

  const rejectCredential = async (id: string, reason: string) => {
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      const {error: updateError} = await supabase
        .from('doctor_credentials')
        .update({verification_status: 'rejected', rejection_reason: reason})
        .eq('id', id);
      if (updateError) throw updateError;
      setNotice('Credential rejected.');
      setRejectTarget(null);
      await load();
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setBusyId(null);
    }
  };

  const setDoctorVerification = async (
    userId: string,
    status: 'verified' | 'suspended',
  ) => {
    setBusyId(userId);
    setNotice(null);
    setError(null);
    try {
      const {error: updateError} = await supabase
        .from('doctor_profiles')
        .update({verification_status: status})
        .eq('user_id', userId);
      if (updateError) throw updateError;
      setNotice(`Doctor marked ${status}.`);
      await load();
    } catch (caught) {
      // If a doctor has no approved credential yet, the database refuses this
      // with SQLSTATE 42501 — toSafeError() turns that into the message shown.
      setError(toSafeError(caught));
    } finally {
      setBusyId(null);
    }
  };

  const pendingDoctors = doctors.filter((d) => d.verification_status === 'pending');
  const verifiedDoctors = doctors.filter((d) => d.verification_status === 'verified');
  const rejectedDoctors = doctors.filter((d) => d.verification_status === 'rejected');
  const suspendedDoctors = doctors.filter((d) => d.verification_status === 'suspended');

  return (
    <DashboardLayout
      title="Administration"
      description={`Signed in as ${profile?.full_name ?? 'admin'}. Review doctor credentials and verification.`}
    >
      {error && <Banner tone="error">{error.message}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <FadeUp delay={0}>
          <div className="rounded-3xl bg-amber-50 border border-amber-100 p-4">
            <p className="text-2xl font-serif-display text-[#0f233a] font-normal">
              {loading ? '—' : pendingDoctors.length}
            </p>
            <p className="text-xs text-slate-600 mt-1">Pending</p>
          </div>
        </FadeUp>
        <FadeUp delay={0.05}>
          <div className="rounded-3xl bg-emerald-50 border border-emerald-100 p-4">
            <p className="text-2xl font-serif-display text-[#0f233a] font-normal">
              {loading ? '—' : verifiedDoctors.length}
            </p>
            <p className="text-xs text-slate-600 mt-1">Verified</p>
          </div>
        </FadeUp>
        <FadeUp delay={0.1}>
          <div className="rounded-3xl bg-red-50 border border-red-100 p-4">
            <p className="text-2xl font-serif-display text-[#0f233a] font-normal">
              {loading ? '—' : rejectedDoctors.length}
            </p>
            <p className="text-xs text-slate-600 mt-1">Rejected</p>
          </div>
        </FadeUp>
        <FadeUp delay={0.15}>
          <div className="rounded-3xl bg-slate-100 border border-slate-200 p-4">
            <p className="text-2xl font-serif-display text-[#0f233a] font-normal">
              {loading ? '—' : suspendedDoctors.length}
            </p>
            <p className="text-xs text-slate-600 mt-1">Suspended</p>
          </div>
        </FadeUp>
      </div>

      <div className="grid gap-6">
        <FadeUp delay={0.05}>
          <Card
            title="Pending credentials"
            aside={<span className="text-xs text-slate-400">{credentials.length} waiting</span>}
          >
            {loading ? (
              <CardSkeleton rows={3} />
            ) : credentials.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="w-5 h-5" />}
                title="Nothing waiting for review"
              />
            ) : (
              <>
                {/* Table on wide screens, stacked cards on mobile so nothing overflows. */}
                <div className="hidden md:block overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-2 py-2 font-medium">Document</th>
                        <th className="px-2 py-2 font-medium">Type</th>
                        <th className="px-2 py-2 font-medium">Submitted</th>
                        <th className="px-2 py-2 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credentials.map((cred) => (
                        <tr key={cred.id} className="border-b border-slate-50">
                          <td className="px-2 py-3 max-w-[220px] truncate">{cred.document_name}</td>
                          <td className="px-2 py-3 text-slate-500 capitalize">
                            {cred.credential_type.replace(/_/g, ' ')}
                          </td>
                          <td className="px-2 py-3 text-slate-400 whitespace-nowrap">
                            {new Date(cred.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-2 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => void approveCredential(cred.id)}
                                disabled={busyId === cred.id}
                                className="px-3 py-1.5 rounded-full bg-[#0f233a] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectTarget(cred.id)}
                                disabled={busyId === cred.id}
                                className="px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="md:hidden divide-y divide-slate-100">
                  {credentials.map((cred) => (
                    <li key={cred.id} className="py-3">
                      <p className="text-sm font-medium truncate">{cred.document_name}</p>
                      <p className="text-xs text-slate-500 capitalize mt-0.5">
                        {cred.credential_type.replace(/_/g, ' ')} ·{' '}
                        {new Date(cred.created_at).toLocaleDateString()}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => void approveCredential(cred.id)}
                          disabled={busyId === cred.id}
                          className="flex-1 px-3 py-1.5 rounded-full bg-[#0f233a] text-white text-xs font-semibold disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectTarget(cred.id)}
                          disabled={busyId === cred.id}
                          className="flex-1 px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 text-xs font-semibold disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </FadeUp>

        <FadeUp delay={0.1}>
          <Card
            title="Doctors"
            aside={<span className="text-xs text-slate-400">{doctors.length} total</span>}
          >
            {loading ? (
              <CardSkeleton rows={4} />
            ) : doctors.length === 0 ? (
              <EmptyState title="No doctor accounts yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {doctors.map((doc) => (
                  <li
                    key={doc.user_id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.specialization}</p>
                      <p className="text-xs text-slate-500 truncate">
                        reg {doc.registration_number} · {doc.user_id.slice(0, 8)}…
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusPill status={doc.verification_status} />
                      <Link
                        to={`/admin/doctors/${doc.user_id}`}
                        className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
                        aria-label={`View doctor ${doc.user_id}`}
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {doc.verification_status !== 'verified' ? (
                        <button
                          onClick={() => void setDoctorVerification(doc.user_id, 'verified')}
                          disabled={busyId === doc.user_id}
                          className="px-3 py-1.5 rounded-full bg-[#0f233a] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                        >
                          Verify
                        </button>
                      ) : (
                        <button
                          onClick={() => void setDoctorVerification(doc.user_id, 'suspended')}
                          disabled={busyId === doc.user_id}
                          className="px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
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
        </FadeUp>

        <FadeUp delay={0.15}>
          <Card title="Recent audit activity" aside={<ScrollText className="w-4 h-4 text-slate-400" />}>
            {loading ? (
              <CardSkeleton rows={3} />
            ) : logs.length === 0 ? (
              <EmptyState title="No audit entries visible" />
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
        </FadeUp>
      </div>

      <RejectModal
        open={rejectTarget !== null}
        busy={Boolean(rejectTarget && busyId === rejectTarget)}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) => {
          if (rejectTarget) void rejectCredential(rejectTarget, reason);
        }}
      />
    </DashboardLayout>
  );
}
