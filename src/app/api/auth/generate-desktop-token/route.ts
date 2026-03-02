import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import crypto from 'crypto'
import * as jose from 'jose'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const secret = new TextEncoder().encode(serviceRoleKey)

    // 1. Create a signed JWT using jose
    const jwt = await new jose.SignJWT({
      type: 'desktop_auth',
      sub: userId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret)

    // 2. Store SHA-256 hash of the full JWT in DB for one-time verification
    const tokenHash = crypto.createHash('sha256').update(jwt).digest('hex')
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const { error } = await supabase.from('desktop_auth_tokens').insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })

    if (error) {
      console.error('Failed to store desktop auth token:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ token: jwt })
  } catch (err: any) {
    console.error('generate-desktop-token error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
