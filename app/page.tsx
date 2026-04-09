export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-orange-500">casebook<span className="text-green-500">.chat</span></h1>
        <div className="flex gap-3">
          <button className="text-sm text-gray-600 hover:text-gray-900">Log in</button>
          <button className="text-sm bg-orange-500 text-white px-4 py-2 rounded-full hover:bg-orange-600">Sign up</button>
        </div>
      </header>

      {/* Thread list */}
      <div className="max-w-4xl mx-auto mt-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Latest Conversations</h2>
          <button className="text-sm bg-orange-500 text-white px-4 py-2 rounded-full hover:bg-orange-600">+ New Post</button>
        </div>

        {/* Sample threads */}
        {[
          { title: "Salary as a trainee at a T1 firm?", comments: 12, time: "2 hours ago" },
          { title: "CAM associate promotions — what's the timeline?", comments: 5, time: "3 April 2026" },
          { title: "Law firms that let you leave by 7pm", comments: 24, time: "3 days ago" },
          { title: "Is an LLB from a non-NLU worth it in 2026?", comments: 8, time: "1 week ago" },
          { title: "Net worth of corporate lawyers in India", comments: 114, time: "30 May 2021" },
        ].map((thread, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl px-6 py-4 mb-3 hover:shadow-md cursor-pointer transition-shadow">
            <p className="text-gray-800 font-medium">{thread.title}</p>
            <div className="flex gap-4 mt-2 text-sm text-gray-400">
              <span>{thread.time}</span>
              <span>💬 {thread.comments}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}