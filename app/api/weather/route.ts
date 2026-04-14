import { NextRequest } from 'next/server'

const weatherCache = new Map<string, { data: WeatherData; expiresAt: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000

export interface HourlyWeather {
  time: string
  apparent_temperature: number
  precipitation_probability: number
  precipitation: number
  windspeed_10m: number
  uv_index: number
  cloudcover: number
  relativehumidity_2m: number
  isPast: boolean
}

export interface WeatherData {
  city: string
  hours: HourlyWeather[]
  summary: string
  fetchedAt: string
  modelAgreement: 'agree' | 'disagree'
}

async function geocodeCity(query: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', query)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  try {
    const res = await fetch(url.toString())
    if (!res.ok) return null
    const data = await res.json()
    const result = data.results?.[0]
    if (!result) return null
    const parts = [result.name, result.admin1, result.country].filter(Boolean)
    return { lat: result.latitude, lon: result.longitude, name: parts.join(', ') }
  } catch { return null }
}

// Fields available in GFS (primary — has all fields)
const GFS_FIELDS = 'apparent_temperature,precipitation_probability,precipitation,windspeed_10m,uv_index,cloudcover,relativehumidity_2m'
// Fields available in ECMWF IFS (secondary — no uv_index or precipitation_probability)
const ECMWF_FIELDS = 'apparent_temperature,precipitation,windspeed_10m,cloudcover,relativehumidity_2m'

function buildForecastUrl(lat: number, lon: number, model: string, fields: string): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('hourly', fields)
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '2')
  url.searchParams.set('models', model)
  return url.toString()
}

interface RawHourly {
  time: string[]
  apparent_temperature: number[]
  precipitation_probability?: number[]
  precipitation: number[]
  windspeed_10m: number[]
  uv_index?: number[]
  cloudcover: number[]
  relativehumidity_2m: number[]
}

function sliceToday(raw: { hourly: RawHourly }, now: Date): { from: number; times: string[] } {
  const times: string[] = raw.hourly.time
  const todayStart = times.findIndex(t => {
    const d = new Date(t)
    return d.getDate() === now.getDate() && d.getHours() === 0
  })
  return { from: todayStart === -1 ? 0 : todayStart, times }
}

