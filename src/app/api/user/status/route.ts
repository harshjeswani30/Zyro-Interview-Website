// POST /api/user/status
// Called by the desktop app on every launch after silentTokenRefresh.
// Returns the authoritative trial/session state from the DB — this is the
// single source of truth. No client-side state can override this.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import * as jose from 'jose'

const TRIAL_SECONDS = 600

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    // Verify JWT — accept even "expired" tokens (clockTolerance) since refresh-token
    // already rotated it. We only need to authenticate the user ID.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const secret = new TextEncoder().encode(serviceRoleKey)
    let payload: any
    try {
      const { payload: p } = await jose.jwtVerify(token, secret, {
        clockTolerance: '9999d',
      })
      payload = p
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const userId = payload.sub
    if (!userId) return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 })

    const supabase = createAdminClient()

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('sessions_balance, is_premium, trial_start_at, trial_seconds_used, full_name, email')
      .eq('id', userId)
      .maybeSingle()

    if (error || !profile) {
      console.error('[user/status] Profile not found for', userId, error)
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Compute trial state server-side — this is authoritative.
    // trial_seconds_used tracks ACTUAL interview seconds used (not wall-clock),
    // so closing the app and reopening later doesn't burn the trial.
    const trialStartAt: string | null = profile.trial_start_at ?? null
    const trialSecondsUsed: number = profile.trial_seconds_used ?? 0
    let trialExpired = false
    let trialTimeLeft: number | null = null
    let trialEverStarted = false

    if (trialStartAt) {
      trialEverStarted = true
      const remaining = Math.max(0, TRIAL_SECONDS - trialSecondsUsed)
      trialTimeLeft = remaining
      trialExpired = remaining <= 0
    }

    // Check if paid (has any purchases) — paid users can never reclaim trial
    const { count: purchaseCount } = await supabase
      .from('purchases')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'paid')

    const hasPurchases = (purchaseCount ?? 0) > 0

    return NextResponse.json({
      success:              true,
      sessions_balance:     profile.sessions_balance ?? 0,
      is_premium:           profile.is_premium ?? false,
      has_purchases:        hasPurchases,
      trial_start_at:       trialStartAt,
      trial_ever_started:   trialEverStarted,
      trial_expired:        trialExpired,
      trial_time_left:      trialTimeLeft,
      trial_seconds_used:   trialSecondsUsed,
      full_name:            profile.full_name ?? null,
    })
  } catch (err: any) {
    console.error('[user/status] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
