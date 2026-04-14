import { NextRequest } from 'next/server'
import Cerebras from '@cerebras/cerebras_cloud_sdk'
import { createServerClient } from '@/lib/supabase'
import { HourlyWeather } from '../weather/route'
import { WARDROBE_ITEMS } from '@/lib/wardrobe-items'

const UMBRELLA_IDS = ['umbrella', 'compact_umbrella']
const WATERPROOF_IDS = ['raincoat', 'windbreaker', 'waterproof_shoes', 'rain_boots']

type RainLevelType = 'none' | 'drizzle' | 'moderate' | 'heavy'

/**
 * Filter owned wardrobe items to ONLY those appropriate for the weather.
 * This runs in code — the LLM never sees items that are wrong for the temperature.
 */
function filterWardrobeForWeather(
  ids: string[],
  feelsMin: number,
  feelsMax: number,
  rainLevel: RainLevelType,
): { tops: string[]; bottoms: string[]; shoes: string[]; carry: string[] } {
  const tops: string[] = []
  const bottoms: string[] = []
  const shoes: string[] = []
  const carry: string[] = []

  for (const id of ids) {
    const item = WARDROBE_ITEMS.find(w => w.id === id)
    if (!item) continue

    if (item.category === 'top') {
      // Hot (>26°C): only thin tops — no sweaters, jackets, thermals
      if (feelsMax > 26 && item.weight !== 'thin') continue
      // Warm (>20°C): no thick items, no thermal
      if (feelsMax > 20 && (item.weight === 'thick' || item.id === 'thermal_top')) continue
      // Mild (>14°C): no thermal top, no puffer/winter coat
      if (feelsMax > 14 && (item.id === 'thermal_top' || item.id === 'puffer' || item.id === 'winter_coat')) continue
      // Cool (>8°C): no puffer or winter coat (light jacket/windbreaker ok)
      if (feelsMax > 8 && (item.id === 'puffer' || item.id === 'winter_coat')) continue
      tops.push(item.label)
    }
    else if (item.category === 'bottom') {
      // Warm/hot (>22°C): no warm trousers or thermal leggings
      if (feelsMax > 22 && (item.id === 'warm_trousers' || item.id === 'thermal_leggings')) continue
      // Mild (>16°C): no thermal leggings
      if (feelsMax > 16 && item.id === 'thermal_leggings') continue
      // Hot (>28°C): jeans are too heavy — exclude
      if (feelsMax > 28 && item.id === 'jeans') continue
      // Cold (<8°C): no shorts
      if (feelsMax <= 8 && item.id === 'shorts') continue
      bottoms.push(item.label)
    }
    else if (item.category === 'shoes') {
      // Rainy: no sandals for moderate/heavy rain
      if ((rainLevel === 'moderate' || rainLevel === 'heavy') && item.id === 'sandals') continue
      // Warm + no rain: no snow boots, no rain boots
      if (feelsMax > 15 && rainLevel === 'none' && item.weight === 'snow') continue
      if (feelsMax > 15 && rainLevel === 'none' && item.id === 'rain_boots') continue
      // Hot (>24°C) + no rain: no waterproof shoes either
      if (feelsMax > 24 && rainLevel === 'none' && item.weight === 'waterproof') continue
      // Below freezing only: snow boots
      if (item.weight === 'snow' && feelsMin > 2) continue
      shoes.push(item.label)
    }
    else if (item.category === 'carry') {
      carry.push(item.label)
    }
  }

  return { tops, bottoms, shoes, carry }
}

// ── Weather signal helpers ────────────────────────────────────────────────────

