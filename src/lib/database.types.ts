/**
 * Database types for the Phase 2 schema.
 *
 * Hand-maintained to mirror supabase/migrations/*.sql. Keep this file in step
 * with the migrations; they are the source of truth.
 *
 * IMPLEMENTATION NOTE — these are `type` aliases, not `interface` declarations,
 * and that is load-bearing. postgrest-js constrains every table to
 * `{ Row: Record<string, unknown>; Insert: ...; Update: ...; Relationships: ... }`.
 * TypeScript only gives *type aliases* an implicit index signature; an
 * `interface` does not satisfy `Record<string, unknown>`. Declaring these as
 * interfaces makes the schema fail the `GenericSchema` constraint, and every
 * `.insert()` / `.update()` argument silently collapses to `never`.
 *
 * Note also which columns are absent from the Insert shapes — that is deliberate.
 * `profiles.role`, `appointments.fee` and `appointments.time_range` are
 * server-assigned and are overwritten by database triggers, so the type system
 * stops you writing code that tries.
 */

export type AppRole = 'patient' | 'doctor' | 'admin';
export type GenderType = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';
export type CredentialType =
  | 'medical_registration'
  | 'degree'
  | 'specialization_certificate'
  | 'identity_proof'
  | 'other';
export type AvailabilityStatus = 'available' | 'blocked' | 'booked';
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';
export type ConsentScope = 'medical_records' | 'consultation' | 'reports' | 'general';
export type ConsentStatus = 'granted' | 'revoked';
export type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'unknown';

export type Json = string | number | boolean | null | {[key: string]: Json} | Json[];

// ---------------------------------------------------------------- profiles

