// POST /api/payments/webhook
// Stripe webhook handler — the authoritative way to credit sessions after payment.
// Configure in Stripe Dashboard:
//   Endpoint URL: https://zyro-interview-website.vercel.app/api/payments/webhook
//   Events: checkout.session.completed
// Required env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Stripe from 'stripe'

// Must disable body parsing so we can verify the Stripe signature
export const dynamic = 'force-dynamic'

const SESSION_CREDITS: Record<string, number> = {
  session_1:  1,
  session_5:  5,
  session_10: 10,
}

export async function POST(request: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  // 1. Read raw body and verify Stripe signature
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err: any) {
    console.error('[webhook] Signature verification failed:', err.message)
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 2. Idempotency — ignore already-processed events
  const { data: existingEvent } = await supabase
    .from('stripe_webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle()

  if (existingEvent) {
    console.log(`[webhook] Event ${event.id} already processed, skipping`)
    return NextResponse.json({ received: true, skipped: true })
  }

  // 3. Record event first (idempotency guard)
  await supabase.from('stripe_webhook_events').insert({
    id: event.id,
    type: event.type,
    payload: event.data as any,
  })

  // 4. Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    if (session.payment_status !== 'paid') {
      console.log(`[webhook] Session ${session.id} not paid yet, skipping`)
      return NextResponse.json({ received: true })
    }

    const userId = session.metadata?.userId ?? session.client_reference_id
    const planId = session.metadata?.planId

    if (!userId || !planId) {
      console.error('[webhook] Missing userId or planId in session metadata', session.metadata)
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const sessionsToCredit = SESSION_CREDITS[planId]
    if (!sessionsToCredit) {
      console.error('[webhook] Unknown planId:', planId)
      return NextResponse.json({ error: `Unknown planId: ${planId}` }, { status: 400 })
    }

    // 5. Upsert purchase record
    const amountTotal = session.amount_total ?? 0
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

    const { error: upsertErr } = await supabase.from('purchases').upsert({
      user_id:            userId,
      plan_id:            planId,
      sessions_granted:   sessionsToCredit,
      amount_paise:       amountTotal,
      razorpay_order_id:  session.id,        // legacy column
      stripe_session_id:  session.id,
      razorpay_payment_id: paymentIntentId,  // legacy column
      status:             'paid',
      paid_at:            new Date().toISOString(),
    }, {
      onConflict: 'stripe_session_id',
      ignoreDuplicates: true,
    })

    if (upsertErr) {
      console.error('[webhook] Failed to upsert purchase:', upsertErr)
      // Don't block — still try to credit below
    }

    // 6. Atomically credit sessions via RPC (profiles table — legacy)
    const { error: creditErr } = await supabase.rpc('credit_sessions', {
      p_user_id:   userId,
      p_sessions:  sessionsToCredit,
    })

    if (creditErr) {
      console.error('[webhook] credit_sessions RPC failed:', creditErr)
      // Fallback: direct update
      await supabase
        .from('profiles')
        .update({ sessions_balance: supabase.rpc('sessions_balance') } as any)
        .eq('id', userId)
    }

    // 7. Update subscriptions table (new Realtime-enabled table)
    const { error: activateErr } = await supabase.rpc('activate_premium', {
      uid:               userId,
      p_sessions:        sessionsToCredit,
      p_stripe_session:  session.id,
    })
    if (activateErr) {
      console.error('[webhook] activate_premium RPC failed:', activateErr)
    }

    console.log(`[webhook] ✅ Credited ${sessionsToCredit} sessions to user ${userId} (plan: ${planId})`)
  }

  // ── Handle refunds ────────────────────────────────────────────────────────
  if (event.type === 'charge.refunded' || event.type === 'payment_intent.payment_failed') {
    const chargeOrIntent = event.data.object as any

    // Try to extract userId from associated payment intent / metadata
    let userId: string | null = null

    if (event.type === 'charge.refunded') {
      // Look up the original purchase by payment_intent id
      const paymentIntentId = chargeOrIntent.payment_intent ?? chargeOrIntent.id
      if (paymentIntentId) {
        const { data: purchase } = await supabase
          .from('purchases')
          .select('user_id')
          .eq('razorpay_payment_id', paymentIntentId)
          .maybeSingle()
        userId = purchase?.user_id ?? null
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      userId = chargeOrIntent.metadata?.userId ?? null
    }

    if (userId) {
      // Mark purchase as refunded
      if (event.type === 'charge.refunded') {
        await supabase
          .from('purchases')
          .update({ status: 'refunded' })
          .eq('razorpay_payment_id', chargeOrIntent.payment_intent ?? chargeOrIntent.id)
      }

      // Revert subscriptions table via RPC (triggers Realtime push to desktop)
      const { error: revertErr } = await supabase.rpc('revert_premium', { uid: userId })
      if (revertErr) {
        console.error('[webhook] revert_premium RPC failed:', revertErr)
      } else {
        console.log(`[webhook] ✅ Reverted access for user ${userId} on ${event.type}`)
      }
    } else {
      console.warn(`[webhook] Could not identify user for ${event.type} event ${event.id}`)
    }
  }

  return NextResponse.json({ received: true })
}
