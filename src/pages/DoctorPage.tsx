/**
 * /doctor — doctor area.
 *
 * Shows verification state and credentials. Note there is no "verify me" control
 * and no way to add one that would work: doctor_profiles.verification_status is
 * pinned by guard_doctor_profiles_write(), so an UPDATE attempting to change it
 * from a doctor session is rejected with SQLSTATE 42501 regardless of what the UI
 * sends.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ShieldAlert} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import type {DoctorCredentialRow, DoctorProfileRow} from '../lib/database.types';
import {DashboardLayout, Card, DataRow, StatusPill} from './DashboardLayout';

const VERIFICATION_COPY: Record<string, string> = {
  pending:
    'Your account is awaiting review. Upload your credentials, then an administrator will verify them. Until that happens your profile is not listed and cannot be booked.',
  verified: 'Your account is verified. You are listed in the public directory and can be booked.',
  rejected:
    'Your verification was rejected. Check the reason on your credentials below, then re-upload corrected documents.',
  suspended:
    'Your account is suspended. You are not listed and cannot be booked. Contact an administrator.',
};

export default function DoctorPage() {
  const {user, profile} = useAuth();
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileRow | null>(null);
  const [credentials, setCredentials] = useState<DoctorCredentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SafeError | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [profileResult, credentialsResult] = await Promise.all([
        supabase.from('doctor_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('doctor_credentials')
          .select('*')
          .eq('doctor_id', user.id)
          .order('created_at', {ascending: false}),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (credentialsResult.error) throw credentialsResult.error;

      setDoctorProfile((profileResult.data as DoctorProfileRow) ?? null);
      setCredentials((credentialsResult.data as DoctorCredentialRow[]) ?? []);
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = doctorProfile?.verification_status ?? 'pending';

  return (
    <DashboardLayout
      title={`Dr. ${profile?.full_name?.replace(/^Dr\.?\s*/i, '') ?? 'Practitioner'}`}
      description="Your professional profile and verification status."
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error.message}
        </div>
      )}

      {!loading && status !== 'verified' && (
        <div
          className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 flex gap-3"
          role="status"
        >
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Verification {status}
            </p>
            <p className="text-sm text-amber-800 mt-1 leading-relaxed">
              {VERIFICATION_COPY[status]}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Professional profile" aside={<StatusPill status={status} />}>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : doctorProfile ? (
            <dl>
              <DataRow label="Specialization" value={doctorProfile.specialization} />
              <DataRow label="Qualification" value={doctorProfile.qualification} />
              <DataRow label="Registration no." value={doctorProfile.registration_number} />
              <DataRow label="Experience" value={`${doctorProfile.experience_years} years`} />
              <DataRow label="Consultation fee" value={`₹${doctorProfile.consultation_fee}`} />
              <DataRow
                label="Verified at"
                value={
                  doctorProfile.verified_at ? (
                    new Date(doctorProfile.verified_at).toLocaleString()
                  ) : (
                    <span className="text-slate-400">—</span>
                  )
                }
              />
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No doctor profile found for this account.</p>
          )}
        </Card>

        <Card
          title="Credentials"
          aside={<span className="text-xs text-slate-400">{credentials.length} uploaded</span>}
        >
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : credentials.length === 0 ? (
            <p className="text-sm text-slate-500 leading-relaxed">
              No credentials uploaded yet. The upload screen arrives with the verification module;
              the private <code>doctor-credentials</code> bucket and its policies are already in
              place.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {credentials.map((cred) => (
                <li key={cred.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{cred.document_name}</p>
                      <p className="text-xs text-slate-500">
                        {cred.credential_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <StatusPill status={cred.verification_status} />
                  </div>
                  {cred.rejection_reason && (
                    <p className="mt-2 text-xs text-red-600">{cred.rejection_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Account">
          <dl>
            <DataRow label="Name" value={profile?.full_name ?? '—'} />
            <DataRow label="Email" value={user?.email ?? '—'} />
            <DataRow label="Role" value={profile?.role ?? '—'} />
          </dl>
        </Card>

        <Card title="Coming in later phases">
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
            <li>Credential upload and availability editor</li>
            <li>Appointment queue and video consultations</li>
            <li>AI-assisted consultation summaries</li>
            <li>Prescription issuing</li>
          </ul>
        </Card>
      </div>
    </DashboardLayout>
  );
}
