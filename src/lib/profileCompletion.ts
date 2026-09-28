/**
 * Profile completion percentage, computed from real field values only.
 *
 * Never hardcode a percentage — these functions look at the actual row and
 * report exactly what's filled in. A field counts as complete when it has a
 * meaningful value: a non-empty trimmed string, or a non-null number.
 */
import type {DoctorProfileRow, ProfileRow, PatientProfileRow} from './database.types';

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export interface CompletionResult {
  percent: number;
  filled: number;
  total: number;
  missing: string[];
}

function computeCompletion(
  fields: Array<{label: string; value: unknown}>,
): CompletionResult {
  const total = fields.length;
  const missing = fields.filter((f) => !hasValue(f.value)).map((f) => f.label);
  const filled = total - missing.length;
  return {
    percent: total === 0 ? 0 : Math.round((filled / total) * 100),
    filled,
    total,
    missing,
  };
}

/**
 * Patient completion. Required fields per the spec: full name, DOB, gender,
 * phone, height, weight, blood group. Allergies/conditions/medications are
 * explicitly optional (a healthy patient legitimately has none), so they are
 * not counted — treating "no allergies" as an incomplete field would be wrong.
 */
export function patientCompletion(
  profile: ProfileRow | null,
  clinical: PatientProfileRow | null,
): CompletionResult {
  return computeCompletion([
    {label: 'Full name', value: profile?.full_name},
    {label: 'Date of birth', value: profile?.date_of_birth},
    {label: 'Gender', value: profile?.gender},
    {label: 'Phone', value: profile?.phone},
    {label: 'Height', value: clinical?.height_cm},
    {label: 'Weight', value: clinical?.weight_kg},
    {label: 'Blood group', value: clinical?.blood_group},
  ]);
}

/**
 * Doctor completion. Required fields: the professional identity fields plus a
 * bio (a directory listing with no bio reads as unfinished to a patient
 * browsing doctors).
 */
export function doctorCompletion(
  profile: ProfileRow | null,
  doctor: DoctorProfileRow | null,
): CompletionResult {
  return computeCompletion([
    {label: 'Full name', value: profile?.full_name},
    {label: 'Phone', value: profile?.phone},
    {label: 'Specialization', value: doctor?.specialization},
    {label: 'Qualification', value: doctor?.qualification},
    {label: 'Registration number', value: doctor?.registration_number},
    // experience_years and consultation_fee default to 0 in the database, which
    // is indistinguishable from "not entered yet" — a practicing doctor with
    // exactly 0 years' experience or a ₹0 fee is not realistic, so > 0 is used
    // as the completeness signal here rather than merely non-null.
    {label: 'Experience', value: doctor && doctor.experience_years > 0 ? doctor.experience_years : null},
    {
      label: 'Consultation fee',
      value: doctor && doctor.consultation_fee > 0 ? doctor.consultation_fee : null,
    },
    {label: 'Bio', value: doctor?.bio},
  ]);
}
