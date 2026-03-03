// POST /api/payments/validate-coupon
// Validates a coupon code. amountPaise is optional — if provided, computes final price.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { code, amountPaise } = await request.json()

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, error: 'Coupon code is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .eq('is_active', true)
      .single()

    if (error || !coupon) {
      return NextResponse.json({ valid: false, error: 'Invalid or expired coupon code' })
    }

    // Check expiry
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: 'This coupon has expired' })
    }

    // Check usage limit
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      return NextResponse.json({ valid: false, error: 'This coupon has reached its usage limit' })
    }

    // Calculate discount if amount was provided
    let discountPaise: number | null = null
    let finalAmountPaise: number | null = null

    if (typeof amountPaise === 'number' && amountPaise > 0) {
      if (coupon.type === 'percent') {
        discountPaise = Math.round((amountPaise * coupon.discount_value) / 100)
      } else {
        discountPaise = Math.round(coupon.discount_value * 100)
      }
      discountPaise = Math.min(discountPaise, amountPaise)
      finalAmountPaise = amountPaise - discountPaise
    }

    return NextResponse.json({
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,           // 'percent' | 'fixed'
      discountValue: coupon.discount_value,
      description: coupon.description,
      discountPaise,
      finalAmountPaise,
    })
  } catch (err: any) {
    console.error('[validate-coupon] Error:', err)
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 })
  }
}
