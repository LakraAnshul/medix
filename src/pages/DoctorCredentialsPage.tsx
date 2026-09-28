/**
 * /doctor/credentials — upload and track verification evidence.
 *
 * SECURITY
 *   - Storage path is always `<doctor_id>/<random_uuid>.<ext>`. The doctor_id
 *     segment is taken from the authenticated session (`user.id`), never from
 *     anything editable in this component, and the storage policy
 *     `doctor_credentials_insert_own` independently re-checks that the first
 *     path segment equals auth.uid() — so even a hand-crafted request cannot
 *     write into another doctor's folder.
 *   - The doctor_credentials_document_path_is_owned CHECK constraint (migration
 *     005) enforces the same rule at the table level, so the metadata row and
 *     the storage object cannot disagree about who owns the file.
 *   - There is no "mark verified" control anywhere on this page. Only an admin
 *     session can change verification_status, and guard_doctor_credentials_write
 *     rejects the attempt from a doctor session even if one were added here.
 *   - File type/size are checked client-side against the bucket's own
 *     configuration (fetched from storage.buckets is not possible from the
 *     client, so the limits are mirrored from migration 012) purely so a
 *     doctor gets an instant, friendly error. The bucket's `allowed_mime_types`
 *     and `file_size_limit` are what actually enforce this — a request that
 *     evades the client check is refused by Storage itself.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft, FileText, Upload, X} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import {BUCKETS} from '../lib/database.types';
import type {CredentialType, DoctorCredentialRow} from '../lib/database.types';
import {
  Banner,
  Card,
  CardSkeleton,
  DashboardLayout,
  EmptyState,
  FadeUp,
  StatusPill,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
} from './DashboardLayout';

/** Mirrors the doctor-credentials bucket configuration in migration 012. */
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

