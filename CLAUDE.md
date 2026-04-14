# WearCast — AI Weather Outfit & Carry Planner

Mobile-first PWA. Stack: Next.js (App Router) + TypeScript + Tailwind + Supabase + Claude API.
Target: Urban commuters in Canadian cities (Toronto, Vancouver, Ottawa, Montréal, Calgary).

## Core Product Rules

- Recommend ONLY wardrobe items the user has marked as owned. Never suggest items they don't have.
- Umbrella threshold: 35% precipitation probability in any 3-hour window (not 50%).
- Recommendation is locked for the day at first load. No mid-day refresh.
- No brand names in recommendations. Fully generic language only.
- Claude API temperature: 0.3. Max tokens per recommendation: 250.

## Tech Stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS
- Database + Auth: Supabase (PostgreSQL, anonymous auth)
- Weather: Open-Meteo API (free, no key). Cache 30 minutes.
- AI: Anthropic Claude API (claude-haiku-4-5-20251001)
- Push: Web Push API (PWA service worker) — Week 5
- Deployment: Vercel

## Auth Flow

- Day 1: UUID generated client-side in localStorage. No account required.
- After 3rd recommendation: prompt user to create email account (framed as cross-device sync).

## Conventions

- Supabase client: `lib/supabase.ts` (server) + `lib/supabase-client.ts` (browser)
- Claude API key: `ANTHROPIC_API_KEY` env var. Never expose to client components.
- Mobile-first: design for 390px width, then scale up.
- Design: clean, minimal, iOS-inspired. Cards, soft typography, white/light backgrounds.
- Canadian English throughout (e.g. 'colour', 'centre', postal codes).

## Key Files

- `app/page.tsx` — main page state machine (location → wardrobe → recommendation)
- `app/onboarding/wardrobe/page.tsx` — chip-based wardrobe setup
- `app/settings/page.tsx` — city, wardrobe, notification settings
- `app/admin/page.tsx` — internal feedback dashboard (password-protected)
- `app/api/weather/route.ts` — Open-Meteo fetch + 30-min in-memory cache
- `app/api/recommend/route.ts` — Claude recommendation (server-side only)
- `app/api/feedback/route.ts` — thumbs up/down storage
- `lib/wardrobe-items.ts` — wardrobe item definitions (source of truth)
- `lib/supabase.ts` — server-side Supabase client (service role key)
- `supabase/schema.sql` — run once in Supabase SQL editor

## Build Commands

- `npm run dev` (local development)
- `npm run build` (production build)

## Environment Variables

See `.env.local.example` for all required vars. App runs without Supabase/Claude configured
but will show errors when those features are triggered.
