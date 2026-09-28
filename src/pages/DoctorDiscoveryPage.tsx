/**
 * /doctors — public doctor discovery.
 *
 * SECURITY / PRIVACY
 *   This page reads only public.verified_doctors, never doctor_profiles or
 *   profiles directly. That view (see migration 013) already guarantees:
 *     - only verification_status = 'verified' doctors are returned — pending,
 *       rejected and suspended doctors are structurally absent from the result
 *       set, not merely hidden by a client-side filter;
 *     - the column list is fixed and does not include registration_number,
 *       date_of_birth, phone, verified_by/verified_at or any other internal
 *       metadata. There is nothing this component could accidentally leak by
 *       selecting `*` because the view itself never has those columns.
 *   No authentication is required to view this page or run these queries —
 *   anon holds SELECT on the view — matching "doctor discovery is public
 *   marketing data" from the spec.
 *
 * SEARCH
 *   Name/specialization search uses PostgREST's `ilike` through supabase-js
 *   (`.or('full_name.ilike.%x%,specialization.ilike.%x%')`), which is
 *   parameterised by the client library — there is no raw SQL string
 *   concatenation here, so there is no injection surface. Input is debounced
 *   and capped in length before it is ever sent.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {motion} from 'motion/react';
import {Search, Stethoscope, ArrowRight} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import {formatFee} from '../lib/format';
import {SUGGESTED_SPECIALIZATIONS} from '../lib/specializations';
import type {VerifiedDoctorRow} from '../lib/database.types';
import {useNavigate} from 'react-router-dom';
import {Navbar} from '../components/Navbar';
import {NavbarAuthButtons} from '../components/NavbarAuthButtons';
import {Footer} from '../components/Footer';
import {EXPO_EASE} from './DashboardLayout';

const PAGE_SIZE = 12;
/** Hard cap on the search string sent to the server — a long-string DoS / abuse guard. */
const MAX_QUERY_LENGTH = 100;

