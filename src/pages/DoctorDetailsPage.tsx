/**
 * /doctors/:doctorId — public doctor details.
 *
 * Reads public.verified_doctors by doctor_id. If the id does not resolve to a
 * verified doctor — including a doctor who exists but is pending, rejected or
 * suspended — the view simply returns no row, and this page shows "not found"
 * rather than any information about that account. There is no separate query
 * against doctor_profiles here that could leak more than the view exposes.
 *
 * Availability preview reads doctor_availability filtered to status='available'
 * and doctor_id, which is exactly what the anonymous-facing RLS policy
 * doctor_availability_select_public already allows for a verified doctor — nothing
 * new is opened up by this page.
 *
 * Booking is explicitly not implemented (Phase 4). The CTA below says so.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {motion} from 'motion/react';
import {ArrowLeft, BadgeCheck, CalendarClock, Sparkles} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import {formatFee, formatTimeRange, formatDateLabel} from '../lib/format';
import type {DoctorAvailabilityRow, VerifiedDoctorRow} from '../lib/database.types';
import {Navbar} from '../components/Navbar';
import {NavbarAuthButtons} from '../components/NavbarAuthButtons';
import {Footer} from '../components/Footer';
import {EXPO_EASE} from './DashboardLayout';

export default function DoctorDetailsPage() {
  const {doctorId} = useParams<{doctorId: string}>();
  const navigate = useNavigate();
  const goToLandingSection = (sectionId: string) => navigate(`/#${sectionId}`);

  const [doctor, setDoctor] = useState<VerifiedDoctorRow | null | undefined>(undefined);
  const [slots, setSlots] = useState<DoctorAvailabilityRow[]>([]);
  const [error, setError] = useState<SafeError | null>(null);

  const load = useCallback(async () => {
    if (!doctorId) return;
    setError(null);
    try {
      const [doctorResult, slotsResult] = await Promise.all([
        supabase.from('verified_doctors').select('*').eq('doctor_id', doctorId).maybeSingle(),
        supabase
          .from('doctor_availability')
          .select('*')
          .eq('doctor_id', doctorId)
          .eq('status', 'available')
          .gt('end_time', new Date().toISOString())
          .order('start_time', {ascending: true})
          .limit(5),
      ]);
      if (doctorResult.error) throw doctorResult.error;
      if (slotsResult.error) throw slotsResult.error;

      setDoctor((doctorResult.data as VerifiedDoctorRow) ?? null);
      setSlots((slotsResult.data as DoctorAvailabilityRow[]) ?? []);
    } catch (caught) {
      setError(toSafeError(caught));
      setDoctor(null);
    }
  }, [doctorId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#0f233a] font-sans flex flex-col selection:bg-[#fcd7d3] selection:text-[#0f233a]">
      <Navbar
        onOpenBooking={() => navigate('/')}
        onOpenHelpCenter={() => navigate('/')}
        onNavigate={goToLandingSection}
        authSlot={<NavbarAuthButtons />}
        mobileAuthSlot={<NavbarAuthButtons variant="mobile" />}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <Link
          to="/doctors"
          className="text-sm text-slate-500 hover:text-[#0f233a] inline-flex items-center gap-1.5 mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to all doctors
        </Link>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6" role="alert">
            {error.message}
          </div>
        )}

        {doctor === undefined ? (
          <div className="rounded-3xl bg-white border border-slate-200/80 p-8 animate-pulse">
            <div className="h-7 w-1/2 bg-slate-100 rounded-lg mb-3" />
            <div className="h-4 w-1/3 bg-slate-100 rounded-lg mb-8" />
            <div className="h-3 w-full bg-slate-100 rounded-lg mb-2" />
            <div className="h-3 w-4/5 bg-slate-100 rounded-lg" />
          </div>
        ) : doctor === null ? (
          <div className="rounded-3xl bg-white border border-slate-200/80 p-10 text-center">
            <p className="text-sm font-medium text-slate-600">Doctor not found</p>
            <p className="text-xs text-slate-400 mt-1">
              This doctor may not exist, or is not currently verified.
            </p>
          </div>
        ) : (
          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.5, ease: EXPO_EASE}}
          >
            <div className="rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-10">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <h1 className="font-serif-display text-3xl sm:text-4xl text-[#0f233a] font-normal">
                      {doctor.full_name}
                    </h1>
                    <BadgeCheck
                      className="w-6 h-6 text-emerald-600 shrink-0"
                      aria-label="Verified doctor"
                    />
                  </div>
                  <p className="text-slate-500 text-sm sm:text-base">
                    {doctor.specialization} · {doctor.qualification}
                  </p>
                </div>
                <span className="hidden sm:inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
                  Verified
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                <div className="rounded-2xl bg-[#d8effa] p-4">
                  <p className="text-xl font-serif-display text-[#0f233a] font-normal">
                    {doctor.experience_years}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">Years experience</p>
                </div>
                <div className="rounded-2xl bg-[#fee9d7] p-4">
                  <p className="text-xl font-serif-display text-[#0f233a] font-normal">
                    {formatFee(doctor.consultation_fee)}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">Consultation fee</p>
                </div>
                <div className="rounded-2xl bg-[#fddcdb] p-4 col-span-2 sm:col-span-1">
                  <p className="text-xl font-serif-display text-[#0f233a] font-normal">
                    {slots.length}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">Open slots (preview)</p>
                </div>
              </div>

              {doctor.bio && (
                <div className="mb-8">
                  <h2 className="font-serif-display text-lg text-[#0f233a] font-normal mb-2">About</h2>
                  <p className="text-sm text-slate-600 leading-relaxed">{doctor.bio}</p>
                </div>
              )}

              <div className="mb-8">
                <h2 className="font-serif-display text-lg text-[#0f233a] font-normal mb-3">
                  Availability preview
                </h2>
                {slots.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No open slots published right now. Check back soon.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {slots.map((slot) => (
                      <li
                        key={slot.id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <CalendarClock className="w-4 h-4 text-slate-400 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{formatDateLabel(slot.start_time)}</p>
                          <p className="text-xs text-slate-500">
                            {formatTimeRange(slot.start_time, slot.end_time)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 px-5 py-4 flex items-center gap-3">
                <Sparkles className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Booking coming next</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Appointment scheduling for this doctor is not available yet in this phase.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      <Footer
        onNavigate={goToLandingSection}
        onOpenBooking={() => navigate('/')}
        onOpenHelpCenter={() => navigate('/')}
      />
    </div>
  );
}
