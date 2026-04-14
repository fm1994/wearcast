'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Settings() {
  const router = useRouter()
  const [city, setCity] = useState('')
  const [wardrobeCount, setWardrobeCount] = useState(0)
  const [notifTime, setNotifTime] = useState('07:00')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setCity(localStorage.getItem('wc_city') || '')
    const wardrobe = JSON.parse(localStorage.getItem('wc_wardrobe') || '[]')
    setWardrobeCount(wardrobe.length)
    setNotifTime(localStorage.getItem('wc_notif_time') || '07:00')
  }, [])

  const handleSaveCity = () => {
    if (!city.trim()) return
    localStorage.setItem('wc_city', city.trim())
    const today = new Date().toISOString().split('T')[0]
    localStorage.removeItem(`wc_rec_${today}`)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveNotifTime = () => {
    localStorage.setItem('wc_notif_time', notifTime)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleResetAll = () => {
    if (!confirm('This will clear your city, wardrobe, and all cached data. Continue?')) return
    localStorage.clear()
    router.push('/')
  }

  return (
    <main className="flex flex-col min-h-screen px-4 py-8 max-w-md mx-auto w-full" style={{ background: 'var(--background)' }}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--accent)' }}>
          ← Back
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h1>
      </div>

      <div className="space-y-4">
        {/* Location */}
        <div className="rounded-2xl p-5 shadow-sm" style={{ background: 'var(--card)' }}>
          <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Location</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Toronto, London, Dubai"
              className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={handleSaveCity}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Save
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            Changing your city clears today&apos;s cached recommendation.
          </p>
        </div>

        {/* Wardrobe */}
        <div className="rounded-2xl p-5 shadow-sm" style={{ background: 'var(--card)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Wardrobe</h2>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{wardrobeCount} items</span>
          </div>
          <Link
            href="/onboarding/wardrobe"
            className="block w-full py-2.5 rounded-xl text-center text-sm font-medium border transition hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            Edit wardrobe
          </Link>
        </div>

        {/* Notification time */}
        <div className="rounded-2xl p-5 shadow-sm" style={{ background: 'var(--card)' }}>
          <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Morning notification</h2>
          <div className="flex gap-2 items-center">
            <input
              type="time"
              value={notifTime}
              onChange={(e) => setNotifTime(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={handleSaveNotifTime}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Save
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            Push notifications require the app to be installed (Add to Home Screen on iOS).
          </p>
        </div>

        {saved && (
          <div className="rounded-xl px-4 py-3 text-sm text-center font-medium" style={{ background: '#d1fae5', color: '#065f46' }}>
            Saved!
          </div>
        )}

        {/* Danger zone */}
        <div className="rounded-2xl p-5 shadow-sm" style={{ background: 'var(--card)' }}>
          <h2 className="font-semibold mb-3 text-red-600">Reset</h2>
          <button
            onClick={handleResetAll}
            className="w-full py-2.5 rounded-xl text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition"
          >
            Clear all data and start over
          </button>
        </div>
      </div>
    </main>
  )
}
