export type WardrobeCategory = 'top' | 'bottom' | 'shoes' | 'carry'

export interface WardrobeItem {
  id: string
  label: string
  category: WardrobeCategory
  /** How warm/thick this item is — used for prompt context */
  weight?: 'thin' | 'medium' | 'thick' | 'waterproof' | 'snow'
}

export const WARDROBE_ITEMS: WardrobeItem[] = [
  // ── Tops (thin → thick) ─────────────────────────────────────────────────────
  { id: 'light_top',      label: 'Light top / t-shirt',  category: 'top', weight: 'thin'       },
  { id: 'long_sleeve',    label: 'Long-sleeve top',       category: 'top', weight: 'thin'       },
  { id: 'light_sweater',  label: 'Light sweater',         category: 'top', weight: 'medium'     },
  { id: 'hoodie',         label: 'Hoodie',                category: 'top', weight: 'medium'     },
  { id: 'thermal_top',    label: 'Thermal top',           category: 'top', weight: 'thick'      },
  { id: 'light_jacket',   label: 'Light jacket',          category: 'top', weight: 'medium'     },
  { id: 'windbreaker',    label: 'Windbreaker',           category: 'top', weight: 'medium'     },
  { id: 'raincoat',       label: 'Raincoat',              category: 'top', weight: 'waterproof' },
  { id: 'puffer',         label: 'Puffer jacket',         category: 'top', weight: 'thick'      },
  { id: 'winter_coat',    label: 'Winter coat',           category: 'top', weight: 'thick'      },

  // ── Bottoms (thin → thick) ──────────────────────────────────────────────────
  { id: 'shorts',          label: 'Shorts',               category: 'bottom', weight: 'thin'    },
  { id: 'light_trousers',  label: 'Light trousers',       category: 'bottom', weight: 'thin'    },
  { id: 'jeans',           label: 'Jeans',                category: 'bottom', weight: 'medium'  },
  { id: 'warm_trousers',   label: 'Warm trousers',        category: 'bottom', weight: 'thick'   },
  { id: 'thermal_leggings',label: 'Thermal leggings',     category: 'bottom', weight: 'thick'   },

  // ── Shoes ───────────────────────────────────────────────────────────────────
  { id: 'sandals',          label: 'Sandals',             category: 'shoes', weight: 'thin'       },
  { id: 'sneakers',         label: 'Sneakers',            category: 'shoes', weight: 'thin'       },
  { id: 'waterproof_shoes', label: 'Waterproof shoes',    category: 'shoes', weight: 'waterproof' },
  { id: 'rain_boots',       label: 'Rain boots',          category: 'shoes', weight: 'waterproof' },
  { id: 'snow_boots',       label: 'Snow boots',          category: 'shoes', weight: 'snow'       },

  // ── Carry ────────────────────────────────────────────────────────────────────
  { id: 'umbrella',         label: 'Umbrella',            category: 'carry' },
  { id: 'compact_umbrella', label: 'Compact umbrella',    category: 'carry' },
  { id: 'water_bottle',     label: 'Water bottle',        category: 'carry' },
  { id: 'sunglasses',       label: 'Sunglasses',          category: 'carry' },
  { id: 'sunscreen',        label: 'Sunscreen',           category: 'carry' },
]

export const CATEGORY_LABELS: Record<WardrobeCategory, string> = {
  top:    'Tops',
  bottom: 'Bottoms',
  shoes:  'Shoes',
  carry:  'Carry items',
}

export const UMBRELLA_IDS = ['umbrella', 'compact_umbrella']
export const WATERPROOF_IDS = ['raincoat', 'windbreaker', 'waterproof_shoes', 'rain_boots']

// Clothing vocabulary — kept for any future validation use
export const CLOTHING_VOCABULARY = [
  'coat', 'jacket', 'vest', 'blazer', 'cardigan', 'sweater', 'hoodie', 'jumper',
  'pullover', 'fleece', 'puffer', 'parka', 'windbreaker', 'raincoat', 'thermal',
  'shirt', 'blouse', 'top', 'tee', 't-shirt', 'tank', 'polo', 'turtleneck',
  'pants', 'trousers', 'jeans', 'shorts', 'leggings', 'joggers', 'sweatpants',
  'boots', 'shoes', 'sneakers', 'sandals', 'loafers', 'trainers',
  'umbrella', 'sunglasses', 'sunscreen', 'bottle', 'scarf', 'gloves', 'hat',
]

export function isValidClothingItem(input: string): boolean {
  const lower = input.toLowerCase().trim()
  if (lower.length < 2) return false
  return CLOTHING_VOCABULARY.some(word => lower.includes(word))
}

// No custom suggestions — wardrobe is preset essentials only
export const CUSTOM_SUGGESTIONS: Record<WardrobeCategory, string[]> = {
  top: [], bottom: [], shoes: [], carry: [],
}
