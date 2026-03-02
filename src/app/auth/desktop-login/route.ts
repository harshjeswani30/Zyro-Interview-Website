import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import crypto from 'crypto'
import * as jose from 'jose'

// Strict allowlist — only these redirect URIs are allowed
const ALLOWED_REDIRECT_URIS = ['zyro-ai://auth-callback']

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const redirect_uri = searchParams.get('redirect_uri')
  const state = searchParams.get('state') // CSRF token from desktop app

  // 1. Validate redirect_uri strictly
  if (!redirect_uri || !ALLOWED_REDIRECT_URIS.includes(redirect_uri)) {
    return NextResponse.json({ error: 'Invalid redirect_uri' }, { status: 400 })
  }

  // 2. Check if user already has an active session in browser
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
      // Already logged in → generate one-time token and redirect immediately
      const token = await generateDesktopToken(session.user.id)
      const callbackUrl = `${redirect_uri}?token=${token}&state=${encodeURIComponent(state || '')}`
      return NextResponse.redirect(callbackUrl)
    }
  } catch (err) {
    console.error('Session check failed:', err)
  }

  // 3. Not logged in → redirect to login page with context preserved
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3008'
  const loginUrl = new URL('/login', siteUrl)
  loginUrl.searchParams.set('redirect_uri', redirect_uri)
  loginUrl.searchParams.set('state', state || '')
  return NextResponse.redirect(loginUrl.toString())
}

async function generateDesktopToken(userId: string): Promise<string> {
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

  // 2. Store SHA-256 hash of the JWT in DB for one-time verification
  const tokenHash = crypto.createHash('sha256').update(jwt).digest('hex')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { error } = await supabase.from('desktop_auth_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })

  if (error) {
    console.error('Failed to store desktop auth token:', error)
    throw new Error('Database error during token generation')
  }

  return jwt
}
