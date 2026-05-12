'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSetupChecks, SetupCheck, SetupStatus } from '@/lib/setupDiagnostics';

const statusMeta: Record<SetupStatus, { label: string; background: string; color: string }> = {
  ready: { label: 'Ready', background: '#E8F5EF', color: 'var(--green)' },
  warning: { label: 'Needs SQL', background: 'var(--accent-soft)', color: 'var(--accent)' },
  blocked: { label: 'Blocked', background: '#FAEAEA', color: 'var(--red)' },
};

export default function SetupPage() {
  const [checks, setChecks] = useState<SetupCheck[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChecks = useCallback(async () => {
    setLoading(true);
    setChecks(await getSetupChecks());
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadChecks();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadChecks]);

  const summary = useMemo(() => {
    const blocked = checks.filter((check) => check.status === 'blocked').length;
    const warning = checks.filter((check) => check.status === 'warning').length;

    if (blocked) return `${blocked} blocked setup item${blocked === 1 ? '' : 's'}`;
    if (warning) return `${warning} setup warning${warning === 1 ? '' : 's'}`;
    return 'Everything looks ready';
  }, [checks]);

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '1.4rem 1.2rem 5rem' }}>
      <section className="hero-panel panel" style={{ borderRadius: 28, padding: '1.2rem', marginBottom: '1rem' }}>
        <div className="hero-grid">
          <div className="brief-stage">
            <div className="stage-panel" style={{ padding: '1.35rem' }}>
              <p className="luxury-kicker" style={{ marginBottom: 10 }}>Launch readiness</p>
              <div className="editorial-meta" style={{ marginBottom: 12 }}>
                <span>Supabase</span>
                <span>Moderation</span>
                <span>Env health</span>
              </div>
              <h1 style={{ fontSize: '3rem', lineHeight: 0.9, color: 'var(--ink)', marginBottom: 12, maxWidth: 760 }}>
                A setup page that feels like a control room, not a plain checklist.
              </h1>
              <p style={{ color: 'var(--muted)', maxWidth: 760, fontSize: 14, marginBottom: 18 }}>
                This checks the pieces that usually make the app feel haunted: reports SQL, moderation columns, and the moderator allowlist. When something is off, this page should make the fix obvious fast.
              </p>
              <div className="stage-summary">
                <div className="summary-puck">
                  <strong>{loading ? '...' : checks.length}</strong>
                  <span>checks run</span>
                </div>
                <div className="summary-puck">
                  <strong>{loading ? '...' : summary}</strong>
                  <span>current status</span>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-aside">
            <div className="hero-signal vellum">
              <div className="aside-card-title" style={{ marginBottom: 10 }}>Actions</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <button onClick={() => void loadChecks()} className="button-primary" style={{ borderRadius: 999, padding: '10px 14px', fontWeight: 700 }}>
                  Recheck system
                </button>
                <Link href="/moderation" className="quick-action">
                  <div>
                    <strong>Open moderation desk</strong>
                    <span>Review live reports and visibility controls</span>
                  </div>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        {loading ? (
          <div style={{ color: 'var(--muted)', padding: '1rem 0' }}>Running readiness checks...</div>
        ) : (
          checks.map((check) => {
            const meta = statusMeta[check.status];

            return (
              <article key={check.id} className="post-card vellum" style={{ borderRadius: 22, padding: '1rem 1.1rem', clipPath: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  <h2 style={{ fontFamily: 'var(--font-display), serif', fontSize: '1.3rem', color: 'var(--ink)' }}>{check.label}</h2>
                  <span style={{ background: meta.background, color: meta.color, borderRadius: 999, padding: '4px 9px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {meta.label}
                  </span>
                </div>
                <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>{check.detail}</p>
              </article>
            );
          })
        )}
      </section>

      <section className="mini-live-card" style={{ marginTop: '1rem', borderRadius: 22, padding: '1.1rem' }}>
        <div className="mini-live-label">If anything is blocked</div>
        <div className="mini-live-copy" style={{ marginBottom: 10 }}>
          Fix the Supabase URL or project status first. If Supabase is reachable but schema checks fail, run the SQL file, then restart the dev server if you changed `.env.local`.
        </div>
        <code style={{ display: 'block', background: 'rgba(255,255,255,.55)', border: '1px solid rgba(222,209,187,.84)', borderRadius: 14, padding: '0.9rem', color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
          supabase/reports_setup.sql
        </code>
      </section>
    </main>
  );
}
