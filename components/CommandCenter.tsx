'use client';

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { postCategories } from '@/components/home/types';

type CommandAction = {
  eyebrow: string;
  hint: string;
  id: string;
  keywords: string[];
  run: () => void;
  title: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export default function CommandCenter() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const moderatorEmails = useMemo(
    () =>
      (process.env.NEXT_PUBLIC_MODERATOR_EMAILS ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    [],
  );
  const isModerator = !!user?.email && moderatorEmails.includes(user.email.toLowerCase());

  const closeCenter = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const openCenter = useCallback(() => {
    setOpen(true);
  }, []);

  const goTo = useCallback((href: string) => {
    startTransition(() => {
      router.push(href);
    });
  }, [router]);

  const runSearch = useCallback((value: string) => {
    startTransition(() => {
      router.push('/');
    });

    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('casebook:search-change', { detail: value }));
    }, pathname === '/' ? 0 : 120);
  }, [pathname, router]);

  const actions = useMemo<CommandAction[]>(() => {
    const baseActions: CommandAction[] = [
      {
        eyebrow: 'Create',
        hint: 'N',
        id: 'new-brief',
        keywords: ['ask', 'post', 'question', 'anonymous', 'brief'],
        run: () => window.dispatchEvent(new CustomEvent('casebook:open-ask-modal')),
        title: 'Draft a new anonymous brief',
      },
      {
        eyebrow: 'Navigate',
        hint: '/',
        id: 'home',
        keywords: ['home', 'feed', 'briefs', 'discussions'],
        run: () => goTo('/'),
        title: 'Open the live brief feed',
      },
      {
        eyebrow: 'Rooms',
        hint: 'T',
        id: 'topics',
        keywords: ['topics', 'rooms', 'index', 'categories'],
        run: () => goTo('/topics'),
        title: 'Browse topic rooms',
      },
      {
        eyebrow: 'System',
        hint: 'S',
        id: 'setup',
        keywords: ['setup', 'readiness', 'supabase', 'health'],
        run: () => goTo('/setup'),
        title: 'Check launch readiness',
      },
    ];

    if (isModerator) {
      baseActions.push({
        eyebrow: 'Review',
        hint: 'M',
        id: 'moderation',
        keywords: ['moderation', 'reports', 'review', 'hidden'],
        run: () => goTo('/moderation'),
        title: 'Open moderation queue',
      });
    }

    return [
      ...baseActions,
      ...postCategories.map((category) => ({
        eyebrow: 'Room',
        hint: 'Enter',
        id: `room-${category}`,
        keywords: ['room', 'topic', 'category', category],
        run: () => goTo(`/?category=${encodeURIComponent(category)}`),
        title: `Enter ${category}`,
      })),
    ];
  }, [goTo, isModerator]);

  const visibleActions = useMemo(() => {
    const normalizedQuery = normalize(deferredQuery);

    if (!normalizedQuery) {
      return actions;
    }

    return [
      {
        eyebrow: 'Search',
        hint: 'Enter',
        id: 'search-feed',
        keywords: ['search', normalizedQuery],
        run: () => runSearch(deferredQuery),
        title: `Search briefs for "${deferredQuery.trim()}"`,
      },
      ...actions.filter((action) => {
        const haystack = [action.eyebrow, action.title, ...action.keywords].join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    ];
  }, [actions, deferredQuery, runSearch]);

  const onGlobalKeydown = useCallback((event: KeyboardEvent) => {
    const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';

    if (isCommandK) {
      event.preventDefault();
      openCenter();
      return;
    }

    if (event.key === 'Escape' && open) {
      closeCenter();
    }
  }, [closeCenter, open, openCenter]);

  useEffect(() => {
    window.addEventListener('keydown', onGlobalKeydown);
    window.addEventListener('casebook:open-command-center', openCenter);

    return () => {
      window.removeEventListener('keydown', onGlobalKeydown);
      window.removeEventListener('casebook:open-command-center', openCenter);
    };
  }, [onGlobalKeydown, openCenter]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 40);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const safeActiveIndex = Math.min(activeIndex, Math.max(visibleActions.length - 1, 0));

  const runAction = (action: CommandAction) => {
    action.run();
    closeCenter();
  };

  return (
    <div
      className="command-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeCenter();
        }
      }}
    >
      <section
        aria-label="Casebook command center"
        className="command-shell"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((currentIndex) => (currentIndex + 1) % Math.max(visibleActions.length, 1));
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((currentIndex) => (currentIndex - 1 + visibleActions.length) % Math.max(visibleActions.length, 1));
          }

          if (event.key === 'Enter' && visibleActions[safeActiveIndex]) {
            event.preventDefault();
            runAction(visibleActions[safeActiveIndex]);
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-header">
          <div>
            <p className="luxury-kicker">Casebook command</p>
            <h2>Move through the forum at speed.</h2>
          </div>
          <kbd>Esc</kbd>
        </div>

        <div className="command-input-wrap">
          <span>Search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Ask, search, jump to rooms, open moderation..."
          />
          <kbd>Ctrl K</kbd>
        </div>

        <div className="command-list">
          {visibleActions.length === 0 ? (
            <div className="command-empty">No matching command yet.</div>
          ) : (
            visibleActions.slice(0, 9).map((action, index) => (
              <button
                key={action.id}
                className={`command-action${index === safeActiveIndex ? ' active' : ''}`}
                onClick={() => runAction(action)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span>
                  <strong>{action.title}</strong>
                  <small>{action.eyebrow}</small>
                </span>
                <kbd>{action.hint}</kbd>
              </button>
            ))
          )}
        </div>

        <div className="command-footer">
          <span>Up/Down select</span>
          <span>Enter open</span>
          <span>Ctrl/Cmd K anywhere</span>
        </div>
      </section>
    </div>
  );
}
