-- ────────────────────────────────────────────────────────────
-- Migration 003: Modern access architecture
--   • stripe_session_id column (purchases)
--   • stripe_webhook_events table (idempotency)
--   • get_user_access RPC
--   • credit_sessions RPC
--   • Realtime publication for profiles
-- ────────────────────────────────────────────────────────────

-- 1. Add stripe_session_id alias column to purchases (keep razorpay_order_id for backward compat)
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS stripe_session_id TEXT UNIQUE;

-- Back-fill: copy existing razorpay_order_id values that look like Stripe sessions
UPDATE purchases SET stripe_session_id = razorpay_order_id
  WHERE stripe_session_id IS NULL AND razorpay_order_id LIKE 'cs_%';

-- 2. Idempotency table for Stripe webhook events
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id            TEXT PRIMARY KEY,   -- Stripe event ID (evt_...)
  type          TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload       JSONB
);

-- 3. get_user_access RPC — returns everything the desktop app needs in one call
CREATE OR REPLACE FUNCTION get_user_access(p_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p profiles%ROWTYPE;
  trial_total_secs CONSTANT INTEGER := 600;
  remaining INTEGER;
BEGIN
  SELECT * INTO p FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object(
      'found', false,
      'is_premium', false,
      'sessions_balance', 0,
      'trial_seconds_used', 0,
      'trial_expired', false,
      'trial_time_left', trial_total_secs
    );
  END IF;

  remaining := GREATEST(0, trial_total_secs - COALESCE(p.trial_seconds_used, 0));

  RETURN json_build_object(
    'found',              true,
    'is_premium',         COALESCE(p.is_premium, false),
    'sessions_balance',   COALESCE(p.sessions_balance, 0),
    'trial_seconds_used', COALESCE(p.trial_seconds_used, 0),
    'trial_expired',      COALESCE(p.trial_seconds_used, 0) >= trial_total_secs,
    'trial_time_left',    remaining
  );
END;
$$;

-- 4. credit_sessions — atomically credit sessions to a user (used by webhook)
CREATE OR REPLACE FUNCTION credit_sessions(p_user_id UUID, p_sessions INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles
    SET sessions_balance = COALESCE(sessions_balance, 0) + p_sessions
  WHERE id = p_user_id;
END;
$$;

-- 5. Enable realtime on profiles table so desktop renderer can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
