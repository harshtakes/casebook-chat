'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import AuthModal from '@/components/AuthModal';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const [showAuth,    setShowAuth]    = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : null;

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 200,
        height: 'var(--nav-h, 52px)',
        display: 'flex', alignItems: 'center',
        padding: '0 28px',
        background: 'rgba(242,236,223,0.88)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border, rgba(189,175,150,.35))',
        justifyContent: 'space-between',
      }}>
        {/* wordmark */}
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 17, fontWeight: 700,
            color: 'var(--ink, #1A1410)',
            letterSpacing: '-0.02em',
          }}>casebook</span>
          <span style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 17, fontWeight: 700,
            color: 'var(--accent, #176B60)',
            fontStyle: 'italic',
          }}>.chat</span>
        </a>

        {/* right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user ? (
            /* ── logged in ── */
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowDropdown(d => !d)}
                title={user.email ?? ''}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'var(--accent, #176B60)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono, monospace)',
                  letterSpacing: '0.04em',
                }}
              >
                {initials}
              </button>

              {showDropdown && (
                <>
                  {/* backdrop */}
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 299 }}
                    onClick={() => setShowDropdown(false)}
                  />
                  <div style={{
                    position: 'absolute', top: 42, right: 0, zIndex: 300,
                    background: 'var(--surface, #FDFAF3)',
                    border: '1px solid var(--border, rgba(189,175,150,.4))',
                    borderRadius: 12, padding: '8px 0',
                    minWidth: 200,
                    boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
                  }}>
                    <div style={{
                      padding: '8px 16px 10px',
                      borderBottom: '1px solid var(--border, rgba(189,175,150,.3))',
                      marginBottom: 4,
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--muted, #817567)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                        Signed in as
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text, #2A2520)', fontWeight: 500, wordBreak: 'break-all' }}>
                        {user.email}
                      </div>
                    </div>

                    <button
                      onClick={async () => { setShowDropdown(false); await signOut(); }}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '9px 16px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 13, color: 'var(--muted, #817567)',
                        fontFamily: 'var(--font-sans, sans-serif)',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(189,175,150,0.18)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── logged out ── */
            <button
              onClick={() => setShowAuth(true)}
              style={{
                padding: '7px 16px',
                background: 'transparent',
                border: '1px solid var(--border, rgba(189,175,150,.5))',
                borderRadius: 8,
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text, #2A2520)',
                cursor: 'pointer',
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--accent, #176B60)';
                e.currentTarget.style.color = 'var(--accent, #176B60)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border, rgba(189,175,150,.5))';
                e.currentTarget.style.color = 'var(--text, #2A2520)';
              }}
            >
              Login
            </button>
          )}

          {/* + ASK button */}
          <button
            className="nav-cta"
            onClick={() => window.dispatchEvent(new Event('openAskModal'))}
            style={{ padding: '7px 16px', borderRadius: 9, fontSize: 12 }}
          >
            + Ask
          </button>
        </div>
      </nav>

      {/* auth modal */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
