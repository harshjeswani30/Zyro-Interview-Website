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
      .select('full_name, is_premium, trial_start_at, sessions_balance')
      .eq('id', user.id)
      .maybeSingle()

    // 7. Generate a long-lived desktop session token (10-year, silently refreshed on every launch)
    //    Desktop stores this and uses it for start-session / profile-refresh calls.
    const sessionToken = await new jose.SignJWT({
      type: 'desktop_session',
      sub: user.id,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('3650d')
      .sign(secret)

    // 8. Create a Supabase session for the user so the desktop client can
    //    authenticate with Realtime and use Row-Level Security on the subscriptions table.
    //    The JS Admin SDK does not expose createSession, so we call the REST API directly.
    let supabaseAccessToken: string | null = null
    let supabaseRefreshToken: string | null = null
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const tokenRes = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${user.id}/auth`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
          },
        }
      )
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json()
        supabaseAccessToken = tokenData.access_token ?? null
        supabaseRefreshToken = tokenData.refresh_token ?? null
      } else {
        // Fallback: use generateLink (magiclink) and extract the token hash,
        // then exchange it via /auth/v1/verify for an access+refresh token pair.
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: user.email!,
        })
        if (!linkError && linkData?.properties?.hashed_token) {
          const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
            method: 'POST',
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'magiclink',
              token_hash: linkData.properties.hashed_token,
            }),
          })
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json()
            supabaseAccessToken = verifyData.access_token ?? null
            supabaseRefreshToken = verifyData.refresh_token ?? null
          } else {
            console.error('[desktop-verify] verify fallback failed:', await verifyRes.text())
          }
        } else {
          console.error('[desktop-verify] generateLink error:', linkError)
        }
      }
    } catch (sessionErr) {
      console.error('[desktop-verify] session creation exception:', sessionErr)
    }

    // 9. Fetch subscription status (new table — falls back to profile if not yet migrated)
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    // 10. Return verified user + profile + subscription + long-lived session token + Supabase session
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile: profile ?? null,
      subscription: subscription ?? null,
      sessionToken,
      supabaseAccessToken,
      supabaseRefreshToken,
    })

  } catch (err: any) {
    console.error('[desktop-verify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
