/**
 * /doctor/profile — edit the doctor's own professional profile.
 *
 * SECURITY: `verification_status`, `reviewed_by`, `reviewed_at` and
 * `rejection_reason` live on doctor_credentials/doctor_profiles but are never
 * rendered here as inputs. That is enforced twice: `DoctorProfileSelfUpdate` in
 * database.types.ts does not include verification_status in its type, and even
 * if this component were edited to send it anyway,
 * guard_doctor_profiles_write() rejects the write server-side with SQLSTATE
 * 42501 for any non-admin session. The UI omission is a UX choice; the database
 * is the actual boundary.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft, Save} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, validate, type SafeError} from '../lib/errors';
import {doctorCompletion} from '../lib/profileCompletion';
import {SUGGESTED_SPECIALIZATIONS} from '../lib/specializations';
import type {
  DoctorProfileInsert,
  DoctorProfileRow,
  DoctorProfileSelfUpdate,
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
  StatusPill,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
} from './DashboardLayout';

interface FormState {
  full_name: string;
  phone: string;
  specialization: string;
  qualification: string;
  registration_number: string;
  experience_years: string;
  consultation_fee: string;
  bio: string;
}

export default function DoctorProfilePage() {
  const {user, profile, refreshProfile} = useAuth();
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileRow | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
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
        .from('doctor_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      const row = (data as DoctorProfileRow) ?? null;
      setDoctorProfile(row);
      setForm({
        full_name: profile?.full_name ?? '',
        phone: profile?.phone ?? '',
        specialization: row?.specialization ?? '',
        qualification: row?.qualification ?? '',
        registration_number: row?.registration_number ?? '',
        experience_years: row ? String(row.experience_years) : '',
        consultation_fee: row ? String(row.consultation_fee) : '',
        bio: row?.bio ?? '',
      });
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => (f ? {...f, [key]: value} : f));
    setSuccess(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !form) return;
    setSuccess(false);
    setError(null);

    const nextErrors: Partial<Record<keyof FormState, string>> = {
      full_name: validate.fullNameRequired(form.full_name) ?? undefined,
      phone: validate.phone(form.phone) ?? undefined,
      specialization: validate.specialization(form.specialization) ?? undefined,
      qualification: validate.qualification(form.qualification) ?? undefined,
      registration_number: validate.registrationNumber(form.registration_number) ?? undefined,
      experience_years: validate.experienceYears(form.experience_years) ?? undefined,
      consultation_fee: validate.consultationFee(form.consultation_fee) ?? undefined,
      bio: validate.bio(form.bio) ?? undefined,
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSaving(true);
    try {
      const profilePatch: ProfileUpdate = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
      };
      // Deliberately typed as DoctorProfileSelfUpdate/DoctorProfileInsert: neither
      // type has a verification_status member, so it is not possible to
      // accidentally wire that field up here later without a compile error.
      const doctorFields = {
        specialization: form.specialization.trim(),
        qualification: form.qualification.trim(),
        registration_number: form.registration_number.trim(),
        experience_years: Number(form.experience_years),
        consultation_fee: Number(form.consultation_fee),
        bio: form.bio.trim() || null,
      } satisfies DoctorProfileSelfUpdate;

      const [profileResult, doctorResult] = await Promise.all([
        supabase.from('profiles').update(profilePatch).eq('id', user.id),
        doctorProfile
          ? supabase.from('doctor_profiles').update(doctorFields).eq('user_id', user.id)
          : supabase.from('doctor_profiles').insert({
              user_id: user.id,
              ...doctorFields,
            } satisfies DoctorProfileInsert),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (doctorResult.error) throw doctorResult.error;

      await refreshProfile();
      await load();
      setSuccess(true);
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setSaving(false);
    }
  };

  const completion = doctorCompletion(profile, doctorProfile);

  return (
    <DashboardLayout
      title="Professional profile"
      description="This information is shown to patients once your account is verified."
    >
      <FadeUp className="mb-6">
        <Card
          title="Profile completion"
          aside={<StatusPill status={doctorProfile?.verification_status ?? 'pending'} />}
        >
          <ProgressBar
            percent={completion.percent}
            label={`${completion.filled} of ${completion.total} fields`}
          />
        </Card>
      </FadeUp>

      {error && <Banner tone="error">{error.message}</Banner>}
      {success && <Banner tone="success">Your profile has been updated.</Banner>}

      {loading || !form ? (
        <Card title="Loading">
          <CardSkeleton rows={6} />
        </Card>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <FadeUp delay={0.05}>
            <Card title="Details">
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <label htmlFor="phone" className={fieldLabelClass}>
                    Phone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    className={fieldInputClass}
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                    disabled={saving}
                  />
                  <FieldErrorText id="phone-error" message={fieldErrors.phone} />
                </div>

                <div>
                  <label htmlFor="specialization" className={fieldLabelClass}>
                    Specialization
                  </label>
                  <input
                    id="specialization"
                    className={fieldInputClass}
                    list="specialization-suggestions"
                    value={form.specialization}
                    onChange={(e) => set('specialization', e.target.value)}
                    aria-invalid={Boolean(fieldErrors.specialization)}
                    aria-describedby={fieldErrors.specialization ? 'spec-error' : undefined}
                    disabled={saving}
                  />
                  <datalist id="specialization-suggestions">
                    {SUGGESTED_SPECIALIZATIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <FieldErrorText id="spec-error" message={fieldErrors.specialization} />
                </div>

                <div>
                  <label htmlFor="qualification" className={fieldLabelClass}>
                    Qualification
                  </label>
                  <input
                    id="qualification"
                    className={fieldInputClass}
                    placeholder="MBBS, MD"
                    value={form.qualification}
                    onChange={(e) => set('qualification', e.target.value)}
                    aria-invalid={Boolean(fieldErrors.qualification)}
                    aria-describedby={fieldErrors.qualification ? 'qual-error' : undefined}
                    disabled={saving}
                  />
                  <FieldErrorText id="qual-error" message={fieldErrors.qualification} />
                </div>

                <div>
                  <label htmlFor="registration_number" className={fieldLabelClass}>
                    Medical registration number
                  </label>
                  <input
                    id="registration_number"
                    className={fieldInputClass}
                    value={form.registration_number}
                    onChange={(e) => set('registration_number', e.target.value)}
                    aria-invalid={Boolean(fieldErrors.registration_number)}
                    aria-describedby={fieldErrors.registration_number ? 'reg-error' : undefined}
                    disabled={saving}
                  />
                  <FieldErrorText id="reg-error" message={fieldErrors.registration_number} />
                  <p className="mt-1.5 text-xs text-slate-400">
                    Changing this may require re-verification. It must be unique across all doctors.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="experience_years" className={fieldLabelClass}>
                      Experience (years)
                    </label>
                    <input
                      id="experience_years"
                      type="number"
                      min={0}
                      max={70}
                      className={fieldInputClass}
                      value={form.experience_years}
                      onChange={(e) => set('experience_years', e.target.value)}
                      aria-invalid={Boolean(fieldErrors.experience_years)}
                      aria-describedby={fieldErrors.experience_years ? 'exp-error' : undefined}
                      disabled={saving}
                    />
                    <FieldErrorText id="exp-error" message={fieldErrors.experience_years} />
                  </div>
                  <div>
                    <label htmlFor="consultation_fee" className={fieldLabelClass}>
                      Consultation fee (₹)
                    </label>
                    <input
                      id="consultation_fee"
                      type="number"
                      min={0}
                      step="0.01"
                      className={fieldInputClass}
                      value={form.consultation_fee}
                      onChange={(e) => set('consultation_fee', e.target.value)}
                      aria-invalid={Boolean(fieldErrors.consultation_fee)}
                      aria-describedby={fieldErrors.consultation_fee ? 'fee-error' : undefined}
                      disabled={saving}
                    />
                    <FieldErrorText id="fee-error" message={fieldErrors.consultation_fee} />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="bio" className={fieldLabelClass}>
                  Bio
                </label>
                <textarea
                  id="bio"
                  rows={4}
                  className={fieldInputClass}
                  placeholder="A short introduction patients will see on your public profile."
                  value={form.bio}
                  onChange={(e) => set('bio', e.target.value)}
                  aria-invalid={Boolean(fieldErrors.bio)}
                  aria-describedby={fieldErrors.bio ? 'bio-error' : undefined}
                  disabled={saving}
                  maxLength={4000}
                />
                <div className="flex justify-between mt-1">
                  <FieldErrorText id="bio-error" message={fieldErrors.bio} />
                  <span className="text-xs text-slate-400">{form.bio.length}/4000</span>
                </div>
              </div>
            </Card>
          </FadeUp>

          <div className="mt-6 flex items-center gap-3">
            <button type="submit" className={primaryButtonClass} disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <Link
              to="/doctor"
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
