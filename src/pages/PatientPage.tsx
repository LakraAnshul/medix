/**
 * /patient — patient dashboard.
 *
 * Every query here is scoped by RLS, not by the filters written below. The
 * `.eq('user_id', user.id)` calls are there for efficiency and clarity; removing
 * them would not expose another patient's row, because the policy already
 * restricts the result set to auth.uid().
 *
 * Appointment functionality is Phase 4. The "upcoming consultations" card below
 * is a real empty state, not a placeholder pretending data exists — there is no
 * appointments query here because there is nothing yet for a patient to have
 * booked.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {motion} from 'motion/react';
import {
  CalendarClock,
  FileText,
  Stethoscope,
  UserRound,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import {formatFee} from '../lib/format';
import {patientCompletion} from '../lib/profileCompletion';
import type {PatientProfileRow, VerifiedDoctorRow} from '../lib/database.types';
import {
  Banner,
  Card,
  CardSkeleton,
  DashboardLayout,
  EmptyState,
  EXPO_EASE,
  FadeUp,
  ProgressBar,
  secondaryButtonClass,
} from './DashboardLayout';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

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
          .limit(3),
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

  const completion = patientCompletion(profile, clinical);
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  return (
    <DashboardLayout
      title={`${greeting()}, ${firstName}`}
      description="Here's an overview of your account and health profile."
    >
      {error && <Banner tone="error">{error.message}</Banner>}

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <FadeUp delay={0}>
          <Link to="/patient/profile" className="block group">
            <div className="rounded-3xl bg-[#d8effa] border border-transparent p-5 hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-[#0f233a]">
                  <UserRound className="w-4.5 h-4.5" />
                </div>
                <ArrowRight className="w-4 h-4 text-[#0f233a]/40 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-2xl font-serif-display text-[#0f233a] font-normal">
                {loading ? '—' : `${completion.percent}%`}
              </p>
              <p className="text-xs text-slate-600 mt-1">Profile completion</p>
            </div>
          </Link>
        </FadeUp>

        <FadeUp delay={0.05}>
          <div className="rounded-3xl bg-[#fee9d7] border border-transparent p-5 h-full">
            <div className="w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-[#0f233a] mb-3">
              <CalendarClock className="w-4.5 h-4.5" />
            </div>
            <p className="text-2xl font-serif-display text-[#0f233a] font-normal">0</p>
            <p className="text-xs text-slate-600 mt-1">Upcoming consultations</p>
          </div>
        </FadeUp>

        <FadeUp delay={0.1}>
          <div className="rounded-3xl bg-[#fddcdb] border border-transparent p-5 h-full">
            <div className="w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-[#0f233a] mb-3">
              <FileText className="w-4.5 h-4.5" />
            </div>
            <p className="text-2xl font-serif-display text-[#0f233a] font-normal">0</p>
            <p className="text-xs text-slate-600 mt-1">Medical records</p>
          </div>
        </FadeUp>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <FadeUp delay={0.05}>
            <Card
              title="Upcoming consultations"
              aside={
                <span className="text-xs text-slate-400 px-2 py-1 rounded-full bg-slate-50">
                  Booking arrives in Phase 4
                </span>
              }
            >
              <EmptyState
                icon={<CalendarClock className="w-5 h-5" />}
                title="No upcoming consultations"
                description="Appointment booking is not part of this phase yet. Once it ships, anything you book will appear here."
              />
            </Card>
          </FadeUp>

          <FadeUp delay={0.1}>
            <Card
              title="Available doctors"
              aside={
                <Link to="/doctors" className="text-xs font-medium text-[#0f233a] hover:underline">
                  Browse all
                </Link>
              }
            >
              {loading ? (
                <CardSkeleton rows={3} />
              ) : doctors.length === 0 ? (
                <EmptyState
                  icon={<Stethoscope className="w-5 h-5" />}
                  title="No verified doctors yet"
                  description="A doctor is listed here only after an administrator approves their credentials — role = doctor on its own is never enough."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {doctors.map((doc) => (
                    <motion.li
                      key={doc.doctor_id}
                      initial={{opacity: 0}}
                      animate={{opacity: 1}}
                      transition={{duration: 0.4, ease: EXPO_EASE}}
                      className="py-3"
                    >
                      <Link
                        to={`/doctors/${doc.doctor_id}`}
                        className="flex items-center justify-between gap-4 group"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0f233a] group-hover:underline truncate">
                            {doc.full_name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {doc.specialization} · {doc.experience_years} yrs experience
                          </p>
                        </div>
                        <span className="text-sm font-medium shrink-0">
                          {formatFee(doc.consultation_fee)}
                        </span>
                      </Link>
                    </motion.li>
                  ))}
                </ul>
              )}
            </Card>
          </FadeUp>

          <FadeUp delay={0.15}>
            <Card title="Recent activity">
              <EmptyState
                icon={<ClipboardList className="w-5 h-5" />}
                title="No recent activity"
                description="Actions like booking a consultation or updating your records will show up here."
              />
            </Card>
          </FadeUp>
        </div>

        <div className="space-y-6">
          <FadeUp delay={0.05}>
            <Card title="Profile completion">
              <ProgressBar
                percent={completion.percent}
                label={`${completion.filled} of ${completion.total} fields`}
              />
              {completion.missing.length > 0 && (
                <p className="text-xs text-slate-500 mt-3">
                  Missing: {completion.missing.join(', ')}.
                </p>
              )}
              <Link
                to="/patient/profile"
                className={`${secondaryButtonClass} w-full mt-4`}
              >
                Complete your profile
              </Link>
            </Card>
          </FadeUp>

          <FadeUp delay={0.1}>
            <Card title="Health summary">
              {loading ? (
                <CardSkeleton rows={3} />
              ) : clinical?.blood_group || clinical?.height_cm || clinical?.weight_kg ? (
                <dl className="space-y-2 text-sm">
                  {clinical.blood_group && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Blood group</dt>
                      <dd className="font-medium">{clinical.blood_group}</dd>
                    </div>
                  )}
                  {clinical.height_cm && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Height</dt>
                      <dd className="font-medium">{clinical.height_cm} cm</dd>
                    </div>
                  )}
                  {clinical.weight_kg && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Weight</dt>
                      <dd className="font-medium">{clinical.weight_kg} kg</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <EmptyState
                  title="No health information yet"
                  description="Add your height, weight and blood group from your profile."
                />
              )}
            </Card>
          </FadeUp>
        </div>
      </div>
    </DashboardLayout>
  );
}
