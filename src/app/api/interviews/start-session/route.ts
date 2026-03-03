// POST /api/interviews/start-session
// Called by desktop app when user clicks "Start Interview".
// Reads from the subscriptions table (the authoritative source since migration 004).
// Falls back to profiles if the subscription row doesn't exist yet.
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

    // ── Use subscriptions table (migration 004) with fallback to profiles ────────
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('sessions_balance, is_premium, trial_seconds_used, trial_seconds_total, status')
      .eq('user_id', userId)
      .maybeSingle()

    // If subscriptions row is missing, fall back to profiles (pre-migration users)
    if (subErr || !sub) {
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('sessions_balance, is_premium, trial_seconds_used')
        .eq('id', userId)
        .maybeSingle()

      if (profErr || !profile) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      const balance: number = profile.sessions_balance ?? 0

      // premium or paid session
      if (profile.is_premium || balance >= 1) {
        if (balance >= 1) {
          await supabase
            .from('profiles')
            .update({ sessions_balance: balance - 1 })
            .eq('id', userId)
        }
        return NextResponse.json({
          success:   true,
          isPremium: true,
          balance:   Math.max(0, balance - (profile.is_premium ? 0 : 1)),
          sessionId: crypto.randomUUID(),
        })
      }

      const secondsUsed: number = profile.trial_seconds_used ?? 0
      const remaining = Math.max(0, TRIAL_SECONDS - secondsUsed)
      if (remaining <= 0) {
        return NextResponse.json({ error: 'trial_expired', message: 'Trial expired' }, { status: 402 })
      }
      return NextResponse.json({
        success:          true,
        isPremium:        false,
        trialTimeLeft:    remaining,
        trialSecondsUsed: secondsUsed,
        sessionId:        crypto.randomUUID(),
      })
    }

    const balance: number = sub.sessions_balance ?? 0

    // ─── Premium (unlimited) path ─────────────────────────────────────────────
    if (sub.is_premium) {
      return NextResponse.json({
        success:   true,
        isPremium: true,
        balance:   0,
        sessionId: crypto.randomUUID(),
      })
    }

    // ─── Paid session path ────────────────────────────────────────────────────
    if (balance >= 1) {
      const { data: result, error: deductErr } = await supabase.rpc('deduct_session_v2', { uid: userId })
      if (deductErr) {
        console.error('[start-session] deduct_session_v2 failed:', deductErr)
        return NextResponse.json({ error: 'Failed to deduct session' }, { status: 500 })
      }
      if (result?.error === 'no_sessions') {
        // Shouldn't happen (balance was ≥1) but handle gracefully
        return NextResponse.json({ error: 'no_sessions', message: 'No sessions remaining' }, { status: 402 })
      }
      return NextResponse.json({
        success:   true,
        isPremium: true,
        balance:   result?.sessions_balance ?? balance - 1,
        sessionId: crypto.randomUUID(),
      })
    }

    // ─── Free trial path ─────────────────────────────────────────────────────
    // If status is already 'trial_expired', reject immediately
    if (sub.status === 'trial_expired' || sub.status === 'cancelled' || sub.status === 'refunded') {
      return NextResponse.json(
        { error: 'no_sessions', message: 'You have no sessions remaining. Please purchase more to continue.' },
        { status: 402 }
      )
    }

    const secondsUsed: number = sub.trial_seconds_used ?? 0
    const total: number = sub.trial_seconds_total ?? TRIAL_SECONDS
    const remaining = Math.max(0, total - secondsUsed)

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

