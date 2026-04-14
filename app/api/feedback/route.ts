import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { userId, recommendationId, rating } = body as {
    userId: string
    recommendationId: string
    rating: 'thumbs_up' | 'thumbs_down'
  }

  if (!userId || !rating) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!['thumbs_up', 'thumbs_down'].includes(rating)) {
    return Response.json({ error: 'Invalid rating' }, { status: 400 })
  }

  try {
    const db = createServerClient()
    const changeableUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour from now

    if (recommendationId) {
      await db.from('feedback').upsert(
        {
          recommendation_id: recommendationId,
          user_id: userId,
          rating,
          changeable_until: changeableUntil,
        },
        { onConflict: 'recommendation_id,user_id' }
      )
    }

    return Response.json({ success: true })
  } catch {
    // Supabase not configured — acknowledge silently
    return Response.json({ success: true, persisted: false })
  }
}