/** Escapes characters PostgREST's `ilike`/`or` syntax treats specially. */
function sanitizeSearchTerm(raw: string): string {
  return raw
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[%,()]/g, ''); // strip ilike wildcards and the .or() list separators
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export default function DoctorDiscoveryPage() {
  const navigate = useNavigate();
  const goToLandingSection = (sectionId: string) => navigate(`/#${sectionId}`);
  const [searchInput, setSearchInput] = useState('');
  const [specialization, setSpecialization] = useState<string>('all');
  const [doctors, setDoctors] = useState<VerifiedDoctorRow[]>([]);
  const [availableSpecializations, setAvailableSpecializations] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SafeError | null>(null);

  const debouncedSearch = useDebouncedValue(searchInput, 350);

  // Reset to page 0 whenever a filter changes, so the user never lands on an
  // out-of-range page after narrowing the result set.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, specialization]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const term = sanitizeSearchTerm(debouncedSearch);
      let query = supabase
        .from('verified_doctors')
        .select('*', {count: 'exact'})
        .order('experience_years', {ascending: false})
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (term.length > 0) {
        query = query.or(`full_name.ilike.%${term}%,specialization.ilike.%${term}%`);
      }
      if (specialization !== 'all') {
        query = query.eq('specialization', specialization);
      }

      const {data, error: fetchError, count} = await query;
      if (fetchError) throw fetchError;
      setDoctors((data as VerifiedDoctorRow[]) ?? []);
      setTotalCount(count ?? 0);
    } catch (caught) {
      setError(toSafeError(caught));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, specialization, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Builds the filter's option list from specializations actually present among
  // verified doctors (queried once, unbounded by the current search/page), so
  // the filter never offers a specialization with zero matching results and
  // never needs a hardcoded, ever-growing medical taxonomy.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {data} = await supabase
        .from('verified_doctors')
        .select('specialization')
        .limit(500);
      if (cancelled || !data) return;
      const present = new Set((data as {specialization: string}[]).map((d) => d.specialization));
      const ordered = SUGGESTED_SPECIALIZATIONS.filter((s) => present.has(s));
      const extra = [...present].filter((s) => !ordered.includes(s as never)).sort();
      setAvailableSpecializations([...ordered, ...extra]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = useMemo(
    () => (totalCount === null ? 1 : Math.max(1, Math.ceil(totalCount / PAGE_SIZE))),
    [totalCount],
  );

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#0f233a] font-sans flex flex-col selection:bg-[#fcd7d3] selection:text-[#0f233a]">
      <Navbar
        // Booking and the Help Center modal both live on the landing page; from
        // here we send the visitor back to it rather than duplicating those
        // components on every route.
        onOpenBooking={() => navigate('/')}
        onOpenHelpCenter={() => navigate('/')}
        onNavigate={goToLandingSection}
        authSlot={<NavbarAuthButtons />}
        mobileAuthSlot={<NavbarAuthButtons variant="mobile" />}
      />

      <main className="flex-1">
        <section className="py-14 sm:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.6, ease: EXPO_EASE}}
            className="text-center max-w-2xl mx-auto mb-10"
          >
            <h1 className="font-serif-display text-4xl sm:text-5xl text-[#0f233a] font-normal leading-tight mb-4">
              Find your doctor
            </h1>
            <p className="font-sans-body text-slate-600 text-base sm:text-lg leading-relaxed">
              Every doctor listed here has been verified by our team. Search by name or
              specialization to get started.
            </p>
          </motion.div>

          <motion.div
            initial={{opacity: 0, y: 15}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.6, delay: 0.1, ease: EXPO_EASE}}
            className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-3 mb-10"
          >
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search by name or specialization"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                maxLength={MAX_QUERY_LENGTH}
                className="w-full pl-10 pr-4 py-3 rounded-full border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0f233a]/20 focus:border-[#0f233a]/40 transition text-sm"
                aria-label="Search doctors"
              />
            </div>
            <select
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              className="px-4 py-3 rounded-full border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0f233a]/20 focus:border-[#0f233a]/40 transition"
              aria-label="Filter by specialization"
            >
              <option value="all">All specializations</option>
              {availableSpecializations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </motion.div>

          {error && (
            <div
              className="max-w-3xl mx-auto mb-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-center"
              role="alert"
            >
              {error.message}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {Array.from({length: 6}).map((_, i) => (
                <div key={i} className="rounded-3xl bg-white border border-slate-200/80 p-6 animate-pulse">
                  <div className="h-5 w-2/3 bg-slate-100 rounded-lg mb-3" />
                  <div className="h-3 w-1/2 bg-slate-100 rounded-lg mb-6" />
                  <div className="h-3 w-full bg-slate-100 rounded-lg mb-2" />
                  <div className="h-3 w-4/5 bg-slate-100 rounded-lg" />
                </div>
              ))}
            </div>
          ) : doctors.length === 0 ? (
            <div className="text-center max-w-md mx-auto py-16">
              <Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600">
                {searchInput || specialization !== 'all'
                  ? 'No doctors match your search.'
                  : 'No verified doctors yet.'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {searchInput || specialization !== 'all'
                  ? 'Try a different name, specialization, or clear the filters.'
                  : 'Check back soon — new doctors are verified regularly.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                {doctors.map((doc, i) => (
                  <motion.div
                    key={doc.doctor_id}
                    initial={{opacity: 0, y: 20}}
                    animate={{opacity: 1, y: 0}}
                    transition={{duration: 0.4, delay: Math.min(i * 0.05, 0.3), ease: EXPO_EASE}}
                  >
                    <Link
                      to={`/doctors/${doc.doctor_id}`}
                      className="block h-full rounded-3xl bg-white border border-slate-200/80 p-6 hover:shadow-lg hover:border-slate-300 transition-all duration-300 group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                          <h3 className="font-serif-display text-xl text-[#0f233a] font-normal truncate">
                            {doc.full_name}
                          </h3>
                          <p className="text-sm text-slate-500 mt-0.5">{doc.specialization}</p>
                        </div>
                        <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                          Verified
                        </span>
                      </div>
                      {doc.bio && (
                        <p className="text-sm text-slate-600 leading-relaxed line-clamp-2 mb-4">
                          {doc.bio}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">{doc.experience_years} yrs experience</span>
                        <span className="font-semibold text-[#0f233a]">{formatFee(doc.consultation_fee)}</span>
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-[#0f233a]">
                        <span>View profile</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-10">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-4 py-2 rounded-full border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-500">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-4 py-2 rounded-full border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <Footer
        onNavigate={goToLandingSection}
        onOpenBooking={() => navigate('/')}
        onOpenHelpCenter={() => navigate('/')}
      />
    </div>
  );
}
