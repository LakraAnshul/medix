/**
 * /doctor/availability — publish and manage bookable time windows.
 *
 * SECURITY / CORRECTNESS
 *   - Overlap prevention is a GiST EXCLUDE constraint (doctor_availability_no_overlap,
 *     migration 006), not a client-side check. The pre-flight check below exists
 *     only to give a fast, specific error before round-tripping to the server;
 *     the database is what actually makes two overlapping windows impossible,
 *     including under concurrent requests.
 *   - There is no DELETE policy on doctor_availability (see migration 011) —
 *     removing a slot means setting status = 'blocked', which is exposed here as
 *     "Block" rather than a delete button, so the UI does not imply an operation
 *     the database does not support.
 *   - doctor_id is always the authenticated user's own id; doctor_availability_insert_own
 *     / _update_own re-check that server-side regardless of what this component sends.
 *
 * TIMEZONE
 *   start_time/end_time are timestamptz, stored as an absolute instant. The form
 *   uses <input type="datetime-local">, which has no timezone of its own — the
 *   browser's local zone is used both when the doctor types a time in and when
 *   any time is displayed back, and the abbreviation is always shown
 *   (formatTimeRange) so it is never ambiguous whether a slot reads in the
 *   doctor's local clock or a server default.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {motion} from 'motion/react';
import {ArrowLeft, CalendarPlus, Ban, Clock} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import {
  WEEKDAY_LABELS,
  formatDateLabel,
  formatTimeRange,
  isoToLocalInput,
  localInputToIso,
  weekdayKey,
} from '../lib/format';
import type {DoctorAvailabilityRow} from '../lib/database.types';
import {
  Banner,
  Card,
  CardSkeleton,
  DashboardLayout,
  EmptyState,
  EXPO_EASE,
  FadeUp,
  FieldErrorText,
  StatusPill,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './DashboardLayout';

const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_HOURS = 12;

export default function DoctorAvailabilityPage() {
  const {user} = useAuth();
  const [slots, setSlots] = useState<DoctorAvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SafeError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const {data, error: fetchError} = await supabase
        .from('doctor_availability')
        .select('*')
        .eq('doctor_id', user.id)
        .order('start_time', {ascending: true});
      if (fetchError) throw fetchError;
      setSlots((data as DoctorAvailabilityRow[]) ?? []);
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const upcoming = slots.filter((s) => new Date(s.end_time) > new Date());
    const byDay = new Map<number, DoctorAvailabilityRow[]>();
    for (const slot of upcoming) {
      const key = weekdayKey(slot.start_time);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(slot);
    }
    return byDay;
  }, [slots]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setNotice(null);
    setError(null);
    setFormError(null);

    const startIso = localInputToIso(start);
    const endIso = localInputToIso(end);

    if (!startIso || !endIso) {
      setFormError('Enter both a start and end time.');
      return;
    }
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);

    // Client-side pre-check mirroring the database CHECK constraints, purely for
    // a fast message — the EXCLUDE constraint and the CHECKs are what actually
    // enforce this.
    if (endDate <= startDate) {
      setFormError('End time must be after the start time.');
      return;
    }
    if (startDate <= new Date()) {
      setFormError('Availability must start in the future.');
      return;
    }
    const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000;
    if (durationMinutes < MIN_DURATION_MINUTES) {
      setFormError(`The window must be at least ${MIN_DURATION_MINUTES} minutes long.`);
      return;
    }
    if (durationMinutes > MAX_DURATION_HOURS * 60) {
      setFormError(`The window cannot be longer than ${MAX_DURATION_HOURS} hours.`);
      return;
    }

    setSaving(true);
    try {
      const {error: insertError} = await supabase.from('doctor_availability').insert({
        doctor_id: user.id,
        start_time: startIso,
        end_time: endIso,
      });
      if (insertError) throw insertError;
      setNotice('Availability added.');
      setStart('');
      setEnd('');
      await load();
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: 'available' | 'blocked') => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const {error: updateError} = await supabase
        .from('doctor_availability')
        .update({status})
        .eq('id', id);
      if (updateError) throw updateError;
      setNotice(status === 'blocked' ? 'Slot blocked.' : 'Slot re-opened.');
      await load();
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setBusyId(null);
    }
  };

  const orderedDays = [1, 2, 3, 4, 5, 6, 0]; // Monday-first, matching the weekly-schedule mockup

  return (
    <DashboardLayout
      title="Availability"
      description="Publish the time windows patients will be able to book once appointments launch."
    >
      {error && <Banner tone="error">{error.message}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FadeUp>
            <Card
              title="Weekly schedule"
              aside={<span className="text-xs text-slate-400">Times shown in your local timezone</span>}
            >
              {loading ? (
                <CardSkeleton rows={5} />
              ) : slots.filter((s) => new Date(s.end_time) > new Date()).length === 0 ? (
                <EmptyState
                  icon={<Clock className="w-5 h-5" />}
                  title="No availability configured"
                  description="Add a time window using the form to start building your schedule."
                />
              ) : (
                <div className="space-y-5">
                  {orderedDays.map((day) => {
                    const daySlots = grouped.get(day);
                    if (!daySlots || daySlots.length === 0) return null;
                    return (
                      <div key={day}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                          {WEEKDAY_LABELS[day]}
                        </p>
                        <div className="space-y-2">
                          {daySlots
                            .sort((a, b) => a.start_time.localeCompare(b.start_time))
                            .map((slot) => (
                              <motion.div
                                key={slot.id}
                                initial={{opacity: 0, x: -8}}
                                animate={{opacity: 1, x: 0}}
                                transition={{duration: 0.3, ease: EXPO_EASE}}
                                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-[#0f233a]">
                                    {formatTimeRange(slot.start_time, slot.end_time)}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {formatDateLabel(slot.start_time)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <StatusPill status={slot.status} />
                                  {slot.status === 'available' ? (
                                    <button
                                      onClick={() => void setStatus(slot.id, 'blocked')}
                                      disabled={busyId === slot.id}
                                      className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-red-600 disabled:opacity-50"
                                      aria-label="Block this slot"
                                      title="Block this slot"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </button>
                                  ) : slot.status === 'blocked' ? (
                                    <button
                                      onClick={() => void setStatus(slot.id, 'available')}
                                      disabled={busyId === slot.id}
                                      className="text-xs font-medium text-[#0f233a] hover:underline disabled:opacity-50"
                                    >
                                      Re-open
                                    </button>
                                  ) : null}
                                </div>
                              </motion.div>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </FadeUp>
        </div>

        <FadeUp delay={0.1}>
          <Card title="Add availability">
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="start_time" className={fieldLabelClass}>
                  Start
                </label>
                <input
                  id="start_time"
                  type="datetime-local"
                  className={fieldInputClass}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  disabled={saving}
                  min={isoToLocalInput(new Date().toISOString())}
                />
              </div>
              <div>
                <label htmlFor="end_time" className={fieldLabelClass}>
                  End
                </label>
                <input
                  id="end_time"
                  type="datetime-local"
                  className={fieldInputClass}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  disabled={saving}
                  min={start || undefined}
                />
              </div>
              <FieldErrorText id="availability-form-error" message={formError} />
              <button type="submit" className={`${primaryButtonClass} w-full`} disabled={saving}>
                <CalendarPlus className="w-4 h-4" />
                {saving ? 'Adding…' : 'Add slot'}
              </button>
              <p className="text-xs text-slate-400 leading-relaxed">
                Windows must be between {MIN_DURATION_MINUTES} minutes and {MAX_DURATION_HOURS} hours,
                and cannot overlap an existing slot.
              </p>
            </form>
          </Card>
        </FadeUp>
      </div>

      <div className="mt-6">
        <Link
          to="/doctor"
          className={`${secondaryButtonClass} inline-flex`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to dashboard
        </Link>
      </div>
    </DashboardLayout>
  );
}
