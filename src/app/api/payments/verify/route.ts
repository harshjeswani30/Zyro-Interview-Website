// POST /api/payments/verify
// Fallback verification called from pricing page after Stripe redirect.
// The webhook is the primary/authoritative way to credit sessions.
// This acts as a safety net for cases where the webhook fires slowly.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  try {
    const { session_id, userId } = await request.json()

    if (!session_id || !userId) {
      return NextResponse.json({ error: 'Missing session_id or userId' }, { status: 400 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    const stripeSession = await stripe.checkout.sessions.retrieve(session_id)

    if (stripeSession.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }

    // Verify session belongs to this user
    if (stripeSession.metadata?.userId !== userId) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // Idempotency: check if webhook or a previous verify already handled this
    const { data: existingEvent } = await supabase
      .from('stripe_webhook_events')
      .select('id')
      .eq('id', `verify_${session_id}`)
      .maybeSingle()

    if (existingEvent) {
      const { data: profile } = await supabase
        .from('profiles').select('sessions_balance').eq('id', userId).maybeSingle()
      return NextResponse.json({
        success: true, alreadyProcessed: true, newBalance: profile?.sessions_balance ?? 0,
      })
    }

    // Also check via purchase record
    const { data: paidPurchase } = await supabase
      .from('purchases')
      .select('sessions_granted, status')
      .or(`stripe_session_id.eq.${session_id},razorpay_order_id.eq.${session_id}`)
      .eq('status', 'paid')
      .maybeSingle()

    if (paidPurchase) {
      const { data: profile } = await supabase
        .from('profiles').select('sessions_balance').eq('id', userId).maybeSingle()
      return NextResponse.json({
        success: true, alreadyProcessed: true, newBalance: profile?.sessions_balance ?? 0,
      })
    }

    // Webhook hasn't fired yet — process as fallback
    const planId = stripeSession.metadata?.planId
    const SESSION_CREDITS: Record<string, number> = { session_1: 1, session_5: 5, session_10: 10 }
    const sessionsToCredit = planId ? (SESSION_CREDITS[planId] ?? 0) : 0

    if (sessionsToCredit === 0) {
      return NextResponse.json({ error: 'Unknown plan or no sessions to credit' }, { status: 400 })
    }

    const paymentIntentId = typeof stripeSession.payment_intent === 'string'
      ? stripeSession.payment_intent
      : (stripeSession.payment_intent as any)?.id ?? null

    // Upsert purchase record
    await supabase.from('purchases').upsert({
      user_id:             userId,
      plan_id:             planId,
      sessions_granted:    sessionsToCredit,
      amount_paise:        stripeSession.amount_total ?? 0,
      razorpay_order_id:   session_id,
      stripe_session_id:   session_id,
      razorpay_payment_id: paymentIntentId,
      status:              'paid',
      paid_at:             new Date().toISOString(),
    }, { onConflict: 'stripe_session_id', ignoreDuplicates: true })

    // Credit sessions via RPC
    await supabase.rpc('credit_sessions', { p_user_id: userId, p_sessions: sessionsToCredit })

    // Mark processed so webhook doesn't double-credit
    await supabase.from('stripe_webhook_events').upsert({
      id: `verify_${session_id}`, type: 'verify_fallback',
    }, { onConflict: 'id', ignoreDuplicates: true })

    const { data: updatedProfile } = await supabase
      .from('profiles').select('sessions_balance').eq('id', userId).maybeSingle()

    return NextResponse.json({
      success: true, sessionsAdded: sessionsToCredit,
      newBalance: updatedProfile?.sessions_balance ?? 0,
    })
  } catch (err: any) {
    console.error('[verify-payment] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
