import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import crypto from 'crypto'
import * as jose from 'jose'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in search params, use it as the redirection URL
  let next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.session) {
      // If 'next' is a deep link, generate a proper one-time desktop token
      // (do NOT use the raw Supabase access_token — it won't pass desktop-verify)
      if (next.startsWith('zyro-ai://')) {
        try {
          const desktopToken = await generateDesktopToken(data.session.user.id)
          // 'next' may already contain query params (e.g. ?state=…) — preserve them
          const separator = next.includes('?') ? '&' : '?'
          return NextResponse.redirect(`${next}${separator}token=${desktopToken}`)
        } catch (err) {
          console.error('[auth/callback] Failed to generate desktop token:', err)
          return NextResponse.redirect(`${origin}/login?error=desktop_token_failed`)
        }
      }

      const forwardedHost = request.headers.get('x-forwarded-host') // auth usage on vercel
      const isLocalEnv = process.env.NODE_ENV === 'development'
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}

async function generateDesktopToken(userId: string): Promise<string> {
  const supabase = createAdminClient()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const secret = new TextEncoder().encode(serviceRoleKey)

  const jwt = await new jose.SignJWT({ type: 'desktop_auth', sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret)

  const tokenHash = crypto.createHash('sha256').update(jwt).digest('hex')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { error } = await supabase.from('desktop_auth_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })

  if (error) throw new Error('Database error during token generation')
  return jwt
}
