/**
 * Shared display formatting. Centralised so date/currency rendering is
 * consistent across the patient, doctor and admin surfaces.
 */

/** Renders an amount using the rupee sign, matching the landing page's ₹ usage. */
export function formatFee(fee: number | null | undefined): string {
  if (fee === null || fee === undefined) return '—';
  return `₹${fee.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
}

/**
 * Renders a timestamptz for a human, always with an explicit timezone label so
 * "9:00 AM" is never ambiguous between the doctor's intended time and the
 * viewer's local clock. Availability is stored in UTC (timestamptz) and
 * PostgREST returns it with an offset; we deliberately show the *viewer's*
 * local time plus the abbreviation, because that is what the viewer will act on,
 * and label it so nobody assumes it is the doctor's local time.
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const timeFmt: Intl.DateTimeFormatOptions = {hour: 'numeric', minute: '2-digit'};
  const startStr = start.toLocaleTimeString(undefined, timeFmt);
  const endStr = end.toLocaleTimeString(undefined, timeFmt);
  const tz = new Intl.DateTimeFormat(undefined, {timeZoneName: 'short'})
    .formatToParts(end)
    .find((p) => p.type === 'timeZoneName')?.value;
  return `${startStr} – ${endStr}${tz ? ` ${tz}` : ''}`;
}

export function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/** Weekday key used to group availability rows for the weekly view, in the viewer's local time. */
export function weekdayKey(iso: string): number {
  return new Date(iso).getDay(); // 0 = Sunday .. 6 = Saturday
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Converts a native <input type="datetime-local"> value (local time, no offset) to an ISO UTC string. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Converts an ISO UTC string to the value a <input type="datetime-local"> expects, in local time. */
export function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
