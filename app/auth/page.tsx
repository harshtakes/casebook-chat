'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit() {
    setError('');

    if (!email || !password) {
      setError('Please fill in both fields.');
      return;
    }

    const response = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (response.error) {
      setError(response.error.message);
      return;
    }

    if (!isLogin) {
      setDone(true);
      return;
    }

    startTransition(() => {
      router.push('/');
    });
  }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '1.4rem 1.2rem 5rem' }}>
      <section className="hero-panel panel auth-shell" style={{ borderRadius: 30, padding: '1.2rem' }}>
        <div className="hero-grid">
          <div className="brief-stage">
            <div className="stage-panel" style={{ padding: '1.45rem' }}>
              <p className="luxury-kicker" style={{ marginBottom: 10 }}>Private access</p>
              <div className="editorial-meta" style={{ marginBottom: 12 }}>
                <span>Member entry</span>
                <span>Anonymous reading stays open</span>
                <span>Posting needs sign-in</span>
              </div>
              <h1 style={{ fontSize: '3rem', lineHeight: 0.9, color: 'var(--ink)', maxWidth: 700, marginBottom: 12 }}>
                Step into the members&apos; edition when you want to file, reply, or moderate.
              </h1>
              <p style={{ maxWidth: 700, color: 'var(--muted)', fontSize: 14, marginBottom: 18 }}>
                The room stays readable in public, but participation stays gated. That keeps the forum quieter, safer, and more accountable without turning it into a social profile product.
              </p>
              <div className="signal-strip">
                {[
                  'Anonymous public handles replace raw email addresses in the feed.',
                  'Moderation access depends on the allowlist in env.',
                  'New accounts receive an inbox confirmation before joining in.',
                ].map((text) => (
                  <div key={text} className="signal-card">
                    <strong>Access note</strong>
                    <small>{text}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hero-aside">
            <div className="vellum" style={{ borderRadius: 26, padding: '1.4rem', boxShadow: '0 28px 72px rgba(0,0,0,.12), 0 8px 20px rgba(0,0,0,.05)' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
                <p className="editorial-kicker" style={{ marginBottom: 8 }}>{isLogin ? 'Member login' : 'Member sign-up'}</p>
                <Link
                  href="/"
                  style={{
                    fontFamily: 'var(--font-display), serif',
                    fontSize: '1.72rem',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    textDecoration: 'none',
                    letterSpacing: '-.03em',
                  }}
                >
                  casebook<span style={{ color: 'var(--gold)' }}>.</span>chat
                </Link>
              </div>

              {done ? (
                <div style={{ textAlign: 'center', display: 'grid', gap: 10 }}>
                  <div className="masthead-counter" style={{ justifyItems: 'center', textAlign: 'center' }}>
                    <strong style={{ fontSize: '2.4rem' }}>MAIL</strong>
                    <span>check inbox</span>
                  </div>
                  <p style={{ fontFamily: 'var(--font-display), serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--ink)' }}>
                    Check your inbox
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                    We sent a confirmation link to
                    <br />
                    <strong style={{ color: 'var(--text)' }}>{email}</strong>
                  </p>
                  <Link href="/" style={{ marginTop: 6, fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
                    Back to discussions
                  </Link>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && handleSubmit()}
                        placeholder="you@nls.ac.in"
                        style={{
                          width: '100%',
                          height: 44,
                          border: '1.5px solid var(--border)',
                          borderRadius: 14,
                          padding: '0 14px',
                          fontSize: 13,
                          color: 'var(--text)',
                          background: 'rgba(255,253,247,.84)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                        Password
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && handleSubmit()}
                        placeholder="Password"
                        style={{
                          width: '100%',
                          height: 44,
                          border: '1.5px solid var(--border)',
                          borderRadius: 14,
                          padding: '0 14px',
                          fontSize: 13,
                          color: 'var(--text)',
                          background: 'rgba(255,253,247,.84)',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  {error ? (
                    <div
                      style={{
                        background: '#FAEAEA',
                        border: '1px solid #E8C4C4',
                        borderRadius: 12,
                        padding: '10px 12px',
                        fontSize: 12,
                        color: 'var(--red)',
                        marginBottom: 14,
                      }}
                    >
                      {error}
                    </div>
                  ) : null}

                  <button
                    className="button-primary"
                    onClick={() => void handleSubmit()}
                    disabled={isPending}
                    style={{
                      width: '100%',
                      padding: '11px 16px',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 700,
                      opacity: isPending ? 0.6 : 1,
                      marginBottom: 14,
                    }}
                  >
                    {isPending ? 'Please wait...' : isLogin ? 'Log in' : 'Create account'}
                  </button>

                  <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                    {isLogin ? "Don't have an account? " : 'Already have an account? '}
                    <button
                      onClick={() => {
                        setIsLogin(!isLogin);
                        setError('');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        fontSize: 13,
                        textDecoration: 'underline',
                      }}
                    >
                      {isLogin ? 'Sign up' : 'Log in'}
                    </button>
                  </p>

                  <p style={{ textAlign: 'center', marginTop: 12 }}>
                    <Link href="/" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
                      Back to discussions
                    </Link>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
