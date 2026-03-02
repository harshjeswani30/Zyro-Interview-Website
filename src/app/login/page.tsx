'use client';

import { useState, useTransition, Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Zap, Mail, Lock, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { checkEmail, signIn, signUp } from './actions';
import { createClient } from '@/utils/supabase/client';

function LoginContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [step, setStep] = useState<'email' | 'password' | 'success' | 'checking'>('email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [exists, setExists] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const redirect_uri = searchParams.get('redirect_uri');
    const state = searchParams.get('state');
    const isDesktopRedirect = redirect_uri?.startsWith('zyro-ai://') ?? false;

    // For desktop redirects → skip session check, show form immediately.
    // For regular web visits → silently check session and redirect to dashboard if logged in.
    useEffect(() => {
        const checkSession = async () => {
            const timeout = setTimeout(() => setStep('email'), 2000);
            try {
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                clearTimeout(timeout);

                if (session?.user) {
                    if (isDesktopRedirect) {
                        // Already logged in + desktop flow → generate secure token and redirect back
                        const res = await fetch('/api/auth/generate-desktop-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: session.user.id }),
                        });
                        const data = await res.json();
                        if (data.token) {
                            window.location.href = `${redirect_uri}?token=${data.token}&state=${encodeURIComponent(state || '')}`;
                            return;
                        }
                    }
                    router.push('/dashboard');
                } else {
                    setStep('email');
                }
            } catch {
                clearTimeout(timeout);
                setStep('email');
            }
        };

        if (isDesktopRedirect) {
            // Check session but don't hang if it's slow
            checkSession();
        } else {
            checkSession();
        }
    }, [isDesktopRedirect, redirect_uri, state, router]);

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        startTransition(async () => {
            const result = await checkEmail(email);
            if (result.error) {
                setError(result.error);
                return;
            }
            setExists(result.exists);
            setStep('password');
        });
    };

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);

        startTransition(async () => {
            if (exists) {
                const result = await signIn(formData);
                if (result.error) {
                    setError(result.error);
                } else if (result.session) {
                    if (isDesktopRedirect) {
                        // Success + desktop flow → generate secure token and redirect back
                        const res = await fetch('/api/auth/generate-desktop-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: result.session.user.id }),
                        });
                        const data = await res.json();
                        if (data.token) {
                            window.location.href = `${redirect_uri}?token=${data.token}&state=${encodeURIComponent(state || '')}`;
                        } else {
                            setError('Failed to securely link to desktop app');
                        }
                    } else {
                        router.push('/dashboard');
                    }
                }
            } else {
                // For desktop flow, embed the state into the redirectTo so CSRF flows
                // through Supabase's email confirmation link → /auth/callback → deep link
                const signUpRedirect = isDesktopRedirect && redirect_uri
                    ? (state ? `${redirect_uri}?state=${encodeURIComponent(state)}` : redirect_uri)
                    : redirect_uri || undefined;
                const result = await signUp(formData, signUpRedirect);
                if (result.error) {
                    setError(result.error);
                } else {
                    setStep('success');
                }
            }
        });
    };

    // Spinner only for initial web-visit session check (not for desktop)
    if (step === 'checking') {
        return (
            <div className="min-h-screen mesh-gradient flex items-center justify-center p-6">
                <div className="text-center">
                    <Loader2 className="text-primary w-10 h-10 animate-spin mx-auto mb-4" />
                    <p className="text-white/40 font-medium">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen mesh-gradient flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                {/* Brand */}
                <Link href="/" className="flex items-center justify-center gap-2 mb-12 group">
                    <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
                        <Zap className="text-white w-7 h-7" />
                    </div>
                    <span className="text-2xl font-bold tracking-tight text-white">Zyro AI</span>
                </Link>

                {/* Desktop redirect banner */}
                {isDesktopRedirect && (
                    <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Zap className="text-primary w-4 h-4" />
                        </div>
                        <p className="text-white/70 text-sm">
                            Sign in to authenticate your <span className="text-white font-semibold">Zyro AI desktop app</span>.
                        </p>
                    </div>
                )}

                {/* Login Card */}
                <div className="glass-card p-8 md:p-10 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>

                    {step === 'success' ? (
                        <div className="text-center animate-fade-in py-4">
                            <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6 scale-up">
                                <CheckCircle2 className="text-primary w-10 h-10" />
                            </div>
                            <h2 className="text-3xl font-bold mb-4 text-white">Check Your Email</h2>
                            <p className="text-white/40 mb-8 font-medium">
                                We've sent a verification link to <span className="text-white">{email}</span>.
                                Please confirm your email to activate your account.
                            </p>
                            <button
                                onClick={() => setStep('email')}
                                className="text-primary font-bold hover:underline text-sm"
                            >
                                Use a different email
                            </button>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-3xl font-bold mb-2 text-white">
                                {step === 'email' ? 'Get Started' : exists ? 'Welcome Back' : 'Create Account'}
                            </h1>
                            <p className="text-white/40 mb-8 font-medium">
                                {step === 'email'
                                    ? 'Enter your email to continue.'
                                    : exists
                                        ? 'Please enter your password to login.'
                                        : 'Create a password for your new account.'}
                            </p>

                            <form onSubmit={step === 'email' ? handleEmailSubmit : handleAuthSubmit} className="space-y-4">
                                {error && (
                                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm animate-shake">
                                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-white/30 ml-1">Email Address</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-primary transition-colors" />
                                        <input
                                            type="email"
                                            required
                                            disabled={step !== 'email' || isPending}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="name@example.com"
                                            className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all font-medium disabled:opacity-50"
                                        />
                                    </div>
                                </div>

                                {step === 'password' && (
                                    <div className="space-y-2 animate-fade-in-up">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-white/30 ml-1">
                                            {exists ? 'Password' : 'Create Password'}
                                        </label>
                                        <div className="relative group">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-primary transition-colors" />
                                            <input
                                                type="password"
                                                required
                                                autoFocus
                                                disabled={isPending}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all font-medium disabled:opacity-50"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="pt-4 flex flex-col gap-4">
                                    <button
                                        type="submit"
                                        disabled={isPending}
                                        className="glow-btn bg-primary text-white w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isPending ? (
                                            <>
                                                <Loader2 className="w-6 h-6 animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                {step === 'email' ? 'Continue' : exists ? 'Sign In' : 'Create Account'}
                                                <ArrowRight className="w-5 h-5" />
                                            </>
                                        )}
                                    </button>

                                    {step === 'password' && (
                                        <button
                                            type="button"
                                            onClick={() => setStep('email')}
                                            className="text-white/40 hover:text-white transition-colors text-sm font-medium"
                                        >
                                            ← Use a different email
                                        </button>
                                    )}
                                </div>
                            </form>
                        </>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-white/20 text-xs mt-12 px-6">
                    By continuing, you agree to Zyro AI's <Link href="/terms" className="hover:text-white">Terms of Service</Link> and <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>.
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary w-12 h-12" /></div>}>
            <LoginContent />
        </Suspense>
    );
}
