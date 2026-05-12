import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './env.mjs';

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.');
  process.exitCode = 1;
  throw new Error('Missing Supabase environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const demoPosts = [
  {
    title: 'How should a first-year law student approach internship cold emails?',
    body: 'Looking for practical advice on timing, email length, and whether attaching a CV too early looks pushy.',
    author: 'demo.firstyear@example.com',
    mood: 'neutral',
    category: 'Internships',
    upvotes: 4,
    reply_count: 0,
    hidden: false,
  },
  {
    title: 'Is a small chamber better than a big firm for litigation exposure?',
    body: 'I am trying to choose between a district court chamber and a known firm internship. What should I optimize for?',
    author: 'demo.litigation@example.com',
    mood: 'debated',
    category: 'Chambers',
    upvotes: 7,
    reply_count: 0,
    hidden: false,
  },
  {
    title: 'What salary range should fresh law graduates realistically expect?',
    body: 'Anonymous ranges would help. Please mention city and type of workplace if possible.',
    author: 'demo.salary@example.com',
    mood: 'hot',
    category: 'Salaries',
    upvotes: 12,
    reply_count: 0,
    hidden: false,
  },
];

async function insertPost(post) {
  let response = await supabase.from('posts').insert(post).select('*').single();

  if (response.error && response.error.message.toLowerCase().includes('column')) {
    const fallbackPost = {
      title: post.title,
      body: post.body,
      author: post.author,
      mood: post.mood,
      upvotes: post.upvotes,
      reply_count: post.reply_count,
    };
    response = await supabase.from('posts').insert(fallbackPost).select('*').single();
  }

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

try {
  const insertedPosts = [];

  for (const post of demoPosts) {
    insertedPosts.push(await insertPost(post));
  }

  const firstPost = insertedPosts[0];

  if (firstPost?.id) {
    const demoComment = {
      post_id: firstPost.id,
      body: 'Keep the email short, add one specific reason for writing, and attach a one-page CV.',
      author: 'demo.reply@example.com',
      hidden: false,
    };
    let commentResponse = await supabase.from('comments').insert(demoComment);

    if (commentResponse.error && commentResponse.error.message.toLowerCase().includes('column')) {
      commentResponse = await supabase.from('comments').insert({
        post_id: demoComment.post_id,
        body: demoComment.body,
        author: demoComment.author,
      });
    }

    if (commentResponse.error) {
      throw new Error(commentResponse.error.message);
    }
  }

  console.log(`Seeded ${insertedPosts.length} demo posts.`);
  console.log('Open http://localhost:3000/topics and http://localhost:3000/?category=Internships to review them.');
} catch (error) {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
