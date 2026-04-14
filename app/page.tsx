'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { WARDROBE_ITEMS, CATEGORY_LABELS, WardrobeCategory } from '@/lib/wardrobe-items'
import { BriefData } from './api/brief/route'
import { WeatherData } from './api/weather/route'

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = 'location' | 'brief' | 'wardrobe' | 'result'
interface GeoSuggestion { name: string; city: string; lat: number; lon: number }
interface RecData { text: string; recommendationId?: string; summary: string; city: string }

const CATEGORIES: WardrobeCategory[] = ['top', 'bottom', 'shoes', 'carry']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUserId(): string {
  let id = localStorage.getItem('wc_user_id')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('wc_user_id', id) }
  return id
}

function getTimeFrom(): string {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

function parseRec(text: string) {
  const sections: Record<string, string> = {}
  let cur = ''
  for (const line of text.split('\n')) {
    const t = line.trim()
    const c = t.replace(/\*\*/g, '')
    if (/^(CLOTHING|SHOES|CARRY|NOTE|OUTFIT|WEATHER)$/i.test(c)) { cur = c.toUpperCase(); sections[cur] = '' }
    else if (cur) sections[cur] = (sections[cur] + '\n' + t).trimStart()
  }
  const carryRaw = sections['CARRY'] || ''
  const carry = carryRaw.split('\n').map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
  const nothing = carryRaw.toLowerCase().includes('nothing')
  return {
    clothing: (sections['CLOTHING'] || sections['OUTFIT'] || '').trim(),
    shoes:    (sections['SHOES'] || '').trim(),
    carry,
    nothing,
    note:     (sections['NOTE']?.trim() || '').toLowerCase() === 'none' ? '' : (sections['NOTE']?.trim() || ''),
  }
}

// ─── WearCast Buddy ───────────────────────────────────────────────────────────

function WearcastBuddy({ step }: { step: 0 | 1 | 2 | 3 }) {
  const px = step === 0 ? -1 : step === 3 ? 0 : 0.5
  const py = step === 0 ? 0.5 : 0.5
  const mouth = [
    'M 12 21 Q 15 23 18 21',
    'M 11 21 Q 15 25 19 21',
    'M 11 21 Q 15 25 19 21',
    'M 10 21 Q 15 27 20 21',
  ][step]

  return (
    <svg width="28" height="34" viewBox="0 0 30 36" fill="none">
      <rect x="9" y="1" width="12" height="5" rx="2" fill="rgba(56,217,255,0.4)"/>
      <rect x="5" y="5" width="20" height="2.5" rx="1.2" fill="rgba(56,217,255,0.4)"/>
      <circle cx="15" cy="19" r="11" fill="rgba(56,217,255,0.15)" stroke="rgba(56,217,255,0.4)" strokeWidth="1"/>
      <circle cx="10.5" cy="17" r="3" fill="white" opacity="0.9"/>
      <circle cx="19.5" cy="17" r="3" fill="white" opacity="0.9"/>
      <circle cx={10.5 + px} cy={17 + py} r="1.8" fill="#0D1F2D"/>
      <circle cx={19.5 + px} cy={17 + py} r="1.8" fill="#0D1F2D"/>
      <circle cx={11 + px} cy={16.3 + py} r="0.6" fill="white"/>
      <circle cx={20 + px} cy={16.3 + py} r="0.6" fill="white"/>
      <path d={mouth} stroke="rgba(56,217,255,0.8)" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      {step === 3 && <>
        <ellipse cx="8" cy="21.5" rx="2.5" ry="1.5" fill="var(--warm)" opacity="0.4"/>
        <ellipse cx="22" cy="21.5" rx="2.5" ry="1.5" fill="var(--warm)" opacity="0.4"/>
      </>}
      <path d="M 11 29 L 9.5 36" stroke="rgba(56,217,255,0.4)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M 19 29 L 20.5 36" stroke="rgba(56,217,255,0.4)" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

// ─── City Autocomplete ────────────────────────────────────────────────────────

function CityAutocomplete({ value, onChange, onSelect, onConfirm }: {
  value: string
  onChange: (v: string) => void
  onSelect: (s: GeoSuggestion) => void
  onConfirm: () => void
}) {
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (value.length < 2) { setSuggestions([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(value)}`)
        const d = await r.json()
        setSuggestions(d.suggestions ?? [])
        setOpen(d.suggestions?.length > 0)
      } catch { setSuggestions([]) }
      finally { setLoading(false) }
    }, 300)
  }, [value])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const pick = (s: GeoSuggestion) => { onChange(s.name); setSuggestions([]); setOpen(false); onSelect(s) }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={value}
          onChange={e => { onChange(e.target.value) }}
          onFocus={e => {
            if (suggestions.length > 0) setOpen(true)
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'var(--glass-border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onConfirm())}
          placeholder="Any city worldwide…"
          autoComplete="off"
          style={{
            width: '100%', padding: '14px 44px 14px 18px',
            border: '1px solid var(--glass-border)', borderRadius: 14,
            background: 'var(--glass)', color: 'var(--text)',
            fontFamily: 'var(--font-body)', fontSize: 15,
            outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        />
        {loading && <div className="spinner" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }} />}
      </div>

      {open && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 30, width: '100%', marginTop: 4,
          background: '#0e1525', border: '1px solid var(--glass-border)',
          borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}>
          {suggestions.map((s, i) => (
            <li key={i}>
              <button onMouseDown={() => pick(s)} style={{
                width: '100%', textAlign: 'left', padding: '11px 16px',
                background: 'none', border: 'none',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--glass-border)' : 'none',
                cursor: 'pointer', fontFamily: 'var(--font-body)', color: 'var(--text)',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontWeight: 600 }}>{s.city}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{s.name.slice(s.city.length)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [ready, setReady] = useState(false)
  const [screen, setScreen] = useState<Screen>('location')
  const [cityInput, setCityInput] = useState('')
  const [selectedCity, setSelectedCity] = useState<GeoSuggestion | null>(null)
  const [savedCity, setSavedCity] = useState<string | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [brief, setBrief] = useState<BriefData | null>(null)
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [loadingBrief, setLoadingBrief] = useState(false)
  const [weatherError, setWeatherError] = useState('')
  const [wardrobe, setWardrobe] = useState<Set<string>>(new Set())
  const [rec, setRec] = useState<RecData | null>(null)
  const [loadingRec, setLoadingRec] = useState(false)
  const [recError, setRecError] = useState('')
  const [rating, setRating] = useState<'thumbs_up' | 'thumbs_down' | null>(null)
  const [loadingGeo, setLoadingGeo] = useState(false)
  const [userPreferences, setUserPreferences] = useState('')
  const [prefSaved, setPrefSaved] = useState(false)
  const [showPrefInput, setShowPrefInput] = useState(false)
  const timeFrom = getTimeFrom()

  // ── Weather-reactive background ─────────────────────────────────────────────
  const bgGradient = (() => {
    if (!weather) return 'radial-gradient(ellipse at 50% 0%, #0e1525 0%, #080c14 70%)'
    const hours = weather.hours
    const upcoming = hours.filter((h: { isPast: boolean }) => !h.isPast)
    const maxTemp = upcoming.length ? Math.max(...upcoming.map((h: { apparent_temperature: number }) => h.apparent_temperature)) : 15
    const maxRain = upcoming.length ? Math.max(...upcoming.map((h: { precipitation_probability: number }) => h.precipitation_probability)) : 0
    if (maxTemp > 30) return 'radial-gradient(ellipse at 50% 0%, #1a0a00 0%, #080c14 70%)'
    if (maxRain >= 60) return 'radial-gradient(ellipse at 50% 0%, #060c18 0%, #080c14 70%)'
    if (maxTemp < 5) return 'radial-gradient(ellipse at 50% 0%, #06080f 0%, #080c14 70%)'
    return 'radial-gradient(ellipse at 50% 0%, #0d1525 0%, #080c14 70%)'
  })()

  // ── Init ────────────────────────────────────────────────────────────────────
  const fetchBrief = useCallback(async (wd: WeatherData) => {
    if (!process.env.NEXT_PUBLIC_SKIP_BRIEF) {
      setLoadingBrief(true)
    }
    const hours = wd.hours
    const upcoming = hours.filter((h: { isPast: boolean }) => !h.isPast)
    const current = hours.find((h: { isPast: boolean }) => !h.isPast) ?? hours[hours.length - 1]
    const feelsLikeMin = upcoming.length ? Math.min(...upcoming.map((h: { apparent_temperature: number }) => h.apparent_temperature)) : current.apparent_temperature
    const feelsLikeMax = upcoming.length ? Math.max(...upcoming.map((h: { apparent_temperature: number }) => h.apparent_temperature)) : current.apparent_temperature
    const maxRainProb = upcoming.length ? Math.max(...upcoming.map((h: { precipitation_probability: number }) => h.precipitation_probability)) : 0
    const peakUV = upcoming.length ? Math.max(...upcoming.map((h: { uv_index: number }) => h.uv_index ?? 0)) : 0
    const windSpeed = upcoming.length ? Math.max(...upcoming.map((h: { windspeed_10m: number }) => h.windspeed_10m)) : 0

    try {
      const r = await fetch('/api/brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: wd.city,
          currentFeelsLike: current.apparent_temperature,
          feelsLikeMin, feelsLikeMax,
          humidity: current.relativehumidity_2m ?? 0,
          windSpeed, maxRainProb, peakUV,
          timeFrom,
        }),
      })
      if (r.ok) {
        const d = await r.json()
        setBrief(d)
      }
    } catch { /* silent — brief is optional */ }
    finally { setLoadingBrief(false) }
  }, [timeFrom])

  const fetchWeather = useCallback(async (city: string) => {
    setLoadingWeather(true); setWeatherError(''); setBrief(null)
    const lat = localStorage.getItem('wc_lat')
    const lon = localStorage.getItem('wc_lon')
    const url = lat && lon ? `/api/weather?lat=${lat}&lon=${lon}` : `/api/weather?city=${encodeURIComponent(city)}`
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error((await r.json()).error)
      const d: WeatherData = await r.json()
      setWeather(d)
      setScreen('brief')
      fetchBrief(d)
    } catch (e) { setWeatherError(e instanceof Error ? e.message : 'Could not fetch weather') }
    finally { setLoadingWeather(false) }
  }, [fetchBrief])

  useEffect(() => {
    const city = localStorage.getItem('wc_city')
    const stored = JSON.parse(localStorage.getItem('wc_wardrobe') || '[]')
    const todayStr = new Date().toISOString().split('T')[0]
    const cached = localStorage.getItem(`wc_rec_${todayStr}`)

    if (city) { setSavedCity(city); setCityInput(city); fetchWeather(city) }
    setWardrobe(new Set(stored))
    const storedPref = localStorage.getItem('wc_user_pref')
    if (storedPref) setUserPreferences(storedPref)
    if (cached) {
      const d = JSON.parse(cached)
      setRec(d)
      const r = localStorage.getItem(`wc_rating_${d.recommendationId || todayStr}`)
      if (r) setRating(r as 'thumbs_up' | 'thumbs_down')
    }
    setReady(true)
  }, [fetchWeather])

  // ── City confirm ────────────────────────────────────────────────────────────
  const handleCityConfirm = () => {
    const city = selectedCity?.name || cityInput.trim()
    if (!city) return
    if (selectedCity) {
      localStorage.setItem('wc_lat', String(selectedCity.lat))
      localStorage.setItem('wc_lon', String(selectedCity.lon))
    } else {
      localStorage.removeItem('wc_lat'); localStorage.removeItem('wc_lon')
    }
    localStorage.setItem('wc_city', city)
    setSavedCity(city)
    const todayStr = new Date().toISOString().split('T')[0]
    localStorage.removeItem(`wc_rec_${todayStr}`)
    setRec(null); setRating(null); setRecError('')
    fetchWeather(city)
  }

  // ── Geolocation ─────────────────────────────────────────────────────────────
  const handleGeolocate = () => {
    if (!navigator.geolocation) { setWeatherError('Geolocation is not supported by your browser.'); return }
    setLoadingGeo(true); setWeatherError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        localStorage.setItem('wc_lat', String(lat))
        localStorage.setItem('wc_lon', String(lon))
        const label = `${lat.toFixed(2)}, ${lon.toFixed(2)}`
        localStorage.setItem('wc_city', label)
        setSavedCity(label); setCityInput(label)
        setLoadingGeo(false)
        fetchWeather(label)
      },
      err => {
        setLoadingGeo(false)
        setWeatherError(err.code === 1
          ? 'Location access denied. Please allow it in browser settings, or type your city.'
          : 'Could not get your location. Please type your city above.')
      },
      { timeout: 10000 }
    )
  }

  // ── Wardrobe toggle ─────────────────────────────────────────────────────────
  const toggleItem = (id: string) => {
    setWardrobe(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem('wc_wardrobe', JSON.stringify(Array.from(next)))
      return next
    })
  }

  // ── Get recommendation ──────────────────────────────────────────────────────
  const getRecommendation = async () => {
    if (!savedCity || !weather) return
    setLoadingRec(true); setRecError('')
    try {
      const r = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: getUserId(), city: savedCity,
          ownedItems: Array.from(wardrobe),
          userPreferences: userPreferences.trim() || undefined,
          weatherData: { hours: weather.hours, summary: weather.summary, modelAgreement: weather.modelAgreement },
          timeFrom,
        }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      const d = await r.json()
      const result: RecData = { text: d.recommendation, recommendationId: d.recommendationId, summary: weather.summary, city: weather.city }
      const todayStr = new Date().toISOString().split('T')[0]
      localStorage.setItem(`wc_rec_${todayStr}`, JSON.stringify(result))
      setRec(result); setScreen('result')
    } catch (e) { setRecError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setLoadingRec(false) }
  }

  // ── Submit rating ───────────────────────────────────────────────────────────
  const submitRating = async (value: 'thumbs_up' | 'thumbs_down') => {
    setRating(value)
    const todayStr = new Date().toISOString().split('T')[0]
    localStorage.setItem(`wc_rating_${rec?.recommendationId || todayStr}`, value)
    try {
      await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getUserId(), recommendationId: rec?.recommendationId, rating: value }),
      })
    } catch { /* silent */ }
  }

  // ── Reset ───────────────────────────────────────────────────────────────────
  const resetAll = () => {
    const todayStr = new Date().toISOString().split('T')[0]
    localStorage.removeItem('wc_city'); localStorage.removeItem('wc_lat'); localStorage.removeItem('wc_lon')
    localStorage.removeItem(`wc_rec_${todayStr}`)
    setSavedCity(null); setCityInput(''); setSelectedCity(null)
    setWeather(null); setBrief(null); setRec(null); setRating(null)
    setScreen('location')
  }

  if (!ready) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  const parsed = rec ? parseRec(rec.text) : null
  const budyStep: 0 | 1 | 2 | 3 = screen === 'location' ? 0 : screen === 'brief' ? 1 : screen === 'wardrobe' ? 2 : 3

  // ── Shared glass card ────────────────────────────────────────────────────────
  const glassCard: React.CSSProperties = {
    background: 'var(--glass)',
    border: '1px solid var(--glass-border)',
    borderRadius: 16,
    backdropFilter: 'blur(12px)',
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROOT
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: bgGradient,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: 'var(--font-body)',
      transition: 'background 1s ease',
    }}>
      {/* ── Top bar ── */}
      <div style={{
        width: '100%', maxWidth: 520,
        padding: '20px 24px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <WearcastBuddy step={budyStep} />
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
            letterSpacing: '0.06em', color: 'var(--accent)',
          }}>WEARCAST</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {screen !== 'location' && (
            <button onClick={() => setScreen('location')} style={{
              fontSize: 12, color: 'var(--text-muted)', background: 'none',
              border: 'none', cursor: 'pointer', padding: '4px 8px',
              fontFamily: 'var(--font-body)', letterSpacing: '0.04em',
            }}>
              ← Change city
            </button>
          )}
          <button onClick={resetAll} style={{
            fontSize: 12, color: 'var(--text-muted)', background: 'none',
            border: '1px solid var(--glass-border)', borderRadius: 8,
            cursor: 'pointer', padding: '4px 10px',
            fontFamily: 'var(--font-body)',
          }}>
            Reset
          </button>
        </div>
      </div>

      {/* ── Screen content ── */}
      <div style={{ width: '100%', maxWidth: 520, padding: '24px 24px 48px', flex: 1 }}>

        {/* ══════════════════════════════════════════════════════════════
            SCREEN: LOCATION
        ══════════════════════════════════════════════════════════════ */}
        {screen === 'location' && (
          <div className="screen-in">
            <div style={{ textAlign: 'center', marginBottom: 40, paddingTop: 40 }}>
              <p style={{
                fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12,
              }}>Where are you today?</p>
              <h1 style={{
                fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700,
                color: 'var(--text)', lineHeight: 1.15,
              }}>
                Get your<br />
                <span style={{ color: 'var(--accent)' }}>outfit forecast</span>
              </h1>
            </div>

            <div style={{ ...glassCard, padding: 24 }}>
              <CityAutocomplete
                value={cityInput}
                onChange={v => { setCityInput(v); setSelectedCity(null) }}
                onSelect={s => { setCityInput(s.name); setSelectedCity(s) }}
                onConfirm={handleCityConfirm}
              />

              <button
                onClick={handleCityConfirm}
                disabled={!cityInput.trim() || loadingWeather}
                className={cityInput.trim() && !loadingWeather ? 'glow-pulse' : ''}
                style={{
                  marginTop: 12, width: '100%',
                  padding: '14px', borderRadius: 12, border: 'none',
                  background: cityInput.trim() && !loadingWeather ? 'var(--accent)' : 'var(--glass)',
                  color: cityInput.trim() && !loadingWeather ? '#080c14' : 'var(--text-muted)',
                  fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
                  cursor: cityInput.trim() && !loadingWeather ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}
              >
                {loadingWeather
                  ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Loading weather…</>
                  : 'Check the weather →'}
              </button>

              <div style={{ marginTop: 8, textAlign: 'center' }}>
                <button
                  onClick={handleGeolocate}
                  disabled={loadingGeo}
                  style={{
                    fontSize: 13, color: loadingGeo ? 'var(--accent)' : 'var(--text-muted)',
                    background: 'none', border: 'none', cursor: loadingGeo ? 'default' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontFamily: 'var(--font-body)', padding: '6px 0',
                  }}
                >
                  {loadingGeo
                    ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Locating…</>
                    : '📍 Use my location'}
                </button>
              </div>
            </div>

            {weatherError && (
              <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,74,74,0.1)', border: '1px solid rgba(255,74,74,0.3)', color: 'var(--danger)', fontSize: 13 }}>
                {weatherError}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SCREEN: BRIEF
        ══════════════════════════════════════════════════════════════ */}
        {screen === 'brief' && weather && (
          <div className="screen-in">
            {/* City + forecast window */}
            <div style={{ textAlign: 'center', marginBottom: 8, paddingTop: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                {weather.city}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6, marginTop: 2 }}>
                {timeFrom} → Midnight · {new Date().toLocaleDateString('en-CA', { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
            </div>

            {/* Temperature + descriptor */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              {loadingBrief ? (
                <div style={{ padding: '48px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
                  <div className="spinner" />
                  <span style={{ fontSize: 13 }}>Reading the sky…</span>
                </div>
              ) : (() => {
                const upcoming = weather.hours.filter((h: { isPast: boolean }) => !h.isPast)
                const current = weather.hours.find((h: { isPast: boolean }) => !h.isPast) ?? weather.hours[weather.hours.length - 1]
                const feelsMax = upcoming.length ? Math.max(...upcoming.map((h: { apparent_temperature: number }) => h.apparent_temperature)) : current.apparent_temperature
                const feelsMin = upcoming.length ? Math.min(...upcoming.map((h: { apparent_temperature: number }) => h.apparent_temperature)) : current.apparent_temperature
                const maxRain = upcoming.length ? Math.max(...upcoming.map((h: { precipitation_probability: number }) => h.precipitation_probability)) : 0
                const maxWind = upcoming.length ? Math.max(...upcoming.map((h: { windspeed_10m: number }) => h.windspeed_10m)) : 0
                const humidity = Math.round(current.relativehumidity_2m ?? 0)
                const peakUV = upcoming.length ? Math.max(...upcoming.map((h: { uv_index: number }) => h.uv_index ?? 0)) : 0

                const tempColor = feelsMax > 30 ? 'var(--warm)' : feelsMax < 5 ? 'var(--cold)' : 'var(--accent)'

                return (
                  <>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: 88, fontWeight: 700,
                      color: tempColor, lineHeight: 1,
                      textShadow: `0 0 40px ${tempColor}40`,
                      letterSpacing: '-0.03em',
                    }}>
                      {Math.round(current.apparent_temperature)}°
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
                      letterSpacing: '0.15em', textTransform: 'uppercase',
                      color: 'var(--text)', marginTop: 6,
                    }}>
                      {brief?.descriptor || weather.summary}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                      {Math.round(feelsMin)}° – {Math.round(feelsMax)}° feels-like today
                    </div>

                    {/* Stats pills */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
                      {[
                        { label: '💧', value: `${humidity}%`, title: 'Humidity' },
                        { label: '💨', value: `${Math.round(maxWind)} km/h`, title: 'Wind' },
                        { label: '☀️', value: `UV ${peakUV.toFixed(0)}`, title: 'UV Index' },
                        { label: '🌧', value: `${Math.round(maxRain)}%`, title: 'Rain chance' },
                      ].map(s => (
                        <div key={s.title} title={s.title} style={{
                          ...glassCard, padding: '6px 12px',
                          fontSize: 12, color: 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', gap: 5,
                          borderRadius: 20,
                        }}>
                          <span>{s.label}</span>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Essentials card */}
            {brief?.essentials && brief.essentials.length > 0 && (
              <div style={{ ...glassCard, padding: '16px 20px', marginBottom: 20 }}>
                <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>
                  Don&apos;t forget today
                </p>
                {brief.essentials.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <span style={{ fontSize: 18 }}>
                      {item.toLowerCase().includes('umbrella') ? '☂️' : item.toLowerCase().includes('water') ? '💧' : '🕶️'}
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--text)', textTransform: 'capitalize' }}>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Model disagreement note */}
            {weather.modelAgreement === 'disagree' && (
              <div style={{ ...glassCard, padding: '10px 16px', marginBottom: 16, borderColor: 'rgba(255,140,66,0.3)', background: 'rgba(255,140,66,0.06)' }}>
                <p style={{ fontSize: 12, color: 'var(--warm)' }}>
                  ⚡ Two forecast models disagree today — dress conservatively.
                </p>
              </div>
            )}

            {/* CTAs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => setScreen('wardrobe')}
                className="glow-pulse"
                style={{
                  padding: '15px', borderRadius: 14, border: 'none',
                  background: 'var(--accent)', color: '#080c14',
                  fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.02em',
                }}
              >
                Help me get dressed →
              </button>
              <button
                onClick={resetAll}
                style={{
                  padding: '12px', borderRadius: 14,
                  border: '1px solid var(--glass-border)', background: 'transparent',
                  color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                That&apos;s all I need
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SCREEN: WARDROBE
        ══════════════════════════════════════════════════════════════ */}
        {screen === 'wardrobe' && (
          <div className="screen-in">
            {/* Glass header */}
            {brief && (
              <div style={{ ...glassCard, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>
                  {brief.descriptor.toUpperCase()}
                </span>
                <span style={{ color: 'var(--glass-border)' }}>·</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{savedCity}</span>
              </div>
            )}

            <p style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 20 }}>
              What do you own? Tap to select.
            </p>

            {/* Flat sections — no tabs */}
            {CATEGORIES.map(cat => (
              <div key={cat} style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>
                  {CATEGORY_LABELS[cat]}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {WARDROBE_ITEMS.filter(i => i.category === cat).map(item => {
                    const active = wardrobe.has(item.id)
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={active ? 'chip-active' : ''}
                        style={{
                          padding: '8px 14px', borderRadius: 20,
                          border: '1px solid',
                          borderColor: active ? 'var(--accent)' : 'var(--glass-border)',
                          background: active ? 'rgba(56,217,255,0.14)' : 'var(--glass)',
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                          fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: active ? 600 : 400,
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <div style={{ height: 16 }} />

            {/* Sticky CTA */}
            <div style={{ position: 'sticky', bottom: 0, paddingBottom: 8 }}>
              <button
                onClick={getRecommendation}
                disabled={loadingRec}
                style={{
                  width: '100%', padding: '15px', borderRadius: 14, border: 'none',
                  background: loadingRec ? 'var(--glass)' : 'var(--accent)',
                  color: loadingRec ? 'var(--text-muted)' : '#080c14',
                  fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
                  cursor: loadingRec ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: loadingRec ? 'none' : '0 4px 24px var(--accent-glow)',
                }}
              >
                {loadingRec
                  ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Getting your look…</>
                  : 'Get my look →'}
              </button>
              {recError && (
                <p style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>{recError}</p>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SCREEN: RESULT
        ══════════════════════════════════════════════════════════════ */}
        {screen === 'result' && rec && parsed && (
          <div className="screen-in">
            {/* Header */}
            <div style={{ marginBottom: 20, paddingTop: 8 }}>
              {brief && (
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}>
                  {brief.descriptor}
                </div>
              )}
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {rec.city} · {timeFrom} → Midnight
              </div>
            </div>

            {/* Clothing card */}
            {(parsed.clothing || (!parsed.clothing && !parsed.shoes)) && (
              <div style={{ ...glassCard, padding: '20px 22px', marginBottom: 14 }}>
                <p style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>
                  Clothing
                </p>
                <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.65 }}>
                  {parsed.clothing || rec.text}
                </p>
              </div>
            )}

            {/* Shoes card */}
            {parsed.shoes && (
              <div style={{ ...glassCard, padding: '18px 22px', marginBottom: 14 }}>
                <p style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>
                  Shoes
                </p>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{parsed.shoes}</p>
              </div>
            )}

            {/* Carry card */}
            {(parsed.carry.length > 0 || parsed.nothing) && (
              <div style={{ ...glassCard, padding: '18px 22px', marginBottom: 14 }}>
                <p style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>
                  Carry
                </p>
                {parsed.nothing ? (
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nothing extra needed today.</p>
                ) : parsed.carry.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', fontSize: 14, color: 'var(--text)' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>·</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Note */}
            {parsed.note && (
              <div style={{ padding: '12px 16px', marginBottom: 14, borderRadius: 12, background: 'rgba(255,140,66,0.07)', border: '1px solid rgba(255,140,66,0.2)' }}>
                <p style={{ fontSize: 13, color: 'var(--warm)', lineHeight: 1.6 }}>⚡ {parsed.note}</p>
              </div>
            )}

            {/* Feedback */}
            <div style={{ ...glassCard, padding: '16px 22px', marginBottom: 14 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>
                How&apos;d we do?
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['thumbs_up', 'thumbs_down'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => submitRating(v)}
                    style={{
                      padding: '9px 18px', borderRadius: 10,
                      border: '1px solid',
                      borderColor: rating === v ? 'var(--accent)' : 'var(--glass-border)',
                      background: rating === v ? 'rgba(56,217,255,0.12)' : 'var(--glass)',
                      color: rating === v ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: 18, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {v === 'thumbs_up' ? '👍' : '👎'}
                  </button>
                ))}
                {rating && (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>
                    {rating === 'thumbs_up' ? 'Thanks! 🙌' : 'Got it — we\'ll do better.'}
                  </span>
                )}
              </div>
            </div>

            {/* Preferences */}
            <div style={{ ...glassCard, padding: '16px 22px', marginBottom: 20 }}>
              <button
                onClick={() => setShowPrefInput(p => !p)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Customise next look
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{showPrefInput ? '▲' : '▼'}</span>
              </button>

              {showPrefInput && (
                <div style={{ marginTop: 14 }}>
                  <textarea
                    value={userPreferences}
                    onChange={e => { setUserPreferences(e.target.value); setPrefSaved(false) }}
                    placeholder="e.g. I run cold, prefer dark colours, no sneakers…"
                    rows={3}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: '1px solid var(--glass-border)', background: 'var(--glass)',
                      color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 13,
                      outline: 'none', resize: 'vertical', lineHeight: 1.6,
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
                  />
                  <button
                    onClick={() => {
                      localStorage.setItem('wc_user_pref', userPreferences.trim())
                      setPrefSaved(true)
                    }}
                    style={{
                      marginTop: 8, padding: '8px 18px', borderRadius: 8,
                      border: 'none', background: 'var(--accent)', color: '#080c14',
                      fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Save preferences
                  </button>
                  {prefSaved && <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--success)' }}>Saved ✓</span>}
                </div>
              )}
            </div>

            {/* Go back to wardrobe */}
            <button
              onClick={() => { setRec(null); setScreen('wardrobe') }}
              style={{
                width: '100%', padding: '13px', borderRadius: 14,
                border: '1px solid var(--glass-border)', background: 'transparent',
                color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ← Adjust wardrobe
            </button>
          </div>
        )}

        {/* Fallback: show result if rec exists but screen mismatch */}
        {screen !== 'result' && rec && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button
              onClick={() => setScreen('result')}
              style={{
                fontSize: 13, color: 'var(--accent)', background: 'none',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              View today&apos;s recommendation →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