export type ProfileRow = {
  id: string;
  role: AppRole;
  full_name: string;
  date_of_birth: string | null;
  gender: GenderType | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

/** `role` is intentionally omitted: it is assigned by handle_new_user(). */
export type ProfileUpdate = Partial<
  Pick<ProfileRow, 'full_name' | 'date_of_birth' | 'gender' | 'phone' | 'avatar_url'>
>;

export type ProfileInsert = {id: string; full_name: string} & ProfileUpdate;

// -------------------------------------------------------- patient_profiles

export type PatientProfileRow = {
  user_id: string;
  height_cm: number | null;
  weight_kg: number | null;
  blood_group: BloodGroup | null;
  allergies: string[];
  existing_conditions: string[];
  current_medications: string[];
  created_at: string;
  updated_at: string;
};

export type PatientProfileUpdate = Partial<
  Omit<PatientProfileRow, 'user_id' | 'created_at' | 'updated_at'>
>;

export type PatientProfileInsert = {user_id: string} & PatientProfileUpdate;

// --------------------------------------------------------- doctor_profiles

export type DoctorProfileRow = {
  user_id: string;
  specialization: string;
  qualification: string;
  registration_number: string;
  experience_years: number;
  consultation_fee: number;
  bio: string | null;
  verification_status: VerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Columns a doctor may edit on their own profile. */
export type DoctorProfileSelfUpdate = Partial<
  Pick<
    DoctorProfileRow,
    | 'specialization'
    | 'qualification'
    | 'registration_number'
    | 'experience_years'
    | 'consultation_fee'
    | 'bio'
  >
>;

/**
 * `verification_status` is included because the admin screens legitimately write
 * it. Types cannot express "admin only" — that rule is enforced by
 * guard_doctor_profiles_write(), which rejects the change with SQLSTATE 42501
 * for any non-admin session regardless of what the client sends.
 */
export type DoctorProfileUpdate = DoctorProfileSelfUpdate &
  Partial<Pick<DoctorProfileRow, 'verification_status'>>;

export type DoctorProfileInsert = {
  user_id: string;
  specialization: string;
  qualification: string;
  registration_number: string;
} & DoctorProfileSelfUpdate;

// ------------------------------------------------------ doctor_credentials

export type DoctorCredentialRow = {
  id: string;
  doctor_id: string;
  credential_type: CredentialType;
  document_path: string;
  document_name: string;
  verification_status: VerificationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type DoctorCredentialInsert = {
  doctor_id: string;
  credential_type: CredentialType;
  document_path: string;
  document_name: string;
};

/**
 * Review columns are present for the admin screens. Again, authorization is the
 * database's job: guard_doctor_credentials_write() rejects these fields from a
 * non-admin session, and doctor_credentials_reviewer_not_self makes self-approval
 * impossible even for an admin editing their own record.
 */
export type DoctorCredentialUpdate = Partial<
  Pick<DoctorCredentialRow, 'document_name' | 'verification_status' | 'rejection_reason'>
>;

// ----------------------------------------------------- doctor_availability

export type DoctorAvailabilityRow = {
  id: string;
  doctor_id: string;
  start_time: string;
  end_time: string;
  status: AvailabilityStatus;
  created_at: string;
  updated_at: string;
};

export type DoctorAvailabilityInsert = {
  doctor_id: string;
  start_time: string;
  end_time: string;
  status?: AvailabilityStatus;
};

export type DoctorAvailabilityUpdate = Partial<
  Pick<DoctorAvailabilityRow, 'start_time' | 'end_time' | 'status'>
>;

// ------------------------------------------------------------ appointments

export type AppointmentRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  availability_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  meeting_id: string | null;
  fee: number;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  time_range: string;
  created_at: string;
  updated_at: string;
};

/**
 * `fee` and `time_range` are absent because the booking trigger derives both.
 * `status` is absent because a patient cannot self-confirm.
 */
export type AppointmentInsert = {
  patient_id: string;
  doctor_id: string;
  availability_id?: string | null;
  scheduled_at: string;
  duration_minutes?: number;
};

export type AppointmentUpdate = Partial<
  Pick<
    AppointmentRow,
    'status' | 'scheduled_at' | 'duration_minutes' | 'cancellation_reason' | 'meeting_id'
  >
>;

// ----------------------------------------------------------------- consents

export type ConsentRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  scope: ConsentScope;
  status: ConsentStatus;
  granted_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsentInsert = {
  patient_id: string;
  doctor_id: string;
  scope: ConsentScope;
};

export type ConsentUpdate = Partial<Pick<ConsentRow, 'status'>>;

// --------------------------------------------------------------- audit_logs

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_role: AppRole | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Json;
  created_at: string;
};

export type AuditLogInsert = {
  actor_id?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  metadata?: Json;
};

// ------------------------------------------------------------------- views

export type VerifiedDoctorRow = {
  doctor_id: string;
  full_name: string;
  avatar_url: string | null;
  specialization: string;
  qualification: string;
  experience_years: number;
  consultation_fee: number;
  bio: string | null;
  created_at: string;
};

// ---------------------------------------------------------------- database

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      patient_profiles: {
        Row: PatientProfileRow;
        Insert: PatientProfileInsert;
        Update: PatientProfileUpdate;
        Relationships: [];
      };
      doctor_profiles: {
        Row: DoctorProfileRow;
        Insert: DoctorProfileInsert;
        Update: DoctorProfileUpdate;
        Relationships: [];
      };
      doctor_credentials: {
        Row: DoctorCredentialRow;
        Insert: DoctorCredentialInsert;
        Update: DoctorCredentialUpdate;
        Relationships: [];
      };
      doctor_availability: {
        Row: DoctorAvailabilityRow;
        Insert: DoctorAvailabilityInsert;
        Update: DoctorAvailabilityUpdate;
        Relationships: [];
      };
      appointments: {
        Row: AppointmentRow;
        Insert: AppointmentInsert;
        Update: AppointmentUpdate;
        Relationships: [];
      };
      consents: {
        Row: ConsentRow;
        Insert: ConsentInsert;
        Update: ConsentUpdate;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: AuditLogInsert;
        /** Append-only in the database; there is no legitimate update path. */
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: {
      verified_doctors: {
        Row: VerifiedDoctorRow;
        Relationships: [];
      };
    };
    Functions: {
      is_verified_doctor: {
        Args: {p_doctor_id: string};
        Returns: boolean;
      };
      record_audit: {
        Args: {
          p_action: string;
          p_resource_type: string;
          p_resource_id?: string | null;
          p_metadata?: Json;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: AppRole;
      gender_type: GenderType;
      verification_status: VerificationStatus;
      credential_type: CredentialType;
      availability_status: AvailabilityStatus;
      appointment_status: AppointmentStatus;
      consent_scope: ConsentScope;
      consent_status: ConsentStatus;
      blood_group: BloodGroup;
    };
    CompositeTypes: Record<string, never>;
  };
};

/** Storage bucket ids. All four are private; reads need a signed URL. */
export const BUCKETS = {
  medicalReports: 'medical-reports',
  doctorCredentials: 'doctor-credentials',
  prescriptions: 'prescriptions',
  profileImages: 'profile-images',
} as const;

export type BucketId = (typeof BUCKETS)[keyof typeof BUCKETS];
