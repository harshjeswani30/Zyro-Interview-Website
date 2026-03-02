// POST /api/interviews/start-session
// Called by desktop app when user clicks "Start Interview".
// Handles BOTH paid-session users and free-trial users:
//   - Paid (sessions_balance >= 1): deducts one session
//   - is_premium: passes through with no deduction
//   - Trial (trial_seconds_used < 600): returns remaining seconds
//   - Trial (trial_seconds_used >= 600): rejects with 'trial_expired'
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
      .select('sessions_balance, is_premium, trial_seconds_used')
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

    const secondsUsed: number = profile.trial_seconds_used ?? 0
    const remaining = Math.max(0, TRIAL_SECONDS - secondsUsed)

    if (remaining <= 0) {
      return NextResponse.json(
        {
          error:   'trial_expired',
          message: 'Your 10\u2011minute free trial has been used. Please purchase a session to continue.',
        },
        { status: 402 }
      )
    }

    console.log(`[start-session] Trial for user ${userId}: ${secondsUsed}s used, ${remaining}s left`)

    return NextResponse.json({
      success:          true,
      isPremium:        false,
      trialTimeLeft:    remaining,
      trialSecondsUsed: secondsUsed,
      sessionId:        crypto.randomUUID(),
    })

  } catch (err: any) {
    console.error('[start-session] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
