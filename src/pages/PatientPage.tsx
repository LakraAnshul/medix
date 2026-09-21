/**
 * /patient — patient area.
 *
 * Every query here is scoped by RLS, not by the filters written below. The
 * `.eq('user_id', user.id)` calls are there for efficiency and clarity; removing
 * them would not expose another patient's row, because the policy already
 * restricts the result set to auth.uid().
 */
import React, {useCallback, useEffect, useState} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import type {PatientProfileRow, VerifiedDoctorRow} from '../lib/database.types';
import {DashboardLayout, Card, DataRow} from './DashboardLayout';

export default function PatientPage() {
  const {user, profile} = useAuth();
  const [clinical, setClinical] = useState<PatientProfileRow | null>(null);
  const [doctors, setDoctors] = useState<VerifiedDoctorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SafeError | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [clinicalResult, doctorsResult] = await Promise.all([
        supabase.from('patient_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        // Reads the narrow public view, never doctor_profiles directly.
        supabase
          .from('verified_doctors')
          .select('*')
          .order('experience_years', {ascending: false})
          .limit(12),
      ]);

      if (clinicalResult.error) throw clinicalResult.error;
      if (doctorsResult.error) throw doctorsResult.error;

      setClinical((clinicalResult.data as PatientProfileRow) ?? null);
      setDoctors((doctorsResult.data as VerifiedDoctorRow[]) ?? []);
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const list = (values: string[] | undefined) =>
    values && values.length > 0 ? values.join(', ') : <span className="text-slate-400">—</span>;

  return (
    <DashboardLayout
      title={`Hello, ${profile?.full_name?.split(' ')[0] ?? 'there'}`}
      description="Your account and health profile. Booking, records and consultations arrive in later phases."
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account">
          <dl>
            <DataRow label="Name" value={profile?.full_name ?? '—'} />
            <DataRow label="Email" value={user?.email ?? '—'} />
            <DataRow label="Role" value={profile?.role ?? '—'} />
            <DataRow label="Phone" value={profile?.phone ?? <span className="text-slate-400">—</span>} />
            <DataRow
              label="Date of birth"
              value={profile?.date_of_birth ?? <span className="text-slate-400">—</span>}
            />
          </dl>
        </Card>

        <Card title="Health profile">
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : clinical ? (
            <dl>
              <DataRow
                label="Height"
                value={clinical.height_cm ? `${clinical.height_cm} cm` : <span className="text-slate-400">—</span>}
              />
              <DataRow
                label="Weight"
                value={clinical.weight_kg ? `${clinical.weight_kg} kg` : <span className="text-slate-400">—</span>}
              />
              <DataRow label="Blood group" value={clinical.blood_group ?? <span className="text-slate-400">—</span>} />
              <DataRow label="Allergies" value={list(clinical.allergies)} />
              <DataRow label="Conditions" value={list(clinical.existing_conditions)} />
              <DataRow label="Medications" value={list(clinical.current_medications)} />
            </dl>
          ) : (
            <p className="text-sm text-slate-500">
              No health profile yet. Editing arrives with the records module.
            </p>
          )}
        </Card>

        <Card
          title="Verified doctors"
          aside={<span className="text-xs text-slate-400">{doctors.length} listed</span>}
        >
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : doctors.length === 0 ? (
            <p className="text-sm text-slate-500 leading-relaxed">
              No verified doctors yet. A doctor becomes bookable only after an administrator approves
              their credentials — <code>role = doctor</code> on its own is never enough.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {doctors.map((doc) => (
                <li key={doc.doctor_id} className="py-3 flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {doc.specialization} · {doc.experience_years} yrs
                    </p>
                  </div>
                  <span className="text-sm font-medium shrink-0">₹{doc.consultation_fee}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Coming in later phases">
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
            <li>Appointment booking and video consultations</li>
            <li>Medical records and report analysis</li>
            <li>Consent management screens</li>
            <li>AI-assisted summaries and risk assessment</li>
          </ul>
        </Card>
      </div>
    </DashboardLayout>
  );
}
