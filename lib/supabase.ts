import { createClient } from '@supabase/supabase-js'

// Server-side client with service role key — never expose to browser
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase server env vars. See .env.local.example')
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
