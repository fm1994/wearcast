'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WARDROBE_ITEMS, CATEGORY_LABELS, WardrobeCategory } from '@/lib/wardrobe-items'

const CATEGORIES: WardrobeCategory[] = ['top', 'bottom', 'shoes', 'carry']

export default function WardrobeSetup() {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  // Load existing wardrobe if editing
  useEffect(() => {
    const stored = localStorage.getItem('wc_wardrobe')
    if (stored) {
      try {
        const items: string[] = JSON.parse(stored)
        setSelected(new Set(items))
      } catch {
        // ignore
      }
    }
  }, [])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const items = Array.from(selected)
    localStorage.setItem('wc_wardrobe', JSON.stringify(items))
    localStorage.setItem('wc_wardrobe_done', 'done')

    // Clear today's cached recommendation so it regenerates with new wardrobe
    const today = new Date().toISOString().split('T')[0]
    localStorage.removeItem(`wc_rec_${today}`)

    router.push('/')
  }

  const handleSkip = () => {
    localStorage.setItem('wc_wardrobe_done', 'skipped')
    router.push('/')
  }

  return (
    <main className="flex flex-col min-h-screen px-4 py-8 max-w-md mx-auto w-full" style={{ background: 'var(--background)' }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>Your wardrobe</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Select everything you own. WearCast will only ever suggest items from this list.
        </p>
      </div>

      <div className="space-y-6 flex-1">
        {CATEGORIES.map((category) => {
          const items = WARDROBE_ITEMS.filter((i) => i.category === category)
          return (
            <div key={category}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
                {CATEGORY_LABELS[category]}
              </p>
              <div className="flex flex-wrap gap-2">
                {items.map((item) => {
                  const active = selected.has(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      className="px-4 py-2 rounded-full text-sm font-medium border transition-all"
                      style={{
                        background: active ? 'var(--accent)' : 'var(--card)',
                        color: active ? '#fff' : 'var(--text-primary)',
                        borderColor: active ? 'var(--accent)' : 'var(--border)',
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 space-y-3 sticky bottom-0 pb-4 pt-2" style={{ background: 'var(--background)' }}>
        <p className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
          {selected.size} item{selected.size !== 1 ? 's' : ''} selected
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl font-semibold text-white text-base transition disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {saving ? 'Saving…' : 'Save my wardrobe'}
        </button>
        <button
          onClick={handleSkip}
          className="w-full py-3 text-sm text-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          Skip for now
        </button>
      </div>
    </main>
  )
}
