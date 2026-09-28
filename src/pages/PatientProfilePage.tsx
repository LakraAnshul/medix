/**
 * /patient/profile — view and edit personal + health information.
 *
 * SECURITY: every write here is scoped to the caller's own row by the RLS
 * policies (profiles_update_own, patient_profiles_update_own), which compare
 * against auth.uid() — not against any id this component sends. Client-side
 * validation below exists purely for a fast, friendly error message; the
 * database CHECK constraints (see supabase/migrations/002 and 003) are what
 * actually make an invalid value impossible to store, and toSafeError() turns a
 * constraint violation into readable text if a check is ever missed here.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft, Save} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, validate, type SafeError} from '../lib/errors';
import {patientCompletion} from '../lib/profileCompletion';
import type {
  BloodGroup,
  GenderType,
  PatientProfileRow,
  PatientProfileUpdate,
  ProfileRow,
  ProfileUpdate,
} from '../lib/database.types';
import {
  Banner,
  Card,
  CardSkeleton,
  DashboardLayout,
  FadeUp,
  FieldErrorText,
  ProgressBar,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
} from './DashboardLayout';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];
const GENDERS: {value: GenderType; label: string}[] = [
  {value: 'female', label: 'Female'},
  {value: 'male', label: 'Male'},
  {value: 'other', label: 'Other'},
  {value: 'prefer_not_to_say', label: 'Prefer not to say'},
];

/** A string[] column edited as one comma-separated line; parsed back to a clean array on save. */
function parseListInput(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface FormState {
  full_name: string;
  date_of_birth: string;
  gender: GenderType | '';
  phone: string;
  height_cm: string;
  weight_kg: string;
  blood_group: BloodGroup | '';
  allergies: string;
  existing_conditions: string;
  current_medications: string;
}

const EMPTY_FORM: FormState = {
  full_name: '',
  date_of_birth: '',
  gender: '',
  phone: '',
  height_cm: '',
  weight_kg: '',
  blood_group: '',
  allergies: '',
  existing_conditions: '',
  current_medications: '',
};

function toFormState(profile: ProfileRow | null, clinical: PatientProfileRow | null): FormState {
  return {
    full_name: profile?.full_name ?? '',
    date_of_birth: profile?.date_of_birth ?? '',
    gender: profile?.gender ?? '',
    phone: profile?.phone ?? '',
    height_cm: clinical?.height_cm != null ? String(clinical.height_cm) : '',
    weight_kg: clinical?.weight_kg != null ? String(clinical.weight_kg) : '',
    blood_group: clinical?.blood_group ?? '',
    allergies: (clinical?.allergies ?? []).join(', '),
    existing_conditions: (clinical?.existing_conditions ?? []).join(', '),
    current_medications: (clinical?.current_medications ?? []).join(', '),
  };
}

export default function PatientProfilePage() {
  const {user, profile, refreshProfile} = useAuth();
  const [clinical, setClinical] = useState<PatientProfileRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SafeError | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const {data, error: fetchError} = await supabase
        .from('patient_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      setClinical((data as PatientProfileRow) ?? null);
      setForm(toFormState(profile, (data as PatientProfileRow) ?? null));
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setLoading(false);
    }
    // profile is intentionally read but not a dependency: it comes from
    // AuthProvider and is refreshed explicitly after a successful save, so
    // re-running this effect on every profile tick would fight the form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({...f, [key]: value}));
    setSuccess(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSuccess(false);
    setError(null);

    const nextErrors: Partial<Record<keyof FormState, string>> = {
      full_name: validate.fullNameRequired(form.full_name) ?? undefined,
      date_of_birth: validate.dateOfBirth(form.date_of_birth) ?? undefined,
      phone: validate.phone(form.phone) ?? undefined,
      height_cm: validate.heightCm(form.height_cm) ?? undefined,
      weight_kg: validate.weightKg(form.weight_kg) ?? undefined,
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSaving(true);
    try {
      const profilePatch: ProfileUpdate = {
        full_name: form.full_name.trim(),
        date_of_birth: form.date_of_birth || null,
        gender: (form.gender || null) as GenderType | null,
        phone: form.phone.trim() || null,
      };
      const clinicalPatch: PatientProfileUpdate = {
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        blood_group: (form.blood_group || null) as BloodGroup | null,
        allergies: parseListInput(form.allergies),
        existing_conditions: parseListInput(form.existing_conditions),
        current_medications: parseListInput(form.current_medications),
      };

      const [profileResult, clinicalResult] = await Promise.all([
        supabase.from('profiles').update(profilePatch).eq('id', user.id),
        clinical
          ? supabase.from('patient_profiles').update(clinicalPatch).eq('user_id', user.id)
          : supabase.from('patient_profiles').insert({user_id: user.id, ...clinicalPatch}),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (clinicalResult.error) throw clinicalResult.error;

      await refreshProfile();
      await load();
      setSuccess(true);
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setSaving(false);
    }
  };

  const completion = patientCompletion(profile, clinical);

  return (
    <DashboardLayout
      title="Your profile"
      description="Keep your personal and health information up to date."
    >
      <FadeUp className="mb-6">
        <Card title="Profile completion">
          <ProgressBar percent={completion.percent} label={`${completion.filled} of ${completion.total} fields`} />
          {completion.missing.length > 0 && (
            <p className="text-xs text-slate-500 mt-3">
              Still missing: {completion.missing.join(', ')}.
            </p>
          )}
        </Card>
      </FadeUp>

      {error && <Banner tone="error">{error.message}</Banner>}
      {success && <Banner tone="success">Your profile has been updated.</Banner>}

      {loading ? (
        <Card title="Loading">
          <CardSkeleton rows={6} />
        </Card>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid gap-6 lg:grid-cols-2">
            <FadeUp delay={0.05}>
              <Card title="Personal information">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="full_name" className={fieldLabelClass}>
                      Full name
                    </label>
                    <input
                      id="full_name"
                      className={fieldInputClass}
                      value={form.full_name}
                      onChange={(e) => set('full_name', e.target.value)}
                      aria-invalid={Boolean(fieldErrors.full_name)}
                      aria-describedby={fieldErrors.full_name ? 'full_name-error' : undefined}
                      disabled={saving}
                    />
                    <FieldErrorText id="full_name-error" message={fieldErrors.full_name} />
                  </div>

                  <div>
                    <label htmlFor="date_of_birth" className={fieldLabelClass}>
                      Date of birth
                    </label>
                    <input
                      id="date_of_birth"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      className={fieldInputClass}
                      value={form.date_of_birth}
                      onChange={(e) => set('date_of_birth', e.target.value)}
                      aria-invalid={Boolean(fieldErrors.date_of_birth)}
                      aria-describedby={fieldErrors.date_of_birth ? 'dob-error' : undefined}
                      disabled={saving}
                    />
                    <FieldErrorText id="dob-error" message={fieldErrors.date_of_birth} />
                  </div>

                  <div>
                    <label htmlFor="gender" className={fieldLabelClass}>
                      Gender
                    </label>
                    <select
                      id="gender"
                      className={fieldInputClass}
                      value={form.gender}
                      onChange={(e) => set('gender', e.target.value as GenderType | '')}
                      disabled={saving}
                    >
                      <option value="">Select…</option>
                      {GENDERS.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="phone" className={fieldLabelClass}>
                      Phone
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      placeholder="+919876543210"
                      className={fieldInputClass}
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                      disabled={saving}
                    />
                    <FieldErrorText id="phone-error" message={fieldErrors.phone} />
                  </div>
                </div>
              </Card>
            </FadeUp>

            <FadeUp delay={0.1}>
              <Card title="Health information">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="height_cm" className={fieldLabelClass}>
                        Height (cm)
                      </label>
                      <input
                        id="height_cm"
                        type="number"
                        min={0}
                        step="0.1"
                        inputMode="decimal"
                        className={fieldInputClass}
                        value={form.height_cm}
                        onChange={(e) => set('height_cm', e.target.value)}
                        aria-invalid={Boolean(fieldErrors.height_cm)}
                        aria-describedby={fieldErrors.height_cm ? 'height-error' : undefined}
                        disabled={saving}
                      />
                      <FieldErrorText id="height-error" message={fieldErrors.height_cm} />
                    </div>
                    <div>
                      <label htmlFor="weight_kg" className={fieldLabelClass}>
                        Weight (kg)
                      </label>
                      <input
                        id="weight_kg"
                        type="number"
                        min={0}
                        step="0.1"
                        inputMode="decimal"
                        className={fieldInputClass}
                        value={form.weight_kg}
                        onChange={(e) => set('weight_kg', e.target.value)}
                        aria-invalid={Boolean(fieldErrors.weight_kg)}
                        aria-describedby={fieldErrors.weight_kg ? 'weight-error' : undefined}
                        disabled={saving}
                      />
                      <FieldErrorText id="weight-error" message={fieldErrors.weight_kg} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="blood_group" className={fieldLabelClass}>
                      Blood group
                    </label>
                    <select
                      id="blood_group"
                      className={fieldInputClass}
                      value={form.blood_group}
                      onChange={(e) => set('blood_group', e.target.value as BloodGroup | '')}
                      disabled={saving}
                    >
                      <option value="">Select…</option>
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>
                          {bg === 'unknown' ? 'Unknown' : bg}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="allergies" className={fieldLabelClass}>
                      Allergies
                    </label>
                    <input
                      id="allergies"
                      className={fieldInputClass}
                      placeholder="Comma-separated, e.g. Penicillin, Peanuts"
                      value={form.allergies}
                      onChange={(e) => set('allergies', e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label htmlFor="existing_conditions" className={fieldLabelClass}>
                      Existing conditions
                    </label>
                    <input
                      id="existing_conditions"
                      className={fieldInputClass}
                      placeholder="Comma-separated, e.g. Asthma"
                      value={form.existing_conditions}
                      onChange={(e) => set('existing_conditions', e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label htmlFor="current_medications" className={fieldLabelClass}>
                      Current medications
                    </label>
                    <input
                      id="current_medications"
                      className={fieldInputClass}
                      placeholder="Comma-separated"
                      value={form.current_medications}
                      onChange={(e) => set('current_medications', e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
              </Card>
            </FadeUp>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button type="submit" className={primaryButtonClass} disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <Link
              to="/patient"
              className="text-sm text-slate-500 hover:text-[#0f233a] inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to dashboard
            </Link>
          </div>
        </form>
      )}
    </DashboardLayout>
  );
}
