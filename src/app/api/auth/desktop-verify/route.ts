import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import crypto from 'crypto'
import * as jose from 'jose'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    // 1. Verify and decode JWT using jose
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const secret = new TextEncoder().encode(serviceRoleKey)
    
    let payload: any
    try {
      const { payload: verifiedPayload } = await jose.jwtVerify(token, secret)
      payload = verifiedPayload
    } catch (err: any) {
      console.error('JWT verification failed:', err.message)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // 2. Verify token type
    if (payload.type !== 'desktop_auth' || !payload.sub || !payload.jti) {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 })
    }

    // 3. Look up token hash in DB — must be unused and not expired
    // We hash the token itself (the full JWT string) to match what we stored
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    const supabase = createAdminClient()
    const { data: tokenRecord, error: lookupError } = await supabase
      .from('desktop_auth_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (lookupError || !tokenRecord) {
      console.error('Token not found in DB or already used. Hash:', tokenHash)
      return NextResponse.json({ error: 'Token invalid or already used' }, { status: 401 })
    }

    // 4. Mark as used immediately (one-time token)
    await supabase
      .from('desktop_auth_tokens')
      .update({ used: true })
      .eq('id', tokenRecord.id)

    // 5. Verify user still exists
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(payload.sub)
    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // 6. Fetch profile data (trial/premium status) — uses admin client so RLS is bypassed
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, is_premium, trial_start_at')
      .eq('id', user.id)
      .maybeSingle()

    // 7. Return verified user + profile info for desktop app to store
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile: profile ?? null,
    })

  } catch (err: any) {
    console.error('[desktop-verify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
