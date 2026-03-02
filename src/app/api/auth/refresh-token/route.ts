// POST /api/auth/refresh-token
// Called silently by the desktop app on every launch.
// Accepts the existing (possibly expired) sessionToken, verifies the user still exists
// in the DB, and returns a fresh 10-year token + latest profile.
// Security: we intentionally decode without strict expiry so old tokens can be refreshed
// without forcing the user to open a browser. The user was previously authenticated;
// this just rotates the token on a known device.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import * as jose from 'jose'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const secret = new TextEncoder().encode(serviceRoleKey)

    // Decode without expiry enforcement — we just need the user id
    // We still verify the signature to prevent token forgery
    let payload: jose.JWTPayload
    try {
      const result = await jose.jwtVerify(token, secret, {
        clockTolerance: '9999d', // accept tokens up to ~27 years past expiry
      })
      payload = result.payload
    } catch {
      return NextResponse.json({ error: 'Invalid token signature' }, { status: 401 })
    }

    const userId = payload.sub
    if (!userId || (payload['type'] !== 'desktop_session' && payload['type'] !== 'desktop_auth')) {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 })
    }

    // Verify user still exists in Supabase auth
    const supabase = createAdminClient()
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Fetch latest profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, is_premium, trial_start_at, sessions_balance')
      .eq('id', userId)
      .maybeSingle()

    // Mint a fresh 10-year token
    const newToken = await new jose.SignJWT({
      type: 'desktop_session',
      sub: userId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('3650d')
      .sign(secret)

    return NextResponse.json({
      success: true,
      sessionToken: newToken,
      profile: profile ?? null,
      user: { id: user.id, email: user.email },
    })

  } catch (err: any) {
    console.error('[refresh-token] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