const CREDENTIAL_TYPES: {value: CredentialType; label: string}[] = [
  {value: 'medical_registration', label: 'Medical registration'},
  {value: 'degree', label: 'Degree certificate'},
  {value: 'specialization_certificate', label: 'Specialization certificate'},
  {value: 'identity_proof', label: 'Identity proof'},
  {value: 'other', label: 'Other'},
];

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DoctorCredentialsPage() {
  const {user} = useAuth();
  const [credentials, setCredentials] = useState<DoctorCredentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SafeError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [credentialType, setCredentialType] = useState<CredentialType>('medical_registration');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const {data, error: fetchError} = await supabase
        .from('doctor_credentials')
        .select('*')
        .eq('doctor_id', user.id)
        .order('created_at', {ascending: false});
      if (fetchError) throw fetchError;
      setCredentials((data as DoctorCredentialRow[]) ?? []);
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // One live (pending/verified) credential per type — mirrors
  // doctor_credentials_one_live_per_type. Used only to give a clear message
  // before attempting the upload; the unique index is the real guarantee.
  const liveByType = new Set(
    credentials.filter((c) => c.verification_status !== 'rejected').map((c) => c.credential_type),
  );
  const alreadyHasLiveCredential = liveByType.has(credentialType);

  const validateFile = (candidate: File): string | null => {
    if (!ALLOWED_MIME_TYPES.includes(candidate.type)) {
      return 'Only PDF, PNG, JPEG or WebP files are accepted.';
    }
    if (candidate.size === 0) return 'This file is empty.';
    if (candidate.size > MAX_FILE_BYTES) {
      return `File is too large (${formatBytes(candidate.size)}). Maximum is 20 MB.`;
    }
    return null;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const candidate = event.target.files?.[0] ?? null;
    setNotice(null);
    if (!candidate) {
      setFile(null);
      setFileError(null);
      return;
    }
    const message = validateFile(candidate);
    setFileError(message);
    setFile(message ? null : candidate);
  };

  const clearFile = () => {
    setFile(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !file) return;
    setError(null);
    setNotice(null);
    setUploading(true);
    setProgress(0);

    try {
      const ext = extensionOf(file.name) || 'bin';
      const objectPath = `${user.id}/${crypto.randomUUID()}.${ext}`;

      // supabase-js's upload() does not currently expose byte-level progress for
      // this SDK version; we show indeterminate-then-complete rather than a fake
      // animated percentage, which would misrepresent real progress.
      setProgress(50);
      const {error: uploadError} = await supabase.storage
        .from(BUCKETS.doctorCredentials)
        .upload(objectPath, file, {contentType: file.type, upsert: false});
      if (uploadError) throw uploadError;
      setProgress(85);

      const {error: insertError} = await supabase.from('doctor_credentials').insert({
        doctor_id: user.id,
        credential_type: credentialType,
        document_path: objectPath,
        document_name: file.name.slice(0, 255),
      });
      if (insertError) {
        // Roll back the orphaned object so a failed metadata insert does not
        // leave an unreferenced file sitting in private storage.
        await supabase.storage.from(BUCKETS.doctorCredentials).remove([objectPath]).catch(() => {});
        throw insertError;
      }

      setProgress(100);
      setNotice('Uploaded. It is now pending verification.');
      clearFile();
      await load();
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <DashboardLayout
      title="Credentials"
      description="Upload the documents an administrator needs to verify your account."
    >
      {error && <Banner tone="error">{error.message}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}

      <div className="grid gap-6 lg:grid-cols-2">
        <FadeUp delay={0.05}>
          <Card title="Upload a credential">
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label htmlFor="credential_type" className={fieldLabelClass}>
                  Credential type
                </label>
                <select
                  id="credential_type"
                  className={fieldInputClass}
                  value={credentialType}
                  onChange={(e) => setCredentialType(e.target.value as CredentialType)}
                  disabled={uploading}
                >
                  {CREDENTIAL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {alreadyHasLiveCredential && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    You already have a {CREDENTIAL_TYPES.find((t) => t.value === credentialType)?.label.toLowerCase()}{' '}
                    pending or verified. Uploading again for the same type is only needed after a
                    rejection.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="credential_file" className={fieldLabelClass}>
                  Document
                </label>
                {!file ? (
                  <label
                    htmlFor="credential_file"
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center cursor-pointer hover:border-[#0f233a]/40 hover:bg-slate-50/80 transition"
                  >
                    <Upload className="w-6 h-6 text-slate-400" aria-hidden="true" />
                    <span className="text-sm font-medium text-[#0f233a]">Choose a file</span>
                    <span className="text-xs text-slate-400">
                      PDF, PNG, JPEG or WebP — up to 20 MB
                    </span>
                  </label>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-[#0f233a] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearFile}
                      className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 shrink-0"
                      aria-label="Remove selected file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <input
                  ref={inputRef}
                  id="credential_file"
                  type="file"
                  accept={ALLOWED_MIME_TYPES.join(',')}
                  onChange={handleFileChange}
                  className="sr-only"
                  disabled={uploading}
                  aria-invalid={Boolean(fileError)}
                  aria-describedby={fileError ? 'file-error' : undefined}
                />
                {fileError && (
                  <p id="file-error" className="mt-1.5 text-xs text-red-600">
                    {fileError}
                  </p>
                )}
              </div>

              {uploading && (
                <div
                  className="h-1.5 rounded-full bg-slate-100 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                >
                  <div
                    className="h-full bg-[#0f233a] transition-all duration-300"
                    style={{width: `${progress}%`}}
                  />
                </div>
              )}

              <button
                type="submit"
                className={`${primaryButtonClass} w-full`}
                disabled={!file || uploading}
              >
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading…' : 'Upload credential'}
              </button>
            </form>
          </Card>
        </FadeUp>

        <FadeUp delay={0.1}>
          <Card
            title="Your credentials"
            aside={<span className="text-xs text-slate-400">{credentials.length} uploaded</span>}
          >
            {loading ? (
              <CardSkeleton rows={4} />
            ) : credentials.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-5 h-5" />}
                title="No credentials uploaded yet"
                description="Upload at least one document to start the verification process."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {credentials.map((cred) => (
                  <li key={cred.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{cred.document_name}</p>
                        <p className="text-xs text-slate-500">
                          {CREDENTIAL_TYPES.find((t) => t.value === cred.credential_type)?.label ??
                            cred.credential_type}
                        </p>
                      </div>
                      {/* Never render "Verified" for anything other than the true
                          server-side value — this pill reads directly from the
                          database row, not from local upload state. */}
                      <StatusPill status={cred.verification_status} />
                    </div>
                    {cred.verification_status === 'rejected' && cred.rejection_reason && (
                      <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
                        {cred.rejection_reason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </FadeUp>
      </div>

      <div className="mt-6">
        <Link
          to="/doctor"
          className="text-sm text-slate-500 hover:text-[#0f233a] inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to dashboard
        </Link>
      </div>
    </DashboardLayout>
  );
}
