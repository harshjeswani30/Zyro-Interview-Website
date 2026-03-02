// GET /api/users/profile?userId=xxx  (admin fetch — called by desktop app on startup)
// Returns latest profile including sessions_balance, is_premium
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import * as jose from 'jose'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    // Verify desktop session token (re-use same JWT secret as desktop-verify)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const secret = new TextEncoder().encode(serviceRoleKey)
    let payload: any
    try {
      const { payload: p } = await jose.jwtVerify(token, secret)
      payload = p
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const userId = payload.sub
    if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('full_name, is_premium, trial_start_at, sessions_balance')
      .eq('id', userId)
      .maybeSingle()

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json({ profile })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
