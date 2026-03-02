'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
    Zap,
    User,
    Crown,
    Clock,
    Settings,
    Download,
    LogOut,
    ChevronRight,
    ShieldCheck,
    AlertTriangle,
    Loader2,
    ArrowRight
} from 'lucide-react';
import Link from 'next/link';

interface Profile {
    id: string;
    email: string;
    full_name: string | null;
    is_premium: boolean;
    trial_start_at: string | null;
}

export default function DashboardPage() {
    const router = useRouter();
    const supabase = createClient();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push('/login');
                return;
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) {
                console.error('Error fetching profile:', error);
            } else {
                setProfile(data);
                calculateTrialTime(data?.trial_start_at);
            }
            setLoading(false);
        };

        fetchProfile();
    }, [router, supabase]);

    const calculateTrialTime = (startAt: string | null) => {
        if (!startAt) {
            setTimeLeft('10:00');
            return;
        }
        const startTime = new Date(startAt).getTime();
        const now = new Date().getTime();
        const totalTrial = 10 * 60 * 1000; // 10 minutes
        const elapsed = now - startTime;
        const remaining = totalTrial - elapsed;

        if (remaining <= 0) {
            setTimeLeft('Trial Expired');
        } else {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            setTimeLeft(`${minutes}:${seconds < 10 ? '0' : ''}${seconds} left`);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.refresh(); // Refresh to trigger middleware redirect
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen mesh-gradient flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <p className="text-white/40 font-medium animate-pulse">Loading your dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen mesh-gradient font-sans text-white">
            {/* Sidebar Navigation */}
            <aside className="fixed left-0 top-0 h-full w-64 border-r border-white/5 bg-black/50 backdrop-blur-3xl p-6 hidden lg:block z-50">
                <Link href="/" className="flex items-center gap-2 mb-12 group">
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
                        <Zap className="text-white w-6 h-6" />
                    </div>
                    <span className="text-2xl font-bold tracking-tight">Zyro AI</span>
                </Link>

                <nav className="space-y-2">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 bg-primary/10 text-primary rounded-2xl font-bold border border-primary/20 transition-all">
                        <User className="w-5 h-5" /> Overview
                    </Link>
                    <button className="w-full flex items-center gap-3 px-4 py-3 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl font-semibold transition-all text-left">
                        <Download className="w-5 h-5" /> Recordings
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-3 text-white/40 hover:text-white hover:bg-white/5 rounded-2xl font-semibold transition-all text-left">
                        <Settings className="w-5 h-5" /> Settings
                    </button>
                </nav>

                <div className="absolute bottom-10 left-6 right-6">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-red-400/60 hover:text-red-400 hover:bg-red-500/5 rounded-2xl font-bold transition-all border border-transparent hover:border-red-500/10"
                    >
                        <LogOut className="w-5 h-5" /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="lg:ml-64 p-6 lg:p-12 pt-24 lg:pt-12 max-w-7xl mx-auto">
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16">
                    <div className="space-y-2">
                        <h1 className="text-4xl md:text-5xl font-black tracking-tight">
                            Hey, <span className="text-primary">{profile?.email?.split('@')[0] || 'Explorer'}</span>!
                        </h1>
                        <p className="text-white/40 text-lg font-medium">Your interview dominance dashboard is ready.</p>
                    </div>

                    <button
                        onClick={() => window.location.href = 'zyro-ai://open'}
                        className="glow-btn bg-white text-black px-8 py-4 rounded-2xl font-black text-lg flex items-center gap-3 shadow-2xl hover:scale-105 active:scale-95 transition-all"
                    >
                        Launch Desktop <ChevronRight className="w-5 h-5" />
                    </button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
                    {/* Status Card */}
                    <div className="glass-card p-8 flex flex-col justify-between group h-64 border-white/5 hover:border-primary/20 transition-colors">
                        <div className="flex items-center justify-between">
                            <div className="p-4 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform shadow-inner">
                                <Crown className="w-8 h-8 text-primary" />
                            </div>
                            <span className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${profile?.is_premium ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-orange-500/10 text-orange-500 border-orange-500/20'}`}>
                                {profile?.is_premium ? 'Premium' : 'Free Trial'}
                            </span>
                        </div>
                        <div className="space-y-1">
                            <p className="text-white/20 text-xs font-black uppercase tracking-widest">Active Plan</p>
                            <h3 className="text-3xl font-black">{profile?.is_premium ? 'Elite Infinity' : 'Trial Spark'}</h3>
                        </div>
                    </div>

                    {/* Trial Timer Card */}
                    <div className="glass-card p-8 flex flex-col justify-between group h-64 border-white/5 hover:border-secondary/20 transition-colors">
                        <div className="flex items-center justify-between">
                            <div className="p-4 bg-secondary/10 rounded-2xl group-hover:scale-110 transition-transform shadow-inner">
                                <Clock className="w-8 h-8 text-secondary" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-white/20 text-xs font-black uppercase tracking-widest">Time Remaining</p>
                            <h3 className={`text-4xl font-black font-mono ${timeLeft === 'Trial Expired' ? 'text-red-500' : 'text-white'}`}>
                                {timeLeft}
                            </h3>
                        </div>
                    </div>

                    {/* Security Card */}
                    <div className="glass-card p-8 flex flex-col justify-between group h-64 border-white/5 hover:border-green-500/20 transition-colors">
                        <div className="flex items-center justify-between">
                            <div className="p-4 bg-green-500/10 rounded-2xl group-hover:scale-110 transition-transform shadow-inner">
                                <ShieldCheck className="w-8 h-8 text-green-500" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-white/20 text-xs font-black uppercase tracking-widest">System Status</p>
                            <h3 className="text-3xl font-black text-green-400">Optimized</h3>
                        </div>
                    </div>
                </div>

                {/* Upgrade CTA */}
                {!profile?.is_premium && (
                    <section className="relative overflow-hidden group rounded-[2.5rem] border border-white/5">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent"></div>
                        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/20 rounded-full blur-[100px] group-hover:bg-primary/30 transition-all duration-700"></div>

                        <div className="relative z-10 p-10 md:p-16 flex flex-col lg:flex-row items-center justify-between gap-12">
                            <div className="max-w-2xl text-center lg:text-left space-y-6">
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary rounded-full font-black text-xs uppercase tracking-widest border border-primary/20">
                                    <Crown className="w-4 h-4" /> Exclusive Offer
                                </div>
                                <h2 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
                                    Break Free From The <br className="hidden md:block" />
                                    <span className="text-primary italic">10-Minute Limit.</span>
                                </h2>
                                <p className="text-white/50 text-xl font-medium leading-relaxed">
                                    Unlock lifetime unlimited access, every AI persona, and priority
                                    transcription. One payment. Forever theirs.
                                </p>
                            </div>

                            <Link
                                href="/pricing"
                                className="glow-btn bg-primary text-white px-12 py-6 rounded-[2rem] font-black text-2xl shadow-2xl hover:scale-110 active:scale-95 transition-all whitespace-nowrap"
                            >
                                GO PREMIUM <ArrowRight className="inline-block ml-2 w-6 h-6" />
                            </Link>
                        </div>
                    </section>
                )}

                {timeLeft === 'Trial Expired' && !profile?.is_premium && (
                    <div className="mt-8 p-6 bg-red-500/10 border border-red-500/20 rounded-[2rem] flex items-center gap-6 text-red-500 shadow-2xl animate-pulse">
                        <AlertTriangle className="w-10 h-10 flex-shrink-0" />
                        <div>
                            <p className="text-xl font-black uppercase tracking-wider">Access Revoked</p>
                            <p className="font-semibold text-red-400/80">Your trial has expired. Upgrade to resume interview dominance.</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
