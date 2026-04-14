# WearCast

> *What should I wear today?* — answered in seconds, grounded in real weather data.

WearCast is an AI-powered outfit assistant that fetches live forecasts for any city, reasons about your specific wardrobe, and gives you a single plain-English recommendation. No generic advice. No "dress in layers." Just: *wear your light trousers and sneakers, it's 29°C and the evening won't cool down.*

**Live demo:** [add your Vercel URL here]

---

## Why this exists

Weather apps tell you the temperature. They don't tell you what to do with it. Deciding what to wear still requires translating "27°C, 40% humidity, UV 6" into an actual outfit — a small but daily cognitive load that compounds fast.

WearCast closes that gap by combining real forecast data with your actual wardrobe, rather than giving hypothetical advice about clothes you might not own.

---

## How it works

The flow is intentionally simple: **location → weather brief → wardrobe → outfit recommendation.**

### 1. Weather (dual-model + disagreement detection)

The weather API fetches from two independent models in parallel — **GFS** (NOAA) and **ECMWF IFS** — and averages their temperature, wind, and precipitation readings. If the models disagree by more than 3°C on the upcoming hours, the app flags this and tells the recommendation model to lean conservative.

This matters because a single model can be confidently wrong. Running two and exposing the disagreement is a cheap reliability signal that most weather apps don't surface.

### 2. Climate zone calibration

The app detects your climate zone (`hot_arid`, `hot_humid`, `tropical`, `warm_temperate`, `temperate`, `cold`) from the daily high and humidity reading. This prevents a critical failure mode: a temperate-trained AI telling someone in Delhi to "add a light layer for the cooler evening" when 25°C at midnight is still warm.

The zone is passed to the recommendation model alongside the raw temperature data.

### 3. Wardrobe pre-filtering (before the LLM ever sees it)

Before the recommendation call, the API runs a deterministic filter on the user's wardrobe using hard temperature thresholds:

- **Hot (>26°C feels-like):** only thin tops pass — no sweaters, no jackets
- **Warm (>22°C):** no heavy trousers or thermal leggings
- **Rainy:** no sandals for moderate/heavy rain
- **Sub-zero only:** snow boots are included; otherwise they're invisible

The LLM only ever sees items that are physically appropriate for the current weather. This dramatically reduces hallucination risk and keeps prompt length low.

### 4. Situational hints

After filtering, the API computes targeted one-line instructions for the LLM based on what the user actually owns:

- *"Moderate rain (72%): their waterproof jacket is the pick — skip umbrella."*
- *"Temperature drops 11°C through the day — one removable layer is justified (evening: 14°C)."*
- *"Hot day — include water bottle in CARRY. Non-negotiable."*

These hints replace vague rules with situation-specific guidance, and they're based on the user's inventory — not generic assumptions.

### 5. Fast inference via Cerebras

The recommendation prompt is short by design (pre-filtering ensures that). It runs on **Cerebras** (llama3.1-8b) which returns in ~300ms — fast enough that the recommendation feels instant after the weather fetch.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | API routes + client rendering in one repo |
| Inference | Cerebras Cloud SDK (llama3.1-8b) | ~300ms latency, no streaming needed |
| Weather data | Open-Meteo (GFS + ECMWF) | Free, global, no API key required |
| Persistence | Supabase | One recommendation per user per day, cached |
| Styling | CSS custom properties + inline styles | Zero build complexity, fast iteration |

---

## Running locally

```bash
git clone <repo>
cd wearcast
npm install

# Copy the example env and fill in your keys
cp .env.local.example .env.local
```

Required environment variables:

```
CEREBRAS_API_KEY=      # Get at cerebras.ai
NEXT_PUBLIC_SUPABASE_URL=      # Optional — app works without it
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Optional — skips caching if absent
```

```bash
npm run dev
# open http://localhost:3000
```

The app works without Supabase — recommendations just won't be cached between sessions.

---

## Deploying to Vercel

```bash
npm install -g vercel
vercel
```

Add `CEREBRAS_API_KEY` in your Vercel project environment variables. The app is ready to deploy as-is.

---

## Key product decisions

**Why not use GPT-4 or Claude for the outfit recommendation?**
The recommendation task is actually narrow and well-constrained once the weather signals are computed and the wardrobe is pre-filtered. A smaller, faster model is the right fit. Cerebras on llama3.1-8b handles it reliably at a fraction of the cost and latency.

**Why pre-filter the wardrobe in code rather than letting the LLM decide?**
LLMs will rationalize almost any clothing choice if the item is visible in the prompt. By filtering first, we enforce hard physical rules that the model can't override — a cardigan simply won't appear in the prompt on a 35°C day.

**Why two weather models?**
Model disagreement is a real signal. When GFS says 18°C and ECMWF says 24°C, the right answer isn't to average and pretend — it's to surface the uncertainty and dress conservatively.

---

## Project structure

```
app/
  api/
    weather/route.ts     — dual-model fetch, cache, summary
    brief/route.ts       — LLM weather descriptor ("scorching hot")
    recommend/route.ts   — wardrobe filter + LLM outfit call
    feedback/route.ts    — thumbs up/down stored in Supabase
    geocode/route.ts     — city autocomplete
  onboarding/wardrobe/   — wardrobe setup screen
  page.tsx               — main 4-screen flow
lib/
  wardrobe-items.ts      — item catalogue with weight metadata
  supabase.ts            — server client
```
