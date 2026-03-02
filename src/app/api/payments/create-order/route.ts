// POST /api/payments/create-order
// Creates a Razorpay order for a given plan, returns order id + amount to frontend
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

const PLANS: Record<string, { sessions: number; amountPaise: number; label: string }> = {
  session_1:  { sessions: 1,  amountPaise: 30000,  label: '1 Session'  },  // ₹300
  session_5:  { sessions: 5,  amountPaise: 120000, label: '5 Sessions' },  // ₹1200
  session_10: { sessions: 10, amountPaise: 200000, label: '10 Sessions' }, // ₹2000
}

export async function POST(request: NextRequest) {
  try {
    const { planId, userId, userEmail } = await request.json()

    const plan = PLANS[planId]
    if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    if (!userId)  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Create a Razorpay order via their REST API
    const razorpayKeyId     = process.env.RAZORPAY_KEY_ID!
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET!

    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64'),
      },
      body: JSON.stringify({
        amount:   plan.amountPaise,
        currency: 'INR',
        receipt:  `${userId.slice(0, 8)}_${planId}_${Date.now()}`,
        notes:    { userId, planId, sessions: String(plan.sessions) },
      }),
    })

    if (!orderRes.ok) {
      const errBody = await orderRes.text()
      console.error('[Razorpay] Order creation failed:', errBody)
      return NextResponse.json({ error: 'Payment gateway error' }, { status: 502 })
    }

    const order = await orderRes.json()

    // Insert pending purchase record in DB
    const supabase = createAdminClient()
    await supabase.from('purchases').insert({
      user_id:           userId,
      plan_id:           planId,
      sessions_granted:  plan.sessions,
      amount_paise:      plan.amountPaise,
      razorpay_order_id: order.id,
      status:            'pending',
    })

    return NextResponse.json({
      orderId:    order.id,
      amount:     plan.amountPaise,
      currency:   'INR',
      keyId:      razorpayKeyId,
      planLabel:  plan.label,
      userEmail,
    })
  } catch (err: any) {
    console.error('[create-order] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
