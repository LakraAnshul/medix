/**
 * /doctor — doctor dashboard.
 *
 * Shows verification state and a summary of the doctor's own data. There is no
 * "verify me" control anywhere in this module and no way to add one that would
 * work: doctor_profiles.verification_status is pinned by
 * guard_doctor_profiles_write(), so an UPDATE attempting to change it from a
 * doctor session is rejected with SQLSTATE 42501 regardless of what the UI
 * sends. role = doctor alone never implies verified — the banner below always
 * reads the true verification_status from the database row.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  ShieldOff,
  FileText,
  Clock,
  Stethoscope,
} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import {formatFee} from '../lib/format';
import {doctorCompletion} from '../lib/profileCompletion';
import type {DoctorCredentialRow, DoctorProfileRow} from '../lib/database.types';
import {
  Banner,
  Card,
  CardSkeleton,
  DashboardLayout,
  FadeUp,
  ProgressBar,
  StatusPill,
  secondaryButtonClass,
} from './DashboardLayout';

const VERIFICATION_META: Record<
  string,
  {icon: React.ReactNode; tone: string; title: string; copy: (reason?: string | null) => string}
> = {
  pending: {
    icon: <ShieldAlert className="w-5 h-5 text-amber-600" />,
    tone: 'border-amber-200 bg-amber-50',
    title: 'Your credentials are under review',
    copy: () =>
      'Upload your credentials below, then an administrator will verify them. Until that happens your profile is not listed publicly and cannot be booked.',
  },
  verified: {
    icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
    tone: 'border-emerald-200 bg-emerald-50',
    title: 'Your account is verified',
    copy: () => 'You are listed in the public directory and can be booked by patients.',
  },
  rejected: {
    icon: <ShieldX className="w-5 h-5 text-red-600" />,
    tone: 'border-red-200 bg-red-50',
    title: 'Verification was rejected',
    copy: (reason) =>
      reason
        ? `Reason: ${reason}`
        : 'Check your credentials for a specific reason, then re-upload corrected documents.',
  },
  suspended: {
    icon: <ShieldOff className="w-5 h-5 text-slate-600" />,
    tone: 'border-slate-300 bg-slate-100',
    title: 'Your account is suspended',
    copy: () => 'You are not listed and cannot be booked. Contact an administrator for details.',
  },
};

export default function DoctorPage() {
  const {user, profile} = useAuth();
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileRow | null>(null);
  const [credentials, setCredentials] = useState<DoctorCredentialRow[]>([]);
  const [availabilityCount, setAvailabilityCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SafeError | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [profileResult, credentialsResult, availabilityResult] = await Promise.all([
        supabase.from('doctor_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('doctor_credentials')
          .select('*')
          .eq('doctor_id', user.id)
          .order('created_at', {ascending: false}),
        supabase
          .from('doctor_availability')
          .select('id', {count: 'exact', head: true})
          .eq('doctor_id', user.id)
          .eq('status', 'available')
          .gt('end_time', new Date().toISOString()),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (credentialsResult.error) throw credentialsResult.error;
      if (availabilityResult.error) throw availabilityResult.error;

      setDoctorProfile((profileResult.data as DoctorProfileRow) ?? null);
      setCredentials((credentialsResult.data as DoctorCredentialRow[]) ?? []);
      setAvailabilityCount(availabilityResult.count ?? 0);
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
  const meta = VERIFICATION_META[status] ?? VERIFICATION_META.pending;
  const completion = doctorCompletion(profile, doctorProfile);
  // The reason on the most recently reviewed rejected credential, if any —
  // shown so a rejected doctor sees why without having to open Credentials.
  const latestRejectionReason = credentials.find(
    (c) => c.verification_status === 'rejected' && c.rejection_reason,
  )?.rejection_reason;
  const displayName = profile?.full_name?.replace(/^Dr\.?\s*/i, '') ?? 'Practitioner';

  return (
    <DashboardLayout
      title={`Dr. ${displayName}`}
      description="Your professional profile, verification status and availability at a glance."
    >
      {error && <Banner tone="error">{error.message}</Banner>}

      {!loading && (
        <FadeUp className="mb-6">
          <div className={`rounded-3xl border ${meta.tone} px-5 py-4 flex gap-3`} role="status">
            <div className="shrink-0 mt-0.5">{meta.icon}</div>
            <div>
              <p className="text-sm font-semibold text-[#0f233a]">{meta.title}</p>
              <p className="text-sm text-slate-700 mt-1 leading-relaxed">
                {meta.copy(latestRejectionReason)}
              </p>
            </div>
          </div>
        </FadeUp>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <FadeUp delay={0}>
          <div className="rounded-3xl bg-[#d8effa] border border-transparent p-5">
            <p className="text-2xl font-serif-display text-[#0f233a] font-normal">
              {loading ? '—' : formatFee(doctorProfile?.consultation_fee)}
            </p>
            <p className="text-xs text-slate-600 mt-1">Consultation fee</p>
          </div>
        </FadeUp>
        <FadeUp delay={0.05}>
          <div className="rounded-3xl bg-[#fee9d7] border border-transparent p-5">
            <p className="text-2xl font-serif-display text-[#0f233a] font-normal">
              {loading ? '—' : doctorProfile?.experience_years ?? 0}
            </p>
            <p className="text-xs text-slate-600 mt-1">Years of experience</p>
          </div>
        </FadeUp>
        <FadeUp delay={0.1}>
          <Link to="/doctor/availability" className="block">
            <div className="rounded-3xl bg-[#fddcdb] border border-transparent p-5 hover:shadow-md transition-all duration-300">
              <p className="text-2xl font-serif-display text-[#0f233a] font-normal">
                {loading ? '—' : availabilityCount}
              </p>
              <p className="text-xs text-slate-600 mt-1">Open slots</p>
            </div>
          </Link>
        </FadeUp>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FadeUp delay={0.05}>
          <Card title="Professional profile" aside={<StatusPill status={status} />}>
            {loading ? (
              <CardSkeleton rows={5} />
            ) : doctorProfile ? (
              <>
                <dl className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Specialization</dt>
                    <dd className="font-medium">{doctorProfile.specialization}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Qualification</dt>
                    <dd className="font-medium">{doctorProfile.qualification}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Registration no.</dt>
                    <dd className="font-medium">{doctorProfile.registration_number}</dd>
                  </div>
                </dl>
                <Link to="/doctor/profile" className={secondaryButtonClass}>
                  Edit profile
                </Link>
              </>
            ) : (
              <p className="text-sm text-slate-500">No doctor profile found for this account.</p>
            )}
          </Card>
        </FadeUp>

        <FadeUp delay={0.1}>
          <Card title="Profile completion">
            <ProgressBar
              percent={completion.percent}
              label={`${completion.filled} of ${completion.total} fields`}
            />
            {completion.missing.length > 0 && (
              <p className="text-xs text-slate-500 mt-3">Missing: {completion.missing.join(', ')}.</p>
            )}
          </Card>
        </FadeUp>

        <FadeUp delay={0.05}>
          <Card
            title="Credentials"
            aside={
              <Link to="/doctor/credentials" className="text-xs font-medium text-[#0f233a] hover:underline">
                Manage
              </Link>
            }
          >
            {loading ? (
              <CardSkeleton rows={3} />
            ) : credentials.length === 0 ? (
              <div className="text-center py-4">
                <FileText className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No credentials uploaded yet.</p>
                <Link to="/doctor/credentials" className={`${secondaryButtonClass} mt-3`}>
                  Upload credentials
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {credentials.slice(0, 4).map((cred) => (
                  <li key={cred.id} className="py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm truncate">{cred.document_name}</span>
                    <StatusPill status={cred.verification_status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </FadeUp>

        <FadeUp delay={0.1}>
          <Card
            title="Availability"
            aside={
              <Link to="/doctor/availability" className="text-xs font-medium text-[#0f233a] hover:underline">
                Manage
              </Link>
            }
          >
            <div className="flex items-center gap-3 py-2">
              <div className="w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center text-slate-500">
                <Clock className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {loading ? '—' : `${availabilityCount} open slot${availabilityCount === 1 ? '' : 's'}`}
                </p>
                <p className="text-xs text-slate-400">Upcoming, currently available</p>
              </div>
            </div>
          </Card>
        </FadeUp>
      </div>

      <FadeUp delay={0.15} className="mt-6">
        <Card title="Coming in later phases">
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
            <li>Appointment queue and video consultations</li>
            <li>AI-assisted consultation summaries</li>
            <li>Prescription issuing</li>
          </ul>
        </Card>
      </FadeUp>
    </DashboardLayout>
  );
}
