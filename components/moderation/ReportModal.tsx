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
          <button
            onClick={onCancel}
            style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}
          >
            x
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
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', padding: '10px 14px', borderRadius: 10 }}
          >
            Cancel
          </button>
          <button
            className="button-primary"
            onClick={() => void onSubmit({ reason, details })}
            disabled={submitting}
            style={{ background: 'linear-gradient(135deg, var(--red), var(--stamp))', padding: '10px 14px', borderRadius: 10, fontWeight: 700, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'Submitting...' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  );
}
