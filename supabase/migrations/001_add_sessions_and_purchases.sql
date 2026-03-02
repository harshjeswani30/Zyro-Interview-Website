-- ────────────────────────────────────────────────────────────
-- Migration: add sessions_balance to profiles + purchases table
-- Run this in Supabase SQL editor (Dashboard → SQL Editor)
-- ────────────────────────────────────────────────────────────

-- 1. Add session balance column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sessions_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_premium       BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Purchases table — records every Razorpay payment
CREATE TABLE IF NOT EXISTS purchases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id            TEXT NOT NULL,           -- 'session_1' | 'session_5' | 'session_10'
  sessions_granted   INTEGER NOT NULL,
  amount_paise       INTEGER NOT NULL,        -- amount in Indian paise (₹300 = 30000)
  razorpay_order_id  TEXT UNIQUE,
  razorpay_payment_id TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | failed
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at            TIMESTAMPTZ
);

-- RLS: users can read their own purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own purchases" ON purchases
  FOR SELECT USING (auth.uid() = user_id);

-- 3. Function: deduct one session when interview starts (called server-side from desktop-verify)
CREATE OR REPLACE FUNCTION deduct_session(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  bal INTEGER;
BEGIN
  SELECT sessions_balance INTO bal FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF bal IS NULL OR bal < 1 THEN RETURN FALSE; END IF;
  UPDATE profiles SET sessions_balance = sessions_balance - 1 WHERE id = p_user_id;
  RETURN TRUE;
END;
$$;
