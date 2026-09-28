/**
 * /admin/doctors/:doctorId — full review detail for a single doctor.
 *
 * SECURITY
 *   - Reachable only by an authenticated admin session per ProtectedRoute, but
 *     that is navigation only. What actually protects this data: every query
 *     below is subject to doctor_profiles_select_admin /
 *     doctor_credentials_select_admin (RLS calling public.is_admin()), and the
 *     `doctorId` route param is never trusted as an authorization decision — a
 *     patient forcing this URL open gets a page shell with a permission error,
 *     because doctor_profiles/doctor_credentials simply return nothing to them.
 *   - Credential documents are previewed via a short-lived signed URL created by
 *     doctor_credentials_select_admin on storage.objects, generated fresh on
 *     click rather than stored, and never turned into a public URL.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {ArrowLeft, ExternalLink, FileText} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import {formatFee} from '../lib/format';
import {BUCKETS} from '../lib/database.types';
import type {DoctorCredentialRow, DoctorProfileRow, ProfileRow} from '../lib/database.types';
import {
  Banner,
  Card,
  CardSkeleton,
  DashboardLayout,
  DataRow,
  EmptyState,
  FadeUp,
  StatusPill,
} from './DashboardLayout';

const SIGNED_URL_TTL_SECONDS = 60;

export default function AdminDoctorReviewPage() {
  const {doctorId} = useParams<{doctorId: string}>();
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileRow | null>(null);
  const [personProfile, setPersonProfile] = useState<ProfileRow | null>(null);
  const [credentials, setCredentials] = useState<DoctorCredentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SafeError | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    setError(null);
    try {
      const [doctorResult, personResult, credentialsResult] = await Promise.all([
        supabase.from('doctor_profiles').select('*').eq('user_id', doctorId).maybeSingle(),
        supabase.from('profiles').select('*').eq('id', doctorId).maybeSingle(),
        supabase
          .from('doctor_credentials')
          .select('*')
          .eq('doctor_id', doctorId)
          .order('created_at', {ascending: false}),
      ]);
      if (doctorResult.error) throw doctorResult.error;
      if (personResult.error) throw personResult.error;
      if (credentialsResult.error) throw credentialsResult.error;

      setDoctorProfile((doctorResult.data as DoctorProfileRow) ?? null);
      setPersonProfile((personResult.data as ProfileRow) ?? null);
      setCredentials((credentialsResult.data as DoctorCredentialRow[]) ?? []);
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const previewCredential = async (credential: DoctorCredentialRow) => {
    setPreviewingId(credential.id);
    setError(null);
    try {
      const {data, error: signError} = await supabase.storage
        .from(BUCKETS.doctorCredentials)
        .createSignedUrl(credential.document_path, SIGNED_URL_TTL_SECONDS);
      if (signError) throw signError;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setPreviewingId(null);
    }
  };

  if (!doctorId) return null;

  return (
    <DashboardLayout
      title={loading ? 'Doctor review' : personProfile?.full_name ?? 'Doctor review'}
      description="Review the doctor's professional details and submitted credentials."
    >
      <div className="mb-4">
        <Link
          to="/admin"
          className="text-sm text-slate-500 hover:text-[#0f233a] inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to admin dashboard
        </Link>
      </div>

      {error && <Banner tone="error">{error.message}</Banner>}

      {loading ? (
        <Card title="Loading">
          <CardSkeleton rows={6} />
        </Card>
      ) : !doctorProfile ? (
        <Card title="Not found">
          <EmptyState title="No doctor found for this id" />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <FadeUp>
            <Card title="Professional details" aside={<StatusPill status={doctorProfile.verification_status} />}>
              <dl>
                <DataRow label="Name" value={personProfile?.full_name ?? '—'} />
                <DataRow label="Specialization" value={doctorProfile.specialization} />
                <DataRow label="Qualification" value={doctorProfile.qualification} />
                <DataRow label="Registration no." value={doctorProfile.registration_number} />
                <DataRow label="Experience" value={`${doctorProfile.experience_years} years`} />
                <DataRow label="Consultation fee" value={formatFee(doctorProfile.consultation_fee)} />
                <DataRow
                  label="Submitted"
                  value={new Date(doctorProfile.created_at).toLocaleDateString()}
                />
                {doctorProfile.bio && <DataRow label="Bio" value={doctorProfile.bio} />}
              </dl>
            </Card>
          </FadeUp>

          <FadeUp delay={0.05}>
            <Card
              title="Submitted credentials"
              aside={<span className="text-xs text-slate-400">{credentials.length} document(s)</span>}
            >
              {credentials.length === 0 ? (
                <EmptyState
                  icon={<FileText className="w-5 h-5" />}
                  title="No credentials submitted"
                  description="This doctor has not uploaded any verification documents yet."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {credentials.map((cred) => (
                    <li key={cred.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{cred.document_name}</p>
                        <p className="text-xs text-slate-500 capitalize">
                          {cred.credential_type.replace(/_/g, ' ')} ·{' '}
                          {new Date(cred.created_at).toLocaleDateString()}
                        </p>
                        {cred.rejection_reason && (
                          <p className="text-xs text-red-600 mt-1">{cred.rejection_reason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusPill status={cred.verification_status} />
                        <button
                          onClick={() => void previewCredential(cred)}
                          disabled={previewingId === cred.id}
                          className="p-2 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-50"
                          aria-label={`Preview ${cred.document_name}`}
                          title="Open document (link expires in 60 seconds)"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </FadeUp>
        </div>
      )}
    </DashboardLayout>
  );
}
