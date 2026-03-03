// POST /api/payments/create-order
// Creates a Stripe Checkout Session (card + UPI) for a given plan
// Coupons are handled natively by Stripe (allow_promotion_codes: true)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Stripe from 'stripe'

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

    const supabase = createAdminClient()
    const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY!)

    const origin = request.headers.get('origin') || 'https://zyro-interview-website.vercel.app'

    // Create a Stripe Checkout Session — payment methods (card, UPI, etc.)
    // are controlled via Stripe Dashboard → Settings → Payment methods
    const sessionParams = {
      automatic_payment_methods: { enabled: true },
      mode:                  'payment',
      customer_email:        userEmail,
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency:    'inr',
            unit_amount: plan.amountPaise,
            product_data: {
              name:        `Zyro AI — ${plan.label}`,
              description: `${plan.sessions} interview session${plan.sessions > 1 ? 's' : ''} · Sessions never expire`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/pricing?canceled=true`,
      metadata: {
        userId,
        planId,
        sessions: String(plan.sessions),
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await stripe.checkout.sessions.create(sessionParams as any)

    // Insert pending purchase record in DB
    await supabase.from('purchases').insert({
      user_id:           userId,
      plan_id:           planId,
      sessions_granted:  plan.sessions,
      amount_paise:      plan.amountPaise,
      razorpay_order_id: session.id,  // stores stripe session id
      status:            'pending',
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[create-order] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
