'use client';

import { useState } from 'react';
import { ReportReason, ReportTarget, getAnonymousHandle } from '@/components/home/types';

type ReportModalProps = {
  submitting: boolean;
  target: ReportTarget;
  onCancel: () => void;
  onSubmit: (payload: { reason: ReportReason; details: string }) => Promise<void>;
};

const reportReasons: Array<{ value: ReportReason; label: string }> = [
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'spam', label: 'Spam or promotional content' },
  { value: 'privacy', label: 'Privacy or doxxing risk' },
  { value: 'misinformation', label: 'Misleading or unsafe advice' },
  { value: 'other', label: 'Other issue' },
];

export default function ReportModal({ submitting, target, onCancel, onSubmit }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  // FIX: track submit error so the user knows if onSubmit rejects
  const [submitError, setSubmitError] = useState('');

  // FIX: wrap onSubmit to catch rejections and surface them in the UI
  async function handleSubmit() {
    setSubmitError('');
    try {
      await onSubmit({ reason, details });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,23,20,.45)',
        backdropFilter: 'blur(6px)',
        zIndex: 650,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="vellum"
        style={{
          width: '100%',
          maxWidth: 560,
          borderRadius: 20,
          padding: '1.2rem',
          boxShadow: '0 24px 80px rgba(0,0,0,.18)',
          // FIX: ensure the modal itself doesn't overflow on small viewports
          maxHeight: '90vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display), serif', color: 'var(--ink)', fontSize: '1.34rem', lineHeight: 1.08 }}>
              Report content
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              This will create a moderation flag for review.
            </p>
          </div>
          {/* FIX: type="button" prevents accidental form submission; aria-label for screen-readers; proper × character */}
          <button
            type="button"
            aria-label="Close report dialog"
            onClick={onCancel}
            style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '0.9rem',
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
            {target.type}
          </div>
          <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>{target.title}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>
            by {getAnonymousHandle(target.author)}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.55 }}>
            {target.body || 'No additional text.'}
          </div>
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Reason</label>
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
          style={{
            width: '100%',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 12px',
            background: 'var(--bg)',
            marginBottom: 12,
            // FIX: prevent select from overflowing its container
            boxSizing: 'border-box',
          }}
        >
          {reportReasons.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Extra detail</label>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="Add context that would help a moderator review this."
          style={{
            width: '100%',
            minHeight: 110,
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 12px',
            background: 'var(--bg)',
            resize: 'vertical',
            marginBottom: 14,
            // FIX: prevent textarea from overflowing its container
            boxSizing: 'border-box',
            // FIX: match body font so textarea doesn't render in browser monospace
            fontFamily: 'var(--font-body), sans-serif',
            fontSize: 13,
            color: 'var(--ink)',
            lineHeight: 1.5,
          }}
        />

        {/* FIX: show submit error banner when onSubmit rejects */}
        {submitError && (
          <div
            style={{
              background: '#FAEAEA',
              border: '1px solid #E8C4C4',
              borderRadius: 10,
              padding: '8px 12px',
              color: 'var(--red)',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {submitError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {/* FIX: type="button" on all buttons to prevent implicit form submission */}
          <button
            type="button"
            onClick={onCancel}
            style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', padding: '10px 14px', borderRadius: 10, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{
              background: 'linear-gradient(135deg, var(--red), var(--stamp))',
              padding: '10px 14px',
              borderRadius: 10,
              fontWeight: 700,
              opacity: submitting ? 0.7 : 1,
              // FIX: show not-allowed cursor while submitting
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  );
}
