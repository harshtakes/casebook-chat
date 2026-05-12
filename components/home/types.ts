export type SortKey = 'hot' | 'new' | 'top' | 'unanswered';
export type Mood = 'hot' | 'answered' | 'debated' | 'neutral';

export type Post = {
  id: string;
  title: string;
  body: string;
  author: string;
  category?: string | null;
  created_at: string;
  mood: Mood;
  reply_count: number;
  upvotes: number;
  hidden?: boolean | null;
  hidden_at?: string | null;
  hidden_by?: string | null;
  hidden_reason?: string | null;
};

export type Comment = {
  id: string;
  post_id: string;
  body: string;
  author: string;
  created_at: string;
  hidden?: boolean | null;
  hidden_at?: string | null;
  hidden_by?: string | null;
  hidden_reason?: string | null;
};

export type ReportReason =
  | 'harassment'
  | 'spam'
  | 'privacy'
  | 'misinformation'
  | 'other';

export type ReportTarget = {
  id: string;
  type: 'post' | 'comment';
  title: string;
  body: string;
  author: string;
};

export type ReportRecord = {
  id: string;
  target_id: string;
  target_type: 'post' | 'comment';
  reason: ReportReason;
  details: string | null;
  reporter_email: string | null;
  status: string;
  moderation_notes?: string | null;
  created_at: string;
};

export const postCategories = [
  'Recruitment',
  'Internships',
  'Law School',
  'Firms',
  'Chambers',
  'Salaries',
  'Work-Life',
  'Career Advice',
] as const;

export type PostCategory = (typeof postCategories)[number];

export const moodMeta: Record<Mood, { label: string; className: string }> = {
  hot: { label: 'Hot topic', className: 'tag-hot' },
  answered: { label: 'Answered', className: 'tag-answered' },
  debated: { label: 'Active debate', className: 'tag-debated' },
  neutral: { label: 'Open question', className: '' },
};

const aliasAdjectives = [
  'Amber',
  'Quiet',
  'Candid',
  'Steady',
  'Clever',
  'Lucid',
  'Kind',
  'Sharp',
];

const aliasNouns = [
  'Brief',
  'Quill',
  'Atlas',
  'Verdict',
  'Harbor',
  'Ledger',
  'Signal',
  'Clover',
];

export function getAnonymousHandle(author: string) {
  const value = author?.trim() || 'anonymous';
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  const adjective = aliasAdjectives[hash % aliasAdjectives.length];
  const noun = aliasNouns[Math.floor(hash / aliasAdjectives.length) % aliasNouns.length];
  const suffix = String(hash % 1000).padStart(3, '0');

  return `${adjective} ${noun} ${suffix}`;
}

export function formatTimeAgo(timestamp: string) {
  const diffInSeconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));

  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

export function shareLinkForPost(postId: string) {
  if (typeof window === 'undefined') {
    return '';
  }

  const url = new URL(window.location.href);
  url.searchParams.set('thread', postId);
  return url.toString();
}
