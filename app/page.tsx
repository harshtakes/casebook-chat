'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const [posts, setPosts] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [author, setAuthor] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadPosts()
  }, [])

  async function loadPosts() {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
    setPosts(data || [])
  }

  async function submitPost() {
    if (!title.trim()) return
    setLoading(true)
    await supabase.from('posts').insert({
      title,
      body,
      author: author || 'Anonymous'
    })
    setTitle('')
    setBody('')
    setAuthor('')
    setShowForm(false)
    setLoading(false)
    loadPosts()
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-orange-500">casebook<span className="text-green-500">.chat</span></h1>
        <div className="flex gap-3">
          <button className="text-sm text-gray-600 hover:text-gray-900">Log in</button>
          <button className="text-sm bg-orange-500 text-white px-4 py-2 rounded-full hover:bg-orange-600">Sign up</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto mt-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Latest Conversations</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-sm bg-orange-500 text-white px-4 py-2 rounded-full hover:bg-orange-600">
            {showForm ? 'Cancel' : '+ New Post'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 mb-6">
            <input
              className="w-full border border-gray-200 rounded-lg px-4 py-2 mb-3 text-sm focus:outline-none focus:border-orange-400"
              placeholder="Title (required)"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <textarea
              className="w-full border border-gray-200 rounded-lg px-4 py-2 mb-3 text-sm focus:outline-none focus:border-orange-400"
              placeholder="Details (optional)"
              rows={4}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
            <input
              className="w-full border border-gray-200 rounded-lg px-4 py-2 mb-3 text-sm focus:outline-none focus:border-orange-400"
              placeholder="Your name (leave blank for Anonymous)"
              value={author}
              onChange={e => setAuthor(e.target.value)}
            />
            <button
              onClick={submitPost}
              disabled={loading}
              className="bg-orange-500 text-white px-6 py-2 rounded-full text-sm hover:bg-orange-600 disabled:opacity-50">
              {loading ? 'Posting...' : 'Post'}
            </button>
          </div>
        )}

        {posts.length === 0 && (
          <p className="text-gray-400 text-sm">No posts yet. Be the first!</p>
        )}

        {posts.map((post) => (
          <div key={post.id} className="bg-white border border-gray-200 rounded-xl px-6 py-4 mb-3 hover:shadow-md cursor-pointer transition-shadow">
            <p className="text-gray-800 font-medium">{post.title}</p>
            <div className="flex gap-4 mt-2 text-sm text-gray-400">
              <span>{post.author}</span>
              <span>{new Date(post.created_at).toLocaleDateString('en-IN')}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}