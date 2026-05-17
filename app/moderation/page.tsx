'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Post, Comment, ReportRecord, formatTimeAgo, getAnonymousHandle } from '@/components/home/types';

// ---------------------------------------------------------------------------
// Augmented types — adds moderation fields that the DB writes but the shared
// Post/Comment types don't declare.
// ---------------------------------------------------------------------------
type HiddenFields = {
  hidden?: boolean;
  hidden_at?: string | null;
  hidden_by?: string | null;
  hidden_reason?: string | null;
};

type AugmentedPost    = Post    & HiddenFields;
type AugmentedComment = Comment & HiddenFields;

type ModerationTarget = {
  headline: string;
  body:     string;
  author:   string;
  postId?:  string;
};

type ReportStatusFilter = 'all' | 'open' | 'reviewed' | 'dismissed';
type SortField          = 'created_at' | 'reason' | 'status';

// ---------------------------------------------------------------------------
// CSV export helper
// FIX: append link to DOM before clicking so Firefox triggers the download
// ---------------------------------------------------------------------------
function exportReportsCSV(
  reports: ReportRecord[],
  targets: Map<string, ModerationTarget>,
): void {
  const header = ['ID', 'Status', 'Reason', 'Target Type', 'Target ID', 'Details', 'Created At', 'Moderation Notes', 'Content Preview'];
  const rows = reports.map((r) => {
    const target = targets.get(`${r.target_type}:${r.target_id}`);
    return [
      r.id,
      r.status,
      r.reason,
      r.target_type,
      r.target_id,
      r.details ?? '',
      r.created_at,
      r.moderation_notes ?? '',
      target?.body?.replace(/[\n\r,]/g, ' ').slice(0, 120) ?? '',
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`);
  });

  const csv  = [header, ...rows].map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `moderation-reports-${new Date().toISOString().slice(0, 10)}.csv`;
  // FIX: must append to DOM before clicking (required by Firefox)
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ModerationPage() {
  const { user, loading: authLoading } = useAuth();

  const [reports,        setReports]        = useState<ReportRecord[]>([]);
  const [posts,          setPosts]           = useState<AugmentedPost[]>([]);
  const [comments,       setComments]        = useState<AugmentedComment[]>([]);
  const [loading,        setLoading]         = useState(true);

  // FIX: separate saving-note IDs from status-update IDs to avoid visual conflicts.
  const [savingNoteId,      setSavingNoteId]      = useState<string | null>(null);
  const [updatingId,        setUpdatingId]        = useState<string | null>(null);
  const [updatingTargetKey, setUpdatingTargetKey] = useState<string | null>(null);

  const [missingTable,   setMissingTable]    = useState(false);
  // FIX: single error + success banner state; cleared before each new operation.
  const [errorMessage,   setErrorMessage]    = useState('');
  const [successMessage, setSuccessMessage]  = useState('');

  const [moderationNotes, setModerationNotes] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter]      = useState<ReportStatusFilter>('open');
  const [sortField,    setSortField]         = useState<SortField>('created_at');
  const [sortAsc,      setSortAsc]           = useState(false);
  const [reasonFilter, setReasonFilter]      = useState<string>('all');

  // FIX: track mounted state with a ref to prevent setState after unmount
  // (avoids the flash setTimeout leak when the component unmounts mid-timer)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ---------------------------------------------------------------------------
  // Moderator gate
  // ---------------------------------------------------------------------------
  const moderatorEmails = useMemo(
    () =>
      (process.env.NEXT_PUBLIC_MODERATOR_EMAILS ?? '')
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    [],
  );
  const isModerator = !!user?.email && moderatorEmails.includes(user.email.toLowerCase());

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  async function refreshReports() {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      if (error.message.includes('public.reports')) {
        setMissingTable(true);
        setErrorMessage('');
      } else {
        setErrorMessage(error.message);
      }
      setReports([]);
      return;
    }

    // FIX: clear error on successful fetch
    setMissingTable(false);
    setErrorMessage('');

    const nextReports = (data ?? []) as ReportRecord[];
    setReports(nextReports);
    setModerationNotes((current) => {
      const next: Record<string, string> = {};
      nextReports.forEach((r) => {
        next[r.id] = current[r.id] ?? r.moderation_notes ?? '';
      });
      return next;
    });
  }

  async function refreshTargets() {
    const [postsRes, commentsRes] = await Promise.all([
      supabase.from('posts').select('*').limit(500),
      supabase.from('comments').select('*').limit(1000),
    ]);
    setPosts((postsRes.data ?? []) as AugmentedPost[]);
    setComments((commentsRes.data ?? []) as AugmentedComment[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const [reportsRes, postsRes, commentsRes] = await Promise.all([
        supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('posts').select('*').limit(500),
        supabase.from('comments').select('*').limit(1000),
      ]);

      if (cancelled) return;

      if (reportsRes.error) {
        if (reportsRes.error.message.includes('public.reports')) {
          setMissingTable(true);
          setErrorMessage('');
        } else {
          setErrorMessage(reportsRes.error.message);
        }
        setReports([]);
      } else {
        setMissingTable(false);
        setErrorMessage('');
        const nextReports = (reportsRes.data ?? []) as ReportRecord[];
        setReports(nextReports);
        setModerationNotes(
          Object.fromEntries(nextReports.map((r) => [r.id, r.moderation_notes ?? ''])),
        );
      }

      setPosts((postsRes.data ?? []) as AugmentedPost[]);
      setComments((commentsRes.data ?? []) as AugmentedComment[]);
      setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const targets = useMemo(() => {
    const map = new Map<string, ModerationTarget>();
    posts.forEach((p) =>
      map.set(`post:${p.id}`, { headline: p.title, body: p.body, author: p.author }),
    );
    comments.forEach((c) =>
      map.set(`comment:${c.id}`, {
        headline: `Reply in thread`,
        body:     c.body,
        author:   c.author,
        postId:   c.post_id,
      }),
    );
    return map;
  }, [posts, comments]);

  const reportCounts = useMemo(() => ({
    all:       reports.length,
    open:      reports.filter((r) => r.status === 'open').length,
    reviewed:  reports.filter((r) => r.status === 'reviewed').length,
    dismissed: reports.filter((r) => r.status === 'dismissed').length,
  }), [reports]);

  // Reason breakdown for the reporting summary panel
  const reasonBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    reports.forEach((r) => {
      counts[r.reason] = (counts[r.reason] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [reports]);

  const allReasons = useMemo(() => ['all', ...Array.from(new Set(reports.map((r) => r.reason)))], [reports]);

  const filteredAndSortedReports = useMemo(() => {
    let result = reports;

    if (statusFilter !== 'all') result = result.filter((r) => r.status === statusFilter);
    if (reasonFilter !== 'all') result = result.filter((r) => r.reason === reasonFilter);

    result = [...result].sort((a, b) => {
      let aVal = a[sortField] ?? '';
      let bVal = b[sortField] ?? '';
      if (sortField === 'created_at') {
        aVal = a.created_at;
        bVal = b.created_at;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [reports, statusFilter, reasonFilter, sortField, sortAsc]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  // FIX: guard against setState after unmount using mountedRef
  function flash(msg: string) {
    if (!mountedRef.current) return;
    setSuccessMessage(msg);
    setTimeout(() => {
      if (mountedRef.current) setSuccessMessage('');
    }, 3000);
  }

  // FIX: try/finally guarantees loading state is always cleared even if Supabase throws
  async function updateReportStatus(reportId: string, status: 'reviewed' | 'dismissed') {
    setErrorMessage('');
    setUpdatingId(reportId);
    try {
      const { error } = await supabase.from('reports').update({ status }).eq('id', reportId);

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      await refreshReports();
      flash(`Report marked as ${status}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected error updating status.');
    } finally {
      setUpdatingId(null);
    }
  }

  // FIX: try/finally guarantees loading state is always cleared
  async function saveModerationNotes(reportId: string) {
    setErrorMessage('');
    setSavingNoteId(reportId);
    try {
      const { error } = await supabase
        .from('reports')
        .update({ moderation_notes: moderationNotes[reportId] ?? '' })
        .eq('id', reportId);

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      await refreshReports();
      flash('Note saved.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected error saving note.');
    } finally {
      setSavingNoteId(null);
    }
  }

  // FIX: try/finally guarantees loading state is always cleared
  async function updateTargetVisibility(report: ReportRecord, hidden: boolean) {
    const targetKey   = `${report.target_type}:${report.target_id}`;
    const targetTable = report.target_type === 'post' ? 'posts' : 'comments';

    setErrorMessage('');
    setUpdatingTargetKey(targetKey);
    try {
      const payload: HiddenFields = hidden
        ? { hidden: true,  hidden_at: new Date().toISOString(), hidden_by: user?.email ?? 'moderator', hidden_reason: report.reason }
        : { hidden: false, hidden_at: null, hidden_by: null, hidden_reason: null };

      const { error: visErr } = await supabase.from(targetTable).update(payload).eq('id', report.target_id);

      if (visErr) {
        setErrorMessage(visErr.message);
        return;
      }

      // Auto-mark the report as reviewed when hiding content
      if (hidden) {
        const { error: statusErr } = await supabase
          .from('reports')
          .update({ status: 'reviewed' })
          .eq('id', report.id);

        if (statusErr) {
          setErrorMessage(statusErr.message);
          return;
        }
      }

      await Promise.all([refreshReports(), refreshTargets()]);
      flash(hidden ? 'Content hidden and report marked reviewed.' : 'Content restored.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected error updating visibility.');
    } finally {
      setUpdatingTargetKey(null);
    }
  }

  async function handleRefresh() {
    setErrorMessage('');
    setLoading(true);
    try {
      await Promise.all([refreshReports(), refreshTargets()]);
      flash('Queue refreshed.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected error refreshing.');
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc((v) => !v);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const FILTER_TABS: ReportStatusFilter[] = ['open', 'all', 'reviewed', 'dismissed'];

  const statusColor: Record<string, string> = {
    open:      '#FAEAEA',
    reviewed:  '#EAF4EA',
    dismissed: '#F5F0EC',
  };

  const statusTextColor: Record<string, string> = {
    open:      'var(--red)',
    reviewed:  '#2D7A2D',
    dismissed: 'var(--muted)',
  };

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------
  return (
    <main style={{ maxWidth: 1220, margin: '0 auto', padding: '1.4rem 1.2rem 5rem' }}>

      {/* ── Hero / header ──────────────────────────────────────────────── */}
      <section className="hero-panel panel" style={{ borderRadius: 28, padding: '1.2rem', marginBottom: '1rem' }}>
        <div className="hero-grid">
          <div className="brief-stage">
            <div className="stage-panel" style={{ padding: '1.35rem' }}>
              <p className="luxury-kicker" style={{ marginBottom: 10 }}>Moderation desk</p>
              <div className="editorial-meta" style={{ marginBottom: 12 }}>
                <span>Reports</span>
                <span>Hide / unhide</span>
                <span>Internal notes</span>
                <span>Export</span>
              </div>
              <h1 style={{ fontSize: '3rem', lineHeight: 0.9, color: 'var(--ink)', marginBottom: 12, maxWidth: 780 }}>
                Review flagged content from a desk that feels deliberate, not like an admin leftover.
              </h1>
              <p style={{ color: 'var(--muted)', maxWidth: 760, fontSize: 14, marginBottom: 18 }}>
                First-pass queue for user reports. Surface enough thread context to decide quickly,
                leave notes, adjust visibility, and export the full log for audit trails.
              </p>

              {/* Stats row */}
              <div className="stage-summary">
                <div className="summary-puck">
                  <strong>{reportCounts.open}</strong>
                  <span>open</span>
                </div>
                <div className="summary-puck">
                  <strong>{reportCounts.reviewed}</strong>
                  <span>reviewed</span>
                </div>
                <div className="summary-puck">
                  <strong>{reportCounts.dismissed}</strong>
                  <span>dismissed</span>
                </div>
                <div className="summary-puck">
                  <strong>{reports.length}</strong>
                  <span>total</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sidebar: filters + reason breakdown ─────────────────────── */}
          <div className="hero-aside">
            <div className="hero-signal vellum">
              <div className="aside-card-title" style={{ marginBottom: 8 }}>Status filter</div>
              <div className="editorial-sort-row" style={{ flexWrap: 'wrap', borderRadius: 18 }}>
                {FILTER_TABS.map((filter) => (
                  <button
                    type="button"
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    style={{ cursor: 'pointer' }}
                    className={`editorial-sort-tab${statusFilter === filter ? ' active' : ''}`}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}{' '}
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{reportCounts[filter]}</span>
                  </button>
                ))}
              </div>

              {/* Reason breakdown */}
              {reasonBreakdown.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="aside-card-title" style={{ marginBottom: 8 }}>By reason</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allReasons.map((reason) => {
                      const count = reasonBreakdown.find(([r]) => r === reason)?.[1];
                      return (
                        <button
                          type="button"
                          key={reason}
                          onClick={() => setReasonFilter(reason)}
                          style={{
                            cursor: 'pointer',
                            fontSize: 11,
                            borderRadius: 999,
                            padding: '4px 9px',
                            fontWeight: 700,
                            textTransform: 'capitalize',
                            letterSpacing: '.04em',
                            background: reasonFilter === reason ? 'var(--ink)' : '#F5F0EC',
                            color:      reasonFilter === reason ? '#F5F0EC'   : 'var(--ink)',
                            border: 'none',
                          }}
                        >
                          {reason === 'all' ? 'All reasons' : reason}
                          {count !== undefined && (
                            <span style={{ marginLeft: 4, opacity: 0.7 }}>{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sort controls */}
              <div style={{ marginTop: 16 }}>
                <div className="aside-card-title" style={{ marginBottom: 8 }}>Sort by</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['created_at', 'reason', 'status'] as SortField[]).map((field) => (
                    <button
                      type="button"
                      key={field}
                      onClick={() => toggleSort(field)}
                      style={{
                        cursor: 'pointer',
                        fontSize: 11,
                        borderRadius: 999,
                        padding: '4px 9px',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        letterSpacing: '.04em',
                        background: sortField === field ? 'var(--accent)' : '#F5F0EC',
                        color:      sortField === field ? '#fff'          : 'var(--ink)',
                        border: 'none',
                      }}
                    >
                      {field === 'created_at' ? 'Date' : field.charAt(0).toUpperCase() + field.slice(1)}
                      {sortField === field && (sortAsc ? ' ↑' : ' ↓')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action row: refresh + export */}
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={loading}
                  style={{
                    cursor: loading ? 'default' : 'pointer',
                    fontSize: 12,
                    borderRadius: 999,
                    padding: '6px 14px',
                    fontWeight: 600,
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? 'Refreshing…' : '↻ Refresh queue'}
                </button>
                <button
                  type="button"
                  onClick={() => exportReportsCSV(filteredAndSortedReports, targets)}
                  disabled={filteredAndSortedReports.length === 0}
                  style={{
                    cursor: filteredAndSortedReports.length === 0 ? 'default' : 'pointer',
                    fontSize: 12,
                    borderRadius: 999,
                    padding: '6px 14px',
                    fontWeight: 600,
                    background: 'var(--ink)',
                    color: '#F5F0EC',
                    border: 'none',
                    opacity: filteredAndSortedReports.length === 0 ? 0.5 : 1,
                  }}
                >
                  ↓ Export CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Global banners ─────────────────────────────────────────────── */}
      {successMessage && (
        <div style={{
          background: '#EAF4EA',
          border: '1px solid #A8D5A8',
          borderRadius: 12,
          padding: '0.75rem 1rem',
          color: '#2D7A2D',
          marginBottom: 12,
          fontSize: 14,
          fontWeight: 600,
        }}>
          ✓ {successMessage}
        </div>
      )}
      {errorMessage && (
        <div style={{
          background: '#FAEAEA',
          border: '1px solid #E8C4C4',
          borderRadius: 12,
          padding: '0.75rem 1rem',
          color: 'var(--red)',
          marginBottom: 12,
          fontSize: 14,
        }}>
          {errorMessage}
        </div>
      )}

      {/* ── Main content gate ──────────────────────────────────────────── */}
      {authLoading ? (
        <div style={{ color: 'var(--muted)' }}>Checking moderator access…</div>

      ) : !moderatorEmails.length ? (
        <div className="mini-live-card">
          <div className="mini-live-label">Allowlist missing</div>
          <div className="mini-live-copy">
            Add <code>NEXT_PUBLIC_MODERATOR_EMAILS=you@example.com</code> to your{' '}
            <code>.env.local</code> file and restart the dev server.
          </div>
        </div>

      ) : !isModerator ? (
        <div className="mini-live-card">
          <div className="mini-live-label">Moderator access required</div>
          <div className="mini-live-copy">Sign in with an allowlisted moderator account to review reports.</div>
        </div>

      ) : loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading moderation queue…</div>

      ) : missingTable ? (
        <div className="mini-live-card">
          <div className="mini-live-label">Reports backend missing</div>
          <div className="mini-live-copy">
            Run <code>supabase/reports_setup.sql</code> in your Supabase SQL editor, then reload this page.
          </div>
        </div>

      ) : filteredAndSortedReports.length === 0 ? (
        <div className="mini-live-card">
          <div className="mini-live-label">Quiet desk</div>
          <div className="mini-live-copy">
            No {statusFilter !== 'all' ? statusFilter : ''} reports
            {reasonFilter !== 'all' ? ` with reason "${reasonFilter}"` : ''} right now.
          </div>
        </div>

      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredAndSortedReports.map((report) => {
            const target    = targets.get(`${report.target_type}:${report.target_id}`);
            const targetKey = `${report.target_type}:${report.target_id}`;

            // FIX: use augmented types so TS knows about hidden_* fields
            const sourceRecord: AugmentedPost | AugmentedComment | undefined =
              report.target_type === 'post'
                ? posts.find((p) => p.id === report.target_id)
                : comments.find((c) => c.id === report.target_id);

            const targetHidden     = !!sourceRecord?.hidden;
            // FIX: separate busy flags per action type
            const isSavingNote     = savingNoteId      === report.id;
            const isUpdatingStatus = updatingId        === report.id;
            const isUpdatingTarget = updatingTargetKey === targetKey;
            const anyBusy          = isSavingNote || isUpdatingStatus || isUpdatingTarget;

            const statusBg   = statusColor[report.status]     ?? '#F5F0EC';
            const statusText = statusTextColor[report.status] ?? 'var(--muted)';

            return (
              <article
                key={report.id}
                className="post-card vellum"
                style={{ borderRadius: 24, padding: '1.1rem', clipPath: 'none', opacity: anyBusy ? 0.8 : 1, transition: 'opacity .2s' }}
              >
                {/* ── Report meta row ─────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  {/* Reason badge */}
                  <span style={{ fontSize: 11, borderRadius: 999, padding: '4px 9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', background: '#FAEAEA', color: 'var(--red)' }}>
                    {report.reason}
                  </span>

                  {/* Target type + time */}
                  <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>
                    {report.target_type} · {formatTimeAgo(report.created_at)}
                  </span>

                  {/* Status badge */}
                  <span style={{ marginLeft: 'auto', fontSize: 11, borderRadius: 999, padding: '4px 9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', background: statusBg, color: statusText }}>
                    {report.status}
                  </span>

                  {targetHidden && (
                    <span style={{ fontSize: 11, borderRadius: 999, padding: '4px 9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', background: 'var(--ink)', color: '#F5F0EC' }}>
                      hidden
                    </span>
                  )}
                </div>

                {/* ── Content preview ─────────────────────────────────── */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--font-display), serif', fontSize: '1.4rem', color: 'var(--ink)', marginBottom: 4 }}>
                    {target?.headline ?? `${report.target_type === 'post' ? 'Post' : 'Comment'} #${report.target_id}`}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>
                    by {getAnonymousHandle(target?.author ?? 'anonymous')}
                  </div>
                  <div className="mini-live-card">
                    <div className="mini-live-copy">
                      {target?.body || 'This content may have been deleted or is outside the loaded window.'}
                    </div>
                  </div>

                  {targetHidden && (
                    <div style={{ marginTop: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.7rem', color: 'var(--muted)', fontSize: 12 }}>
                      Hidden {sourceRecord?.hidden_at ? formatTimeAgo(sourceRecord.hidden_at) : 'recently'}
                      {sourceRecord?.hidden_by ? ` by ${getAnonymousHandle(sourceRecord.hidden_by)}` : ''}
                      {sourceRecord?.hidden_reason ? ` · reason: ${sourceRecord.hidden_reason}` : ''}.
                    </div>
                  )}
                </div>

                {/* ── Reporter note ────────────────────────────────────── */}
                {report.details ? (
                  <div className="mini-live-card" style={{ marginBottom: 10 }}>
                    <div className="mini-live-label">Reporter note</div>
                    <div className="mini-live-copy">{report.details}</div>
                  </div>
                ) : null}

                {/* ── Moderator note ───────────────────────────────────── */}
                <div style={{ marginBottom: 10 }}>
                  <div className="mini-live-label" style={{ marginBottom: 6 }}>Moderator note</div>
                  <textarea
                    value={moderationNotes[report.id] ?? ''}
                    onChange={(e) =>
                      setModerationNotes((prev) => ({ ...prev, [report.id]: e.target.value }))
                    }
                    placeholder="Internal note for follow-up or context."
                    style={{
                      width: '100%',
                      minHeight: 88,
                      border: '1px solid var(--border)',
                      borderRadius: 16,
                      padding: '10px 12px',
                      background: 'rgba(255,253,247,.82)',
                      resize: 'vertical',
                      fontFamily: 'var(--font-body), sans-serif',
                      fontSize: 13,
                      color: 'var(--ink)',
                      lineHeight: 1.5,
                      // FIX: prevent textarea from overflowing its container
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Open thread link */}
                {(report.target_type === 'post' || target?.postId) && (
                  <Link
                    href={`/?thread=${report.target_type === 'post' ? report.target_id : target?.postId ?? ''}`}
                    style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13 }}
                  >
                    Open thread ↗
                  </Link>
                )}

                {/* ── Action buttons ────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {/* Save note */}
                  <button
                    type="button"
                    onClick={() => void saveModerationNotes(report.id)}
                    disabled={isSavingNote}
                    style={{
                      cursor: isSavingNote ? 'not-allowed' : 'pointer',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      padding: '8px 12px',
                      borderRadius: 999,
                      fontSize: 13,
                      opacity: isSavingNote ? 0.7 : 1,
                    }}
                  >
                    {isSavingNote ? 'Saving…' : 'Save note'}
                  </button>

                  {/* Mark reviewed */}
                  <button
                    type="button"
                    onClick={() => void updateReportStatus(report.id, 'reviewed')}
                    disabled={isUpdatingStatus || report.status === 'reviewed'}
                    style={{
                      cursor: (isUpdatingStatus || report.status === 'reviewed') ? 'not-allowed' : 'pointer',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      padding: '8px 12px',
                      borderRadius: 999,
                      fontSize: 13,
                      opacity: (isUpdatingStatus || report.status === 'reviewed') ? 0.5 : 1,
                    }}
                  >
                    {isUpdatingStatus ? 'Updating…' : '✓ Mark reviewed'}
                  </button>

                  {/* Dismiss */}
                  <button
                    type="button"
                    onClick={() => void updateReportStatus(report.id, 'dismissed')}
                    disabled={isUpdatingStatus || report.status === 'dismissed'}
                    style={{
                      cursor: (isUpdatingStatus || report.status === 'dismissed') ? 'not-allowed' : 'pointer',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--muted)',
                      padding: '8px 12px',
                      borderRadius: 999,
                      fontSize: 13,
                      opacity: (isUpdatingStatus || report.status === 'dismissed') ? 0.5 : 1,
                    }}
                  >
                    Dismiss
                  </button>

                  {/* Hide / unhide */}
                  <button
                    type="button"
                    onClick={() => void updateTargetVisibility(report, !targetHidden)}
                    disabled={isUpdatingTarget}
                    className={targetHidden ? '' : 'button-primary'}
                    style={{
                      cursor: isUpdatingTarget ? 'not-allowed' : 'pointer',
                      border:      targetHidden ? '1px solid var(--border)' : 'none',
                      background:  targetHidden ? 'var(--surface)' : undefined,
                      color:       targetHidden ? 'var(--text)'    : undefined,
                      padding: '8px 12px',
                      borderRadius: 999,
                      fontSize: 13,
                      opacity: isUpdatingTarget ? 0.7 : 1,
                    }}
                  >
                    {isUpdatingTarget
                      ? (targetHidden ? 'Restoring…' : 'Hiding…')
                      : (targetHidden ? 'Unhide content' : 'Hide content')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
