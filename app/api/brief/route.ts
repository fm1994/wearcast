import { NextRequest } from 'next/server'
import Cerebras from '@cerebras/cerebras_cloud_sdk'

export interface BriefData {
  descriptor: string   // e.g. "scorching hot"
  essentials: string[] // e.g. ["umbrella"] or []
}

// Fallback descriptor from temperature if LLM fails
function fallbackDescriptor(feelsMax: number, rainProb: number, windSpeed: number): string {
  if (feelsMax >= 38) return 'dangerously hot'
  if (feelsMax >= 34) return 'scorching hot'
  if (feelsMax >= 30) return 'very hot'
  if (feelsMax >= 26) return rainProb >= 40 ? 'hot and stormy' : 'hot and humid'
  if (feelsMax >= 22) return 'warm and sunny'
  if (feelsMax >= 18) return windSpeed >= 30 ? 'mild but breezy' : 'pleasantly mild'
  if (feelsMax >= 14) return rainProb >= 40 ? 'cool and rainy' : 'cool and grey'
  if (feelsMax >= 8) return windSpeed >= 30 ? 'cold and blustery' : 'cold and grey'
  if (feelsMax >= 2) return windSpeed >= 25 ? 'biting cold' : 'bitterly cold'
  return 'freezing cold'
}

function fallbackEssentials(feelsMax: number, rainProb: number, uv: number): string[] {
  const items: string[] = []
  if (rainProb >= 60) items.push('umbrella')
  if (feelsMax > 35) items.push('water bottle')
  if (uv >= 8 && feelsMax > 20) items.push('sunglasses or hat')
  return items.slice(0, 2)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { city, currentFeelsLike, feelsLikeMin, feelsLikeMax, humidity, windSpeed, maxRainProb, peakUV, timeFrom } = body as {
    city: string
    currentFeelsLike: number
    feelsLikeMin: number
    feelsLikeMax: number
    humidity: number
    windSpeed: number
    maxRainProb: number
    peakUV: number
    timeFrom: string
  }

  if (!process.env.CEREBRAS_API_KEY) {
    return Response.json({
      descriptor: fallbackDescriptor(feelsLikeMax, maxRainProb, windSpeed),
      essentials: fallbackEssentials(feelsLikeMax, maxRainProb, peakUV),
    })
  }

  const prompt = `You are a weather-to-plain-English translator. Return ONLY valid JSON, no explanation.

Weather for ${city} (${timeFrom} → midnight):
- Feels-like now: ${Math.round(currentFeelsLike)}°C
- Range today: ${Math.round(feelsLikeMin)}°C to ${Math.round(feelsLikeMax)}°C
- Humidity: ${Math.round(humidity)}%
- Wind: ${Math.round(windSpeed)} km/h
- Rain probability (peak): ${Math.round(maxRainProb)}%
- UV index (peak): ${peakUV.toFixed(1)}

Return this exact JSON structure:
{
  "descriptor": "X",
  "essentials": []
}

RULES — follow exactly:
descriptor: 2-3 sensory words describing how it will FEEL outside. Examples: "scorching hot", "bitterly cold", "grey and drizzly", "breezy and mild", "freezing cold". Never use numbers. Never use meteorological terms like "precipitation".

essentials: Array of strings. Max 2 items. Usually 0 or 1. Only items a person doesn't carry daily but truly needs today based on unusual conditions:
- "umbrella" → ONLY if rain prob ≥ 60%
- "water bottle" → ONLY if feels-like > 35°C
- "sunglasses" → ONLY if UV ≥ 8 AND feels-like > 20°C
- Nothing else ever qualifies
- If no unusual condition, return []

Return ONLY the JSON. No markdown. No explanation.`

  const client = new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY })

  try {
    const response = await client.chat.completions.create({
      model: 'llama3.1-8b',
      max_tokens: 100,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    })
    const choices = (response as { choices: { message?: { content?: string } }[] }).choices
    const raw = choices[0]?.message?.content?.trim() ?? ''

    // Extract JSON from response (strip any markdown fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as BriefData
      return Response.json({
        descriptor: parsed.descriptor || fallbackDescriptor(feelsLikeMax, maxRainProb, windSpeed),
        essentials: Array.isArray(parsed.essentials) ? parsed.essentials.slice(0, 2) : [],
      })
    }
    throw new Error('No JSON in response')
  } catch {
    // Graceful fallback — never block the user
    return Response.json({
      descriptor: fallbackDescriptor(feelsLikeMax, maxRainProb, windSpeed),
      essentials: fallbackEssentials(feelsLikeMax, maxRainProb, peakUV),
    })
  }
}
