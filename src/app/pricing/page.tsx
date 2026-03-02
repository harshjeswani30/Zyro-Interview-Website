'use client'
import { useState, useEffect } from 'react'
import { Check, Shield, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'

interface Plan {
  id: string
  name: string
  priceINR: number
  sessions: number | null
  perSession: string | null
  saving: string | null
  description: string
  features: string[]
  cta: string
  popular: boolean
  isPaid: boolean
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free Trial',
    priceINR: 0,
    sessions: null,
    perSession: null,
    saving: null,
    description: 'Try Zyro AI with no commitment',
    features: [
      '10-minute free session',
      'Full AI answer generation',
      'Screen scan (Alt+S)',
      'All interview modes',
    ],
    cta: 'Start Free Trial',
    popular: false,
    isPaid: false,
  },
  {
    id: 'session_1',
    name: '1 Session',
    priceINR: 300,
    sessions: 1,
    perSession: '₹300 / session',
    saving: null,
    description: 'One full interview, no expiry',
    features: [
      '1 unlimited-length session',
      'Full AI answer generation',
      'Screen scan + behavioral AI',
      'Session never expires',
    ],
    cta: 'Buy Now',
    popular: false,
    isPaid: true,
  },
  {
    id: 'session_5',
    name: '5 Sessions',
    priceINR: 1200,
    sessions: 5,
    perSession: '₹240 / session',
    saving: 'Save 20%',
    description: 'Best for active job seekers',
    features: [
      '5 unlimited-length sessions',
      'Full AI answer generation',
      'Screen scan + behavioral AI',
      'Sessions never expire',
    ],
    cta: 'Buy Pack',
    popular: true,
    isPaid: true,
  },
  {
    id: 'session_10',
    name: '10 Sessions',
    priceINR: 2000,
    sessions: 10,
    perSession: '₹200 / session',
    saving: 'Save 33%',
    description: 'Maximum value for power users',
    features: [
      '10 unlimited-length sessions',
      'Full AI answer generation',
      'Screen scan + behavioral AI',
      'Sessions never expire',
    ],
    cta: 'Buy Pack',
    popular: false,
    isPaid: true,
  },
]

declare global {
  interface Window {
    Razorpay: any
  }
}

export default function PricingPage() {
  const [user, setUser] = useState<any>(null)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
  }, [])

  const loadRazorpay = () =>
    new Promise<void>((resolve, reject) => {
      if (window.Razorpay) {
        resolve()
        return
      }
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Razorpay SDK'))
      document.head.appendChild(script)
    })

  const handleBuy = async (plan: Plan) => {
    if (!plan.isPaid) {
      window.location.href = '/login'
      return
    }
    if (!user) {
      window.location.href = '/login?next=/pricing'
      return
    }

    setLoadingPlan(plan.id)
    setMessage(null)

    try {
      // 1. Create Razorpay order
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, userId: user.id, userEmail: user.email }),
      })
      const orderData = await orderRes.json()
      if (!orderRes.ok) {
        setMessage({ type: 'error', text: orderData.error || 'Could not create order. Please try again.' })
        setLoadingPlan(null)
        return
      }

      // 2. Load Razorpay SDK
      await loadRazorpay()

      // 3. Open checkout modal
      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: 'INR',
        name: 'Zyro AI',
        description: orderData.planLabel,
        order_id: orderData.orderId,
        prefill: { email: user.email },
        theme: { color: '#7c3aed' },
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          // 4. Verify payment server-side
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...response, userId: user.id }),
          })
          const verifyData = await verifyRes.json()

          if (verifyData.success) {
            setMessage({
              type: 'success',
              text: `✅ Payment successful! ${verifyData.sessionsAdded} session(s) added. New balance: ${verifyData.newBalance}. Re-login in the desktop app to refresh your balance.`,
            })
          } else {
            setMessage({ type: 'error', text: `Payment verification failed: ${verifyData.error}` })
          }
          setLoadingPlan(null)
        },
        modal: {
          ondismiss: () => setLoadingPlan(null),
        },
      })
      rzp.open()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Something went wrong.' })
      setLoadingPlan(null)
    }
  }

  return (
    <div className="min-h-screen mesh-gradient py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-20 animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6 tracking-tight">
            Simple, <span className="text-primary">Transparent</span> Pricing
          </h1>
          <p className="text-white/40 text-xl font-medium max-w-2xl mx-auto">
            Pay per interview — no subscription, no lock-in. Sessions never expire.
          </p>
        </div>

        {/* Message banner */}
        {message && (
          <div
            className={`max-w-3xl mx-auto mb-10 p-4 rounded-2xl text-sm font-medium text-center ${
              message.type === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`glass-card p-8 flex flex-col relative overflow-hidden group transition-all hover:scale-[1.02] ${
                plan.popular ? 'border-primary/50 shadow-2xl shadow-primary/10' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-black uppercase px-4 py-1 rounded-bl-xl tracking-widest">
                  Most Popular
                </div>
              )}
              {plan.saving && (
                <div className="absolute top-0 left-0 bg-green-500 text-white text-[10px] font-black uppercase px-4 py-1 rounded-br-xl tracking-widest">
                  {plan.saving}
                </div>
              )}

              <div className="mb-6 mt-2">
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-white/40 text-sm mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black">
                    {plan.priceINR === 0 ? '₹0' : `₹${plan.priceINR.toLocaleString('en-IN')}`}
                  </span>
                </div>
                {plan.perSession && (
                  <p className="text-white/40 text-xs mt-1">{plan.perSession}</p>
                )}
              </div>

              <div className="space-y-3 mb-8 flex-grow">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-primary/20 rounded flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5 text-primary" />
                    </div>
                    <span className="text-white/70 text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleBuy(plan)}
                disabled={loadingPlan === plan.id}
                className={`py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${
                  plan.popular
                    ? 'bg-primary text-white glow-btn'
                    : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                }`}
              >
                {loadingPlan === plan.id ? (
                  'Processing…'
                ) : (
                  <>
                    {plan.cta} <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Auth nudge */}
        {!user && (
          <p className="text-center text-white/40 text-sm mt-10">
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>{' '}
            to purchase a session pack.
          </p>
        )}

        {/* Guarantee */}
        <div className="mt-20 text-center glass-card p-8 bg-black/40 border-white/5 max-w-xl mx-auto animate-fade-in-up">
          <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-green-500" />
          </div>
          <h4 className="font-bold text-lg mb-2 text-green-500">No-Risk Purchase</h4>
          <p className="text-white/40 text-sm font-medium">
            Sessions never expire. If you face technical issues, contact us at{' '}
            <a href="mailto:support@zyro-ai.in" className="text-primary hover:underline">
              support@zyro-ai.in
            </a>{' '}
            for a full refund.
          </p>
        </div>

        {/* Nav back */}
        <div className="text-center mt-12">
          <Link href="/" className="text-white/40 hover:text-white text-sm transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