function buildSummary(hours: HourlyWeather[]): string {
  const temps = hours.map(h => h.apparent_temperature)
  const minT = Math.round(Math.min(...temps))
  const maxT = Math.round(Math.max(...temps))
  const maxRain = Math.max(...hours.map(h => h.precipitation_probability))

  let s = ''
  if (maxT <= 0) s = `Freezing, around ${minT}°C`
  else if (maxT <= 5) s = `Very cold, ${minT}–${maxT}°C`
  else if (maxT <= 12) s = `Cold, ${minT}–${maxT}°C`
  else if (maxT <= 18) s = `Cool, ${minT}–${maxT}°C`
  else if (maxT <= 24) s = `Mild, ${minT}–${maxT}°C`
  else if (maxT <= 30) s = `Warm, ${minT}–${maxT}°C`
  else s = `Hot, ${minT}–${maxT}°C`

  if (maxT - minT > 8) s += ` — big swing through the day`
  if (maxRain >= 70) s += `. Heavy rain expected`
  else if (maxRain >= 35) s += `. Rain likely`
  else if (maxRain >= 15) s += `. Possible showers`

  return s
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const city = searchParams.get('city')
  const latParam = searchParams.get('lat')
  const lonParam = searchParams.get('lon')

  let coords: { lat: number; lon: number; name: string } | null = null

  if (latParam && lonParam) {
    coords = { lat: parseFloat(latParam), lon: parseFloat(lonParam), name: 'Your location' }
  } else if (city) {
    coords = await geocodeCity(city)
    if (!coords) {
      return Response.json(
        { error: `Could not find "${city}". Please check the spelling and try again.` },
        { status: 400 }
      )
    }
  } else {
    return Response.json({ error: 'Provide city or lat/lon' }, { status: 400 })
  }

  const cacheKey = `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}`
  const cached = weatherCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return Response.json(cached.data)

  // Fetch GFS and ECMWF in parallel
  let gfsRaw: { hourly: RawHourly } | null = null
  let ecmwfRaw: { hourly: RawHourly } | null = null

  try {
    const [gfsRes, ecmwfRes] = await Promise.all([
      fetch(buildForecastUrl(coords.lat, coords.lon, 'gfs_seamless', GFS_FIELDS)),
      fetch(buildForecastUrl(coords.lat, coords.lon, 'ecmwf_ifs04', ECMWF_FIELDS)),
    ])
    if (gfsRes.ok) gfsRaw = await gfsRes.json()
    if (ecmwfRes.ok) ecmwfRaw = await ecmwfRes.json()
  } catch {
    return Response.json({ error: 'Could not reach weather service. Please try again.' }, { status: 503 })
  }

  if (!gfsRaw) {
    return Response.json({ error: 'Weather service error. Please try again.' }, { status: 502 })
  }

  const now = new Date()
  const nowHour = now.getHours()
  const { from, times } = sliceToday(gfsRaw, now)

  // Build merged hourly data
  const hours: HourlyWeather[] = times.slice(from, from + 24).map((t, i) => {
    const idx = from + i
    const hourOfDay = new Date(t).getHours()
    const ecmwfIdx = ecmwfRaw ? idx : -1

    const gfsTemp = gfsRaw!.hourly.apparent_temperature[idx]
    const ecmwfTemp = ecmwfRaw && ecmwfIdx >= 0 ? (ecmwfRaw.hourly.apparent_temperature[ecmwfIdx] ?? gfsTemp) : gfsTemp

    const gfsWind = gfsRaw!.hourly.windspeed_10m[idx]
    const ecmwfWind = ecmwfRaw && ecmwfIdx >= 0 ? (ecmwfRaw.hourly.windspeed_10m[ecmwfIdx] ?? gfsWind) : gfsWind

    const gfsHumid = gfsRaw!.hourly.relativehumidity_2m[idx]
    const ecmwfHumid = ecmwfRaw && ecmwfIdx >= 0 ? (ecmwfRaw.hourly.relativehumidity_2m[ecmwfIdx] ?? gfsHumid) : gfsHumid

    const gfsPrecip = gfsRaw!.hourly.precipitation[idx]
    const ecmwfPrecip = ecmwfRaw && ecmwfIdx >= 0 ? (ecmwfRaw.hourly.precipitation[ecmwfIdx] ?? gfsPrecip) : gfsPrecip

    return {
      time: t,
      apparent_temperature: ecmwfRaw ? (gfsTemp + ecmwfTemp) / 2 : gfsTemp,
      precipitation_probability: gfsRaw!.hourly.precipitation_probability?.[idx] ?? 0,
      precipitation: Math.max(gfsPrecip, ecmwfPrecip),
      windspeed_10m: ecmwfRaw ? (gfsWind + ecmwfWind) / 2 : gfsWind,
      uv_index: gfsRaw!.hourly.uv_index?.[idx] ?? 0,
      cloudcover: gfsRaw!.hourly.cloudcover[idx],
      relativehumidity_2m: ecmwfRaw ? (gfsHumid + ecmwfHumid) / 2 : gfsHumid,
      isPast: hourOfDay < nowHour,
    }
  })

  // Model agreement: compare average temperature difference between GFS and ECMWF
  let modelAgreement: 'agree' | 'disagree' = 'agree'
  if (ecmwfRaw) {
    const upcomingGfs = gfsRaw.hourly.apparent_temperature.slice(from, from + 24).filter((_, i) => {
      const hr = new Date(times[from + i]).getHours()
      return hr >= nowHour
    })
    const upcomingEcmwf = ecmwfRaw.hourly.apparent_temperature.slice(from, from + 24).filter((_, i) => {
      const hr = new Date(times[from + i]).getHours()
      return hr >= nowHour
    })
    if (upcomingGfs.length > 0 && upcomingEcmwf.length > 0) {
      const avgDiff = upcomingGfs.reduce((sum, t, i) => sum + Math.abs(t - (upcomingEcmwf[i] ?? t)), 0) / upcomingGfs.length
      if (avgDiff > 3) modelAgreement = 'disagree'
    }
  }

  const data: WeatherData = {
    city: coords.name,
    hours,
    summary: buildSummary(hours),
    fetchedAt: now.toISOString(),
    modelAgreement,
  }

  weatherCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return Response.json(data)
}
