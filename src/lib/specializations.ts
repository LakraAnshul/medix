/**
 * Suggested specializations for the signup and profile-edit forms.
 *
 * This is deliberately a plain, editable list rather than a database enum.
 * `doctor_profiles.specialization` is a free-text column (see migration 004) —
 * narrowing it to a fixed enum would block a legitimate specialization we didn't
 * think of and would require a migration every time medicine grows a new one.
 * The list here is a typing aid only: the field always accepts free text, and
 * this array is also how the discovery page's specialization filter is built
 * (from the specializations actually present among verified doctors, with this
 * list used only to give the filter a sensible starting order).
 */
export const SUGGESTED_SPECIALIZATIONS = [
  'General Physician',
  'Cardiologist',
  'Dermatologist',
  'Neurologist',
  'Pediatrician',
  'Orthopedic Surgeon',
  'Gynecologist',
  'Psychiatrist',
  'ENT Specialist',
  'Ophthalmologist',
  'Dentist',
  'Endocrinologist',
  'Gastroenterologist',
  'Pulmonologist',
  'Urologist',
  'Nephrologist',
  'Oncologist',
  'Rheumatologist',
  'General Surgeon',
  'Radiologist',
] as const;
