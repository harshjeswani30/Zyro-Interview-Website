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
    const { planId, userId, userEmail, couponCode } = await request.json()

    const plan = PLANS[planId]
    if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    if (!userId)  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const supabase = createAdminClient()

    // Validate coupon if provided
    let discountPaise = 0
    let couponId: string | null = null
    if (couponCode) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.trim().toUpperCase())
        .eq('is_active', true)
        .single()

      if (coupon) {
        const expired = coupon.expires_at && new Date(coupon.expires_at) < new Date()
        const maxedOut = coupon.max_uses !== null && coupon.used_count >= coupon.max_uses
        if (!expired && !maxedOut) {
          if (coupon.type === 'percent') {
            discountPaise = Math.round((plan.amountPaise * coupon.discount_value) / 100)
          } else {
            discountPaise = Math.round(coupon.discount_value * 100)
          }
          discountPaise = Math.min(discountPaise, plan.amountPaise)
          couponId = coupon.id
        }
      }
    }

    const finalAmountPaise = plan.amountPaise - discountPaise

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
        amount:   finalAmountPaise,
        currency: 'INR',
        receipt:  `${userId.slice(0, 8)}_${planId}_${Date.now()}`,
        notes:    { userId, planId, sessions: String(plan.sessions), couponId: couponId ?? '' },
      }),
    })

    if (!orderRes.ok) {
      const errBody = await orderRes.text()
      console.error('[Razorpay] Order creation failed:', errBody)
      return NextResponse.json({ error: 'Payment gateway error' }, { status: 502 })
    }

    const order = await orderRes.json()

    // Insert pending purchase record in DB
    await supabase.from('purchases').insert({
      user_id:           userId,
      plan_id:           planId,
      sessions_granted:  plan.sessions,
      amount_paise:      finalAmountPaise,
      razorpay_order_id: order.id,
      status:            'pending',
      coupon_id:         couponId,
      discount_paise:    discountPaise,
    })

    return NextResponse.json({
      orderId:        order.id,
      amount:         finalAmountPaise,
      originalAmount: plan.amountPaise,
      discountPaise,
      currency:       'INR',
      keyId:          razorpayKeyId,
      planLabel:      plan.label,
      userEmail,
    })
  } catch (err: any) {
    console.error('[create-order] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
