'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

type Props = {
  onClose: () => void;
  /** If set, shows a contextual nudge above the form */
  nudge?: string;
};

export default function AuthModal({ onClose, nudge }: Props) {
  const { signIn, signUp } = useAuth();

  const [mode,     setMode]     = useState<'login' | 'signup'>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [working,  setWorking]  = useState(false);
  const [done,     setDone]     = useState(false); // signup confirmation

  async function handleSubmit() {
    setError('');
    if (!email.trim() || !password.trim()) { setError('Please fill in both fields.'); return; }
    setWorking(true);

    const fn = mode === 'login' ? signIn : signUp;
    const { error: err } = await fn(email.trim(), password);

    if (err) {
      setError(err);
      setWorking(false);
      return;
    }

    if (mode === 'signup') {
      setDone(true); // show "check your email" message
    } else {
      onClose();
    }
    setWorking(false);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(20,20,18,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface, #FDFAF3)',
        border: '1px solid var(--border, rgba(189,175,150,.4))',
        borderRadius: 18,
        padding: '32px 28px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        position: 'relative',
      }}>
        {/* close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            border: 'none', background: 'var(--tag-bg, #EEE5D3)',
            color: 'var(--muted, #817567)', width: 28, height: 28,
            borderRadius: 7, cursor: 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>

        {done ? (
          /* ── signup confirmation ── */
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
            <div style={{ fontFamily: 'var(--font-display, serif)', fontSize: 20, color: 'var(--ink, #1A1410)', marginBottom: 8 }}>
              Check your inbox
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted, #817567)', lineHeight: 1.6 }}>
              We sent a confirmation link to <strong style={{ color: 'var(--text, #2A2520)' }}>{email}</strong>.
              Click it to activate your account, then log in.
            </p>
            <button
              onClick={() => { setDone(false); setMode('login'); }}
              style={{
                marginTop: 20, width: '100%', padding: '10px 0',
                background: 'var(--accent, #176B60)', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 13,
                cursor: 'pointer', fontWeight: 600,
              }}
            >Go to login</button>
          </div>
        ) : (
          <>
            {/* nudge banner */}
            {nudge && (
              <div style={{
                background: 'rgba(23,107,96,0.08)',
                border: '1px solid rgba(23,107,96,0.18)',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 12, color: 'var(--accent, #176B60)',
                fontFamily: 'var(--font-mono, monospace)',
                letterSpacing: '0.04em',
                marginBottom: 20, lineHeight: 1.5,
              }}>
                {nudge}
              </div>
            )}

            {/* title */}
            <div style={{ fontFamily: 'var(--font-display, serif)', fontSize: 22, color: 'var(--ink, #1A1410)', marginBottom: 4 }}>
              {mode === 'login' ? 'Welcome back' : 'Join casebook'}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted, #817567)', marginBottom: 22, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}>
              {mode === 'login'
                ? 'Log in to track replies and build your profile.'
                : 'Create an account to see replies to your briefs.'}
            </p>

            {/* fields */}
            <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted, #817567)', marginBottom: 5 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="you@example.com"
              style={{
                width: '100%', padding: '10px 12px', marginBottom: 14,
                border: '1px solid var(--border, rgba(189,175,150,.5))',
                borderRadius: 9, fontSize: 14, background: 'rgba(255,253,247,0.8)',
                color: 'var(--text, #2A2520)', outline: 'none',
                fontFamily: 'var(--font-sans, sans-serif)',
                boxSizing: 'border-box',
              }}
            />

            <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted, #817567)', marginBottom: 5 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              style={{
                width: '100%', padding: '10px 12px', marginBottom: 6,
                border: '1px solid var(--border, rgba(189,175,150,.5))',
                borderRadius: 9, fontSize: 14, background: 'rgba(255,253,247,0.8)',
                color: 'var(--text, #2A2520)', outline: 'none',
                fontFamily: 'var(--font-sans, sans-serif)',
                boxSizing: 'border-box',
              }}
            />

            {/* error */}
            {error && (
              <div style={{ fontSize: 12, color: '#A84335', fontFamily: 'var(--font-mono, monospace)', marginBottom: 10, letterSpacing: '0.03em' }}>
                {error}
              </div>
            )}

            {/* submit */}
            <button
              onClick={handleSubmit}
              disabled={working}
              style={{
                width: '100%', padding: '11px 0', marginTop: 10,
                background: working ? 'var(--muted, #817567)' : 'var(--accent, #176B60)',
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 13, fontWeight: 600, cursor: working ? 'default' : 'pointer',
                transition: 'background .15s',
              }}
            >
              {working ? 'Please wait…' : mode === 'login' ? 'Log in →' : 'Create account →'}
            </button>

            {/* mode toggle */}
            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'var(--muted, #817567)', fontFamily: 'var(--font-mono, monospace)' }}>
              {mode === 'login' ? (
                <>No account?{' '}
                  <button onClick={() => { setMode('signup'); setError(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent, #176B60)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
                    Sign up free
                  </button>
                </>
              ) : (
                <>Already have an account?{' '}
                  <button onClick={() => { setMode('login'); setError(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent, #176B60)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
                    Log in
                  </button>
                </>
              )}
            </div>

            {/* anonymous note */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border, rgba(189,175,150,.3))', fontSize: 11, color: 'var(--muted, #817567)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em', textAlign: 'center', lineHeight: 1.6 }}>
              You can always post without an account — your name will never be shown.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
