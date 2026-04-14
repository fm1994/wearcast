import { createServerClient } from '@/lib/supabase'

interface FeedbackRow {
  rating: string
  weather_conditions_snapshot: Record<string, unknown>
  recommendations: {
    date: string
    weather_snapshot: Record<string, unknown>
  } | null
}

interface Stats {
  total: number
  thumbsUp: number
  thumbsDown: number
  approvalRate: number
}

async function getFeedbackStats(): Promise<{ stats: Stats; recent: FeedbackRow[] } | null> {
  try {
    const db = createServerClient()

    const { data, error } = await db
      .from('feedback')
      .select('rating, weather_conditions_snapshot, recommendations(date, weather_snapshot)')
      .order('timestamp', { ascending: false })
      .limit(100)

    if (error) return null

    const rows = (data || []) as unknown as FeedbackRow[]
    const total = rows.length
    const thumbsUp = rows.filter((r) => r.rating === 'thumbs_up').length
    const thumbsDown = rows.filter((r) => r.rating === 'thumbs_down').length
    const approvalRate = total > 0 ? Math.round((thumbsUp / total) * 100) : 0

    return { stats: { total, thumbsUp, thumbsDown, approvalRate }, recent: rows }
  } catch {
    return null
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ pw?: string }>
}) {
  const params = await searchParams
  const password = params.pw
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminPassword || password !== adminPassword) {
    return (
      <main className="flex items-center justify-center min-h-screen px-6" style={{ background: 'var(--background)' }}>
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Admin access required</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Access via <code className="bg-gray-100 px-1 rounded">/admin?pw=yourpassword</code>
          </p>
        </div>
      </main>
    )
  }

  const result = await getFeedbackStats()

  return (
    <main className="min-h-screen px-4 py-8 max-w-lg mx-auto" style={{ background: 'var(--background)' }}>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>WearCast Admin</h1>

      {!result ? (
        <div className="rounded-2xl p-5" style={{ background: 'var(--card)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Supabase not configured or no data yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--card)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>Total ratings</p>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{result.stats.total}</p>
            </div>
            <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--card)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>Approval rate</p>
              <p className="text-3xl font-bold" style={{ color: result.stats.approvalRate >= 70 ? '#34c759' : '#ff9500' }}>
                {result.stats.approvalRate}%
              </p>
            </div>
            <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--card)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>👍 Thumbs up</p>
              <p className="text-3xl font-bold text-green-600">{result.stats.thumbsUp}</p>
            </div>
            <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--card)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>👎 Thumbs down</p>
              <p className="text-3xl font-bold text-red-500">{result.stats.thumbsDown}</p>
            </div>
          </div>

          <div className="rounded-2xl p-5 shadow-sm" style={{ background: 'var(--card)' }}>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Recent feedback</h2>
            {result.recent.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No feedback yet.</p>
            ) : (
              <div className="space-y-2">
                {result.recent.slice(0, 20).map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {row.recommendations?.date || 'Unknown date'}
                    </span>
                    <span className="text-lg">{row.rating === 'thumbs_up' ? '👍' : '👎'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}
