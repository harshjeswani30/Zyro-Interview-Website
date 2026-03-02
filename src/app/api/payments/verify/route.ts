// POST /api/payments/verify
// Called from frontend after Razorpay payment success
// Verifies signature, marks purchase as paid, credits sessions to user
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = await request.json()

    // 1. Verify Razorpay signature
    const keySecret = process.env.RAZORPAY_KEY_SECRET!
    const expectedSig = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    if (expectedSig !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 2. Find matching pending purchase
    const { data: purchase, error: findErr } = await supabase
      .from('purchases')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (findErr || !purchase) {
      return NextResponse.json({ error: 'Purchase record not found' }, { status: 404 })
    }

    // 3. Mark purchase as paid
    await supabase
      .from('purchases')
      .update({
        status:              'paid',
        razorpay_payment_id: razorpay_payment_id,
        paid_at:             new Date().toISOString(),
      })
      .eq('id', purchase.id)

    // 4. Credit sessions to user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('sessions_balance, trial_start_at')
      .eq('id', userId)
      .maybeSingle()

    const currentBalance = profile?.sessions_balance ?? 0

    // Permanently block the free trial for anyone who buys sessions.
    // Set trial_start_at to epoch so the trial always reads as expired.
    const trialUpdate = profile?.trial_start_at
      ? {} // already stamped — don't overwrite
      : { trial_start_at: new Date(0).toISOString() }

    await supabase
      .from('profiles')
      .update({ sessions_balance: currentBalance + purchase.sessions_granted, ...trialUpdate })
      .eq('id', userId)

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
