// POST /api/payments/verify
// Called from frontend after Stripe Checkout redirect
// Retrieves session from Stripe, marks purchase as paid, credits sessions to user
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  try {
    const { session_id, userId } = await request.json()

    if (!session_id || !userId) {
      return NextResponse.json({ error: 'Missing session_id or userId' }, { status: 400 })
    }

    // 1. Retrieve Stripe Checkout Session and verify payment status
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    const stripeSession = await stripe.checkout.sessions.retrieve(session_id)

    if (stripeSession.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }

    // 2. Safeguard: ensure the session belongs to this user
    if (stripeSession.metadata?.userId !== userId) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // 3. Find matching pending purchase (stripe session id stored in razorpay_order_id)
    const { data: purchase, error: findErr } = await supabase
      .from('purchases')
      .select('*')
      .eq('razorpay_order_id', session_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (findErr || !purchase) {
      // Idempotency: if already paid, return success
      const { data: paidPurchase } = await supabase
        .from('purchases')
        .select('sessions_granted')
        .eq('razorpay_order_id', session_id)
        .eq('status', 'paid')
        .maybeSingle()
      if (paidPurchase) {
        return NextResponse.json({ success: true, alreadyProcessed: true, sessionsAdded: paidPurchase.sessions_granted })
      }
      return NextResponse.json({ error: 'Purchase record not found' }, { status: 404 })
    }

    // 4. Mark purchase as paid
    const paymentIntentId = typeof stripeSession.payment_intent === 'string'
      ? stripeSession.payment_intent
      : stripeSession.payment_intent?.id ?? null

    await supabase
      .from('purchases')
      .update({
        status:              'paid',
        razorpay_payment_id: paymentIntentId,  // stores stripe payment_intent id
        paid_at:             new Date().toISOString(),
      })
      .eq('id', purchase.id)

    // 5. Credit sessions to user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('sessions_balance')
      .eq('id', userId)
      .maybeSingle()

    const currentBalance = profile?.sessions_balance ?? 0

    // Permanently block the free trial for anyone who buys sessions.
    await supabase
      .from('profiles')
      .update({ sessions_balance: currentBalance + purchase.sessions_granted, trial_seconds_used: 600 })
      .eq('id', userId)

    // 6. Increment coupon used_count if a coupon was applied
    if (purchase.coupon_id) {
      await supabase.rpc('increment_coupon_usage', { coupon_id_arg: purchase.coupon_id })
    }

    return NextResponse.json({
      success:       true,
      sessionsAdded: purchase.sessions_granted,
      newBalance:    currentBalance + purchase.sessions_granted,
    })
  } catch (err: any) {
    console.error('[verify-payment] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
