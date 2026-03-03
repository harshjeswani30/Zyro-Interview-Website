-- Migration: Add Stripe coupon/promo IDs to coupons table
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS stripe_coupon_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_promo_id  TEXT;
