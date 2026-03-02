// POST /api/user/save-trial
// Called by the desktop app when:
//   1. The interview panel is closed (any duration)
//   2. The trial expires (forces seconds_used = 600)
//   3. Auto-save every 30 s during an active interview
//
// Uses a DB-level MAX so the value only ever increases — no bypasses possible.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import * as jose from 'jose'

const TRIAL_SECONDS = 600

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, seconds_used } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    if (typeof seconds_used !== 'number' || seconds_used < 0) {
      return NextResponse.json({ error: 'Invalid seconds_used' }, { status: 400 })
    }

    // Accept even "expired" JWTs — same pattern as /api/user/status
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

    // Clamp to max TRIAL_SECONDS — can never exceed 600
    const clamped = Math.min(Math.floor(seconds_used), TRIAL_SECONDS)

    const supabase = createAdminClient()

    // Only update if the new value is higher than what's already stored.
    // Uses a single atomic UPDATE with a WHERE clause — no race condition.
    const { data, error } = await supabase
      .from('profiles')
      .update({ trial_seconds_used: clamped, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .lt('trial_seconds_used', clamped) // only update if new value is higher
      .select('trial_seconds_used')
      .maybeSingle()

    if (error) {
      console.error('[save-trial] DB error:', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    // data is null when the WHERE trial_seconds_used < clamped didn't match
    // (i.e. DB already had same or higher value) — that's fine, not an error.
    const finalValue = data?.trial_seconds_used ?? clamped

    return NextResponse.json({
      success: true,
      trial_seconds_used: finalValue,
      trial_time_left: Math.max(0, TRIAL_SECONDS - finalValue),
    })
  } catch (err: any) {
    console.error('[save-trial] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
