-- WearCast Database Schema
-- Run this in the Supabase SQL editor at: your-project.supabase.co/project/sql

-- Users
CREATE TABLE IF NOT EXISTS users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz DEFAULT now(),
  is_anonymous bool DEFAULT true,
  email        text,
  city         text,
  notification_time time DEFAULT '07:00'
);

-- Wardrobe items
CREATE TABLE IF NOT EXISTS wardrobe_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  item_name  text NOT NULL,
  category   text NOT NULL,
  owned      bool DEFAULT true,
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wardrobe_items_user_id_idx ON wardrobe_items(user_id);

-- Recommendations (one per user per day)
CREATE TABLE IF NOT EXISTS recommendations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES users(id) ON DELETE CASCADE,
  date                date DEFAULT CURRENT_DATE,
  weather_snapshot    jsonb,
  recommendation_text text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS recommendations_user_date_idx ON recommendations(user_id, date);

-- Feedback (thumbs up/down per recommendation per user)
CREATE TABLE IF NOT EXISTS feedback (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id           uuid REFERENCES recommendations(id) ON DELETE CASCADE,
  user_id                     uuid REFERENCES users(id) ON DELETE CASCADE,
  rating                      text CHECK (rating IN ('thumbs_up', 'thumbs_down')),
  timestamp                   timestamptz DEFAULT now(),
  changeable_until            timestamptz,
  weather_conditions_snapshot jsonb,
  UNIQUE (recommendation_id, user_id)
);

-- Disable Row Level Security for MVP (service role key bypasses anyway)
-- Enable and configure RLS before going to production with user-facing auth
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE wardrobe_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations DISABLE ROW LEVEL SECURITY;
ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;