function avg(nums: number[]): number | null {
  if (!nums.length) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

function buildWeatherSnapshot(hours: HourlyWeather[]) {
  const current = hours.find(h => !h.isPast) ?? hours[hours.length - 1]
  const allTemps = hours.map(h => h.apparent_temperature)
  const byHour = (from: number, to: number) =>
    hours.filter(h => { const hr = new Date(h.time).getHours(); return hr >= from && hr <= to })

  return {
    current_feels_like:   Math.round(current.apparent_temperature),
    daily_high:           Math.round(Math.max(...allTemps)),
    daily_low:            Math.round(Math.min(...allTemps)),
    morning_feels_like:   avg(byHour(6, 11).map(h => h.apparent_temperature)),
    afternoon_feels_like: avg(byHour(12, 17).map(h => h.apparent_temperature)),
    evening_feels_like:   avg(byHour(18, 23).map(h => h.apparent_temperature)),
    humidity:             Math.round(current.relativehumidity_2m ?? 0),
  }
}

type RainLevel = 'none' | 'drizzle' | 'moderate' | 'heavy'

function assessRain(hours: HourlyWeather[]): { level: RainLevel; maxProb: number; totalMm: number } {
  const upcoming = hours.filter(h => !h.isPast)
  let maxProb = 0, maxAmount = 0
  for (let i = 0; i < upcoming.length; i += 3) {
    const w = upcoming.slice(i, i + 3)
    const prob = Math.max(...w.map(h => h.precipitation_probability))
    const amount = w.reduce((sum, h) => sum + h.precipitation, 0)
    if (prob > maxProb) maxProb = prob
    if (amount > maxAmount) maxAmount = amount
  }
  let level: RainLevel = 'none'
  if (maxProb >= 75 || maxAmount >= 3) level = 'heavy'
  else if (maxProb >= 60 || maxAmount >= 1) level = 'moderate'
  else if (maxProb >= 35) level = 'drizzle'
  return { level, maxProb, totalMm: maxAmount }
}

function getFeelsLikeRange(hours: HourlyWeather[]): { min: number; max: number } {
  const upcoming = hours.filter(h => !h.isPast)
  if (!upcoming.length) return { min: 15, max: 15 }
  const temps = upcoming.map(h => h.apparent_temperature)
  return { min: Math.round(Math.min(...temps)), max: Math.round(Math.max(...temps)) }
}

function detectClimateZone(dailyHigh: number, humidity: number) {
  if (dailyHigh > 35) return humidity > 60 ? 'tropical' : 'hot_arid'
  if (dailyHigh > 28) return humidity > 65 ? 'hot_humid' : 'hot_arid'
  if (dailyHigh > 20) return 'warm_temperate'
  if (dailyHigh > 10) return 'temperate'
  return 'cold'
}


function todayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { userId, city, ownedItems, customItems, weatherData, userPreferences, timeFrom } = body as {
    userId: string
    city: string
    ownedItems: string[]
    customItems?: string[]
    weatherData: { hours: HourlyWeather[]; summary: string; modelAgreement?: string }
    userPreferences?: string
    timeFrom?: string
  }

  if (!userId || !weatherData) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const today = todayDateString()

  try {
    const db = createServerClient()
    const { data: existing } = await db
      .from('recommendations')
      .select('id, recommendation_text')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle()
    if (existing) {
      return Response.json({ recommendation: existing.recommendation_text, cached: true })
    }
  } catch { /* Supabase not configured */ }

  if (!process.env.CEREBRAS_API_KEY) {
    return Response.json({ error: 'AI service not configured. Add CEREBRAS_API_KEY to .env.local' }, { status: 503 })
  }

  // ── Compute weather signals ───────────────────────────────────────────────
  const snap = buildWeatherSnapshot(weatherData.hours)
  const { level: rainLevel, maxProb, totalMm } = assessRain(weatherData.hours)
  const { min: feelsMin, max: feelsMax } = getFeelsLikeRange(weatherData.hours)
  const maxUV = Math.max(...weatherData.hours.filter(h => !h.isPast).map(h => h.uv_index ?? 0))
  const maxWind = Math.max(...weatherData.hours.filter(h => !h.isPast).map(h => h.windspeed_10m))
  const climateZone = detectClimateZone(snap.daily_high, snap.humidity)
  const isHotClimate = ['hot_arid', 'hot_humid', 'tropical'].includes(climateZone)
  const userOwnsUmbrella = ownedItems.some(id => UMBRELLA_IDS.includes(id))
  const userOwnsWaterproof = ownedItems.some(id => WATERPROOF_IDS.includes(id))
  const now = new Date()
  const dayOfWeek = now.toLocaleDateString('en-CA', { weekday: 'long' })
  const hour = now.getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  // ── Build situational hints that feed directly into the prompt ───────────
  const hints: string[] = []

  // Layering guidance based on temperature
  if (feelsMax > 24) {
    const eveningTemp = snap.evening_feels_like ?? feelsMin
    hints.push(`No extra layers — even the evening (${eveningTemp}°C) is ${eveningTemp >= 20 ? 'still warm' : 'only slightly cooler, not enough to add a layer'}.`)
  }

  // Temperature swing — only suggest a layer if the evening genuinely cools
  const eveningIsWarm = (snap.evening_feels_like ?? feelsMin) >= 20
  const tempSwing = feelsMax - feelsMin
  if (tempSwing > 8 && !eveningIsWarm) {
    hints.push(`Temperature drops ${Math.round(tempSwing)}°C through the day — one removable layer is justified (evening: ${snap.evening_feels_like}°C).`)
  } else if (tempSwing > 8 && eveningIsWarm) {
    hints.push(`Despite a ${Math.round(tempSwing)}°C swing, evening stays at ${snap.evening_feels_like ?? feelsMin}°C — still warm. No extra layer.`)
  }

  // Rain gear — use what the user actually owns
  if (rainLevel === 'none') {
    hints.push('No rain expected — do not mention rain gear.')
  } else if (rainLevel === 'drizzle') {
    if (userOwnsWaterproof) hints.push(`Light drizzle (${Math.round(maxProb)}%): their waterproof jacket is enough — no umbrella needed.`)
    else if (userOwnsUmbrella) hints.push(`Light drizzle (${Math.round(maxProb)}%): compact umbrella is the right call.`)
    else hints.push('Light drizzle but user has no rain gear — mention this briefly in the NOTE.')
  } else if (rainLevel === 'moderate') {
    if (userOwnsWaterproof) hints.push(`Moderate rain (${Math.round(maxProb)}%): waterproof jacket is the pick — skip umbrella.`)
    else if (userOwnsUmbrella) hints.push(`Moderate rain (${Math.round(maxProb)}%): umbrella is the best option they have.`)
    else hints.push('Moderate rain but no rain gear — flag this clearly in the NOTE.')
  } else {
    hints.push(`Heavy rain (${Math.round(maxProb)}%, ${totalMm.toFixed(1)}mm): use their best rain protection.`)
  }

  // Heat / UV / wind
  if (feelsMax > 28) hints.push('Hot day — include water bottle in CARRY. Non-negotiable.')
  if (maxUV >= 6) hints.push(`High UV (${maxUV.toFixed(0)}): mention sunglasses if they own them.`)
  if (maxWind >= 30) hints.push(`Strong wind (${Math.round(maxWind)} km/h): avoid open-front or loose layers.`)

  const situationalHints = hints.length ? hints.map(h => `• ${h}`).join('\n') : ''

  // ── Build wardrobe lists (pre-filtered by temperature) ──────────────────
  const { tops, bottoms, shoes, carry } = filterWardrobeForWeather(
    ownedItems, feelsMin, feelsMax, rainLevel
  )
  const hasWardrobe = tops.length + bottoms.length + shoes.length > 0

  const fmtList = (arr: string[]) => arr.length ? arr.join(', ') : 'none'

  // Compute a definitive clothing tier so the LLM has no ambiguity
  const topTier =
    feelsMax > 26 ? 'thin top only (it is warm)' :
    feelsMax > 20 ? 'light top or long-sleeve' :
    feelsMax > 14 ? 'light jacket or medium layer' :
    feelsMax > 8  ? 'warm mid-layer, outer jacket' :
                    'thermal + heavy coat'

  const bottomTier =
    feelsMax > 22 ? 'shorts or light trousers' :
    feelsMax > 14 ? 'light trousers or jeans' :
                    'warm trousers or thermal leggings'

  const shoesTier =
    feelsMax < 0               ? 'snow boots' :
    rainLevel === 'heavy' || rainLevel === 'moderate' ? 'waterproof shoes' :
    feelsMax > 22              ? 'breathable shoes (sandals or sneakers)' :
                                 'any comfortable shoe'

  const forecastWindow = timeFrom ? `${timeFrom} → midnight` : 'Now → midnight'

  const buildPrompt = () => `You are WearCast. Pick the single best item from the user's wardrobe for each category. One sentence per section. No explanations.

TODAY — ${city}, ${dayOfWeek} ${timeOfDay} (${forecastWindow}):
Feels-like now: ${snap.current_feels_like}°C | Range: ${feelsMin}°C – ${feelsMax}°C
Morning: ${snap.morning_feels_like ?? 'n/a'}°C | Afternoon: ${snap.afternoon_feels_like ?? 'n/a'}°C | Evening: ${snap.evening_feels_like ?? 'n/a'}°C
Rain: ${rainLevel} (${Math.round(maxProb)}%) | UV: ${maxUV.toFixed(0)} | Wind: ${Math.round(maxWind)} km/h${weatherData.modelAgreement === 'disagree' ? ' | ⚠ Models disagree — lean conservative' : ''}

REQUIRED CLOTHING TIER (non-negotiable):
• Top: ${topTier}
• Bottom: ${bottomTier}
• Shoes: ${shoesTier}

${hasWardrobe ? `USER'S WARDROBE (already filtered for this weather — pick from these only):
Tops: ${fmtList(tops)}
Bottoms: ${fmtList(bottoms)}
Shoes: ${fmtList(shoes)}
Carry items: ${fmtList(carry)}` : `WARDROBE: Not set up. Give one generic item per category matching the required tier above. No colours, no brand names.`}

${situationalHints ? `SITUATION-SPECIFIC NOTES (apply these exactly):\n${situationalHints}\n` : ''}${userPreferences ? `\nUSER PREFERENCES (follow unless weather overrides):\n${userPreferences}\n` : ''}
RULES:
• Pick exactly ONE item per category from the wardrobe lists above.
• Carry: umbrella only if rain > 60%, water bottle only if feels-like > 28°C, sunglasses only if UV ≥ 7.
• SHOES section is required — always include it. If any shoe works today, just name the most breathable/casual option from their list.
• No "or", no alternatives, no filler, no explanations.

FORMAT — use exactly these section headers:
CLOTHING
[One sentence. State top + bottom.]

SHOES
[One sentence. Always include. If any shoe works, just name the most casual/breathable option from their wardrobe.]

CARRY
[One bullet per item. Or: Nothing extra needed today.]

NOTE
[One sentence if temp swings >8°C or rain is uncertain. Otherwise: none]`

  // ── LLM call ─────────────────────────────────────────────────────────────
  const client = new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY })
  const prompt = buildPrompt()

  let recommendationText: string
  try {
    const res = await client.chat.completions.create({
      model: 'llama3.1-8b',
      max_tokens: 200,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    })

    const choices = (res as { choices: { message?: { content?: string } }[] }).choices
    recommendationText = choices[0]?.message?.content?.trim() ?? ''

    if (!recommendationText) throw new Error('Empty response from model')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Cerebras error:', message)
    return Response.json({ error: `AI recommendation failed: ${message}` }, { status: 503 })
  }

  try {
    const db = createServerClient()
    await db.from('users').upsert({ id: userId, city: city || null }, { onConflict: 'id' })
    const { data: rec } = await db
      .from('recommendations')
      .insert({ user_id: userId, date: today, weather_snapshot: weatherData, recommendation_text: recommendationText })
      .select('id')
      .single()
    return Response.json({ recommendation: recommendationText, recommendationId: rec?.id })
  } catch {
    return Response.json({ recommendation: recommendationText })
  }
}
