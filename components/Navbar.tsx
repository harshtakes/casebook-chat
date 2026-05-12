'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

interface NavbarProps {
  onSortChange?: (sort: 'hot' | 'new' | 'top' | 'unanswered') => void;
  currentSort?: string;
}

export default function Navbar({ onSortChange, currentSort = 'hot' }: NavbarProps) {
  const { user, signOut } = useAuth();

  const openAsk = useCallback(() => {
    window.dispatchEvent(new CustomEvent('openAskModal'));
  }, []);

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 200,
      height: 'var(--nav-h)',
      background: 'rgba(251,248,240,0.82)',
      backdropFilter: 'blur(22px) saturate(1.15)',
      borderBottom: '1px solid rgba(189,175,150,0.46)',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px', gap: '1rem',
      boxShadow: '0 10px 32px rgba(39,33,23,.06)',
    }}>

      {/* Brand */}
      <Link href="/" style={{
        fontFamily: 'var(--font-display), serif',
        fontSize: '1.28rem', fontWeight: 700,
        color: 'var(--ink)', textDecoration: 'none',
        letterSpacing: '-0.025em',
        display: 'flex', alignItems: 'center', gap: 10,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        <span className="brand-dot" />
        casebook<span style={{ color: 'var(--stamp)', fontStyle: 'italic' }}>.chat</span>
      </Link>

      {/* Sort pills — centre */}
      {onSortChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {([
            ['hot',        '🔥 Hot'],
            ['new',        '✦ New'],
            ['top',        '↑ Top'],
            ['unanswered', '◯ Open'],
          ] as const).map(([s, label]) => (
            <button
              key={s}
              className={`nav-pill${currentSort === s ? ' active' : ''}`}
              onClick={() => onSortChange(s)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Right: auth + ask */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {user ? (
          <>
            {/* Avatar */}
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), #0D4F46)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono), monospace',
              letterSpacing: '0.05em', flexShrink: 0,
            }}>
              {(user.email ?? 'AN').slice(0, 2).toUpperCase()}
            </div>
            <button
              onClick={signOut}
              style={{
                fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none',
                padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Out
            </button>
          </>
        ) : (
          <Link href="/auth" style={{
            fontSize: 11, color: 'var(--muted)', textDecoration: 'none',
            fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.08em',
            textTransform: 'uppercase', padding: '4px 8px',
          }}>
            Login
          </Link>
        )}

        <button className="nav-cta" onClick={openAsk}>
          + Ask
        </button>
      </div>
    </nav>
  );
}
