import { NextRequest } from 'next/server'

export interface GeocodeSuggestion {
  name: string        // display label e.g. "Toronto, Ontario, Canada"
  city: string        // city name only e.g. "Toronto"
  lat: number
  lon: number
  country: string
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim()
  if (!query || query.length < 2) {
    return Response.json({ suggestions: [] })
  }

  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
    url.searchParams.set('name', query)
    url.searchParams.set('count', '6')
    url.searchParams.set('language', 'en')
    url.searchParams.set('format', 'json')

    const res = await fetch(url.toString())
    if (!res.ok) return Response.json({ suggestions: [] })

    const data = await res.json()
    const results = data.results ?? []

    const suggestions: GeocodeSuggestion[] = results.map((r: {
      name: string
      latitude: number
      longitude: number
      country: string
      admin1?: string
    }) => {
      const parts = [r.name, r.admin1, r.country].filter(Boolean)
      return {
        name: parts.join(', '),
        city: r.name,
        lat: r.latitude,
        lon: r.longitude,
        country: r.country,
      }
    })

    return Response.json({ suggestions })
  } catch {
    return Response.json({ suggestions: [] })
  }
}
