// POST /api/interviews/start-session
// Called by desktop app when user clicks "Start Interview".
// Handles BOTH paid-session users and free-trial users:
//   - Paid (sessions_balance >= 1): deducts one session
//   - is_premium: passes through with no deduction
//   - Trial (first use): stamps trial_start_at in DB, returns 600s
//   - Trial (used):      calculates remaining seconds, rejects with 'trial_expired' if 0
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import crypto from 'crypto'
import * as jose from 'jose'

const TRIAL_SECONDS = 600 // 10 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    // Verify JWT (works for both short-lived desktop_auth and long-lived desktop_session tokens)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const secret = new TextEncoder().encode(serviceRoleKey)
    let payload: any
    try {
      const { payload: p } = await jose.jwtVerify(token, secret)
      payload = p
    } catch {
      return NextResponse.json({ error: 'Invalid session token' }, { status: 401 })
    }

    const userId = payload.sub
    if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const supabase = createAdminClient()

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('sessions_balance, is_premium, trial_start_at')
      .eq('id', userId)
      .maybeSingle()

    if (profErr || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const balance: number = profile.sessions_balance ?? 0

    // ─── Paid session path ────────────────────────────────────────────────────
    if (balance >= 1) {
      const { data: updated, error: updateErr } = await supabase
        .from('profiles')
        .update({ sessions_balance: balance - 1 })
        .eq('id', userId)
        .select('sessions_balance')
        .single()

      if (updateErr) {
        return NextResponse.json({ error: 'Failed to deduct session' }, { status: 500 })
      }

      return NextResponse.json({
        success:   true,
        isPremium: true,
        balance:   updated.sessions_balance,
        sessionId: crypto.randomUUID(),
      })
    }

    // ─── Premium (unlimited) path ─────────────────────────────────────────────
    if (profile.is_premium) {
      return NextResponse.json({
        success:   true,
        isPremium: true,
        balance:   0,
        sessionId: crypto.randomUUID(),
      })
    }

    // ─── Free trial path ─────────────────────────────────────────────────────
    // If the user has ever purchased sessions (even if all are spent), deny trial.
    // This prevents paid users from falling back to the free trial.
    const { count: purchaseCount } = await supabase
      .from('purchases')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'paid')

    if ((purchaseCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:   'no_sessions',
          message: 'You have no sessions remaining. Please purchase more to continue.',
        },
        { status: 402 }
      )
    }

    const now = Date.now()

    if (profile.trial_start_at) {
      // Trial already started — check how much time is left
      const elapsed = (now - new Date(profile.trial_start_at).getTime()) / 1000
      const remaining = Math.max(0, TRIAL_SECONDS - elapsed)

      if (remaining <= 0) {
        // Trial fully consumed — hard block; user must buy a session
        return NextResponse.json(
          {
            error:   'trial_expired',
            message: 'Your 10‑minute free trial has been used. Please purchase a session to continue.',
          },
          { status: 402 }
        )
      }

      // Still has time remaining
      return NextResponse.json({
        success:       true,
        isPremium:     false,
        trialTimeLeft: Math.floor(remaining),
        trialStartAt:  profile.trial_start_at, // ISO timestamp — client anchors its timer to this
        sessionId:     crypto.randomUUID(),
      })
    }

    // First-ever trial — stamp the start time in DB now
    const trialStartAt = new Date(now).toISOString()
    const { data: stamped, error: stampErr } = await supabase
      .from('profiles')
      .update({ trial_start_at: trialStartAt })
      .eq('id', userId)
      .select('trial_start_at')
      .single()

    if (stampErr || !stamped?.trial_start_at) {
      console.error('[start-session] CRITICAL: Failed to stamp trial_start_at for user', userId, stampErr)
      return NextResponse.json(
        { error: 'Failed to initialize trial. Please try again.' },
        { status: 500 }
      )
    }

    console.log('[start-session] Trial started for user', userId, 'at', stamped.trial_start_at)

    return NextResponse.json({
      success:       true,
      isPremium:     false,
      trialTimeLeft: TRIAL_SECONDS,
      trialStartAt:  stamped.trial_start_at,
      sessionId:     crypto.randomUUID(),
    })

  } catch (err: any) {
    console.error('[start-session] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
