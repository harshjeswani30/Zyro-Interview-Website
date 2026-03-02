'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
  Zap, Crown, Clock, Settings, LogOut,
  ChevronRight, ShieldCheck, AlertTriangle, Loader2,
  CreditCard, BarChart3, Sparkles, MonitorDown, Apple,
  ExternalLink, CheckCircle2, Laptop, ArrowRight
} from 'lucide-react';
import Link from 'next/link';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  is_premium: boolean;
  sessions_balance: number | null;
  trial_start_at: string | null;
  trial_seconds_used: number;
}

// ─── Typewriter hook ─────────────────────────────────────────────────────────
function useTypewriter(text: string, speed = 60, active = false) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) { setDisplayed(''); setDone(false); return; }
    setDisplayed('');
    setDone(false);
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); setDone(true); }
    }, speed);
    return () => clearInterval(iv);
  }, [active, text, speed]);

  return { displayed, done };
}

// ─── Live clock hook (ticks every second) ───────────────────────────────────
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  return now;
}

// ─── Trial info helper ────────────────────────────────────────────────────────
// secondsUsed  = trial_seconds_used from DB (cumulative interview seconds)
// localDeltaMs = ms since the DB value was last refreshed (for smooth ticking)
function getTrialInfo(secondsUsed: number, trialEverStarted: boolean, localDeltaMs: number) {
  if (!trialEverStarted) return { label: '10:00 remaining', expired: false, percent: 100, seconds: 600 };
  // Only mark expired when the DB confirms it (secondsUsed >= 600)
  if (secondsUsed >= 600) return { label: 'Expired', expired: true, percent: 0, seconds: 0 };
  // Add smooth local tick — capped at 12 s (slightly above the 10 s auto-save interval)
  // so the clock never falsely shows "Expired" between saves.
  const localSec = Math.min(Math.floor(localDeltaMs / 1000), 12);
  const remaining = Math.max(0, 600 - secondsUsed - localSec);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return {
    label: `${m}:${s.toString().padStart(2, '0')} left`,
    expired: false,
    percent: (remaining / 600) * 100,
    seconds: remaining,
  };
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  icon, iconBg, iconColor, badge, badgeBg, label, value, valueColor, sub
}: {
  icon: React.ReactNode; iconBg: string; iconColor: string;
  badge?: string; badgeBg?: string; label: string; value: string;
  valueColor?: string; sub?: React.ReactNode;
}) {
  return (
    <div className={`glass-card p-6 flex flex-col gap-4 transition-all hover:translate-y-[-2px]`}>
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>
          <span className={iconColor}>{icon}</span>
        </div>
        {badge && (
          <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${badgeBg}`}>
            {badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-1">{label}</p>
        <p className={`text-2xl font-black font-mono ${valueColor || 'text-white'}`}>{value}</p>
        {sub}
      </div>
    </div>
  );
}

// ─── Main dashboard content ───────────────────────────────────────────────────
function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState('overview');
  const now = useNow(); // ticks every second
  const userIdRef = useRef<string | null>(null);
  // Track when trial_seconds_used was last updated so we can smooth-tick between DB saves
  const profileUpdatedAtRef = useRef<number>(Date.now());
  useEffect(() => { profileUpdatedAtRef.current = Date.now(); }, [profile?.trial_seconds_used]);

  const downloadRef = useRef<HTMLDivElement>(null);
  const highlightDownload = searchParams.get('highlight') === 'download';

  const { displayed: typeText, done: typeDone } = useTypewriter(
    'Download for Free Trial →',
    65,
    highlightDownload
  );

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      userIdRef.current = user.id;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data ? { ...data, trial_seconds_used: data.trial_seconds_used ?? 0 } : data);
      setLoading(false);
    })();
  }, []);

  // ── Supabase Realtime: instant push when profile changes in DB ────────────
  useEffect(() => {
    if (!userIdRef.current) return;
    const channel = supabase
      .channel('profile-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userIdRef.current}` },
        (payload) => {
          setProfile(prev => prev ? { ...prev, ...(payload.new as Partial<Profile>) } : prev);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loading]); // re-subscribe once userId is known (loading flips to false)

  // ── Background poll every 30 s (fallback for realtime gaps) ──────────────
  useEffect(() => {
    const iv = setInterval(async () => {
      if (!userIdRef.current) return;
      const { data } = await supabase
        .from('profiles')
        .select('sessions_balance, is_premium, trial_start_at, trial_seconds_used')
        .eq('id', userIdRef.current)
        .single();
      if (data) setProfile(prev => prev ? { ...prev, ...data, trial_seconds_used: data.trial_seconds_used ?? 0 } : prev);
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (highlightDownload && !loading && downloadRef.current) {
      setTimeout(() => {
        downloadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setActiveNav('downloads');
      }, 500);
    }
  }, [highlightDownload, loading]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen mesh-gradient flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <div className="absolute inset-0 rounded-2xl border-2 border-primary/40 animate-ping" />
          </div>
          <p className="text-white/40 text-sm font-medium animate-pulse">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  const trial = getTrialInfo(
    profile?.trial_seconds_used ?? 0,
    !!profile?.trial_start_at,
    now - profileUpdatedAtRef.current
  );
  const balance = profile?.sessions_balance ?? 0;
  const isPremium = profile?.is_premium ?? false;
  const hasSessions = balance > 0;
  const name = profile?.full_name?.split(' ')[0] || profile?.email?.split('@')[0] || 'Explorer';

  const navItems = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'downloads', label: 'Downloads', icon: <MonitorDown className="w-4 h-4" /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen mesh-gradient font-sans text-white flex">

      {/* ═══ SIDEBAR ═══════════════════════════════════════════════════════════ */}
      <aside className="fixed left-0 top-0 h-full w-[17rem] border-r border-white/5 bg-black/65 backdrop-blur-3xl flex flex-col z-50 hidden lg:flex">

        {/* Logo */}
        <div className="px-6 py-7">
          <Link href="/" className="flex items-center gap-3 group mb-9">
            <div className="w-9 h-9 bg-primary rounded-[10px] flex items-center justify-center shadow-md shadow-primary/40 group-hover:scale-110 transition-transform">
              <Zap className="text-white w-4 h-4" />
            </div>
            <span className="text-lg font-black tracking-tight">Zyro AI</span>
          </Link>

          {/* Nav links */}
          <nav className="space-y-0.5">
            {navItems.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => {
                  setActiveNav(id);
                  if (id === 'downloads') {
                    downloadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-sm transition-all text-left ${
                  activeNav === id
                    ? 'bg-primary/12 text-primary border border-primary/20'
                    : 'text-white/40 hover:text-white hover:bg-white/4'
                }`}
              >
                {icon}
                {label}
                {id === 'downloads' && highlightDownload && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Download card ─────────────────────────────────────────────────── */}
        <div ref={downloadRef} className="px-4 pb-2">
          <div className={`relative rounded-2xl border p-5 overflow-hidden transition-all duration-700 ${
            highlightDownload
              ? 'border-primary/55 bg-primary/8 shadow-xl shadow-primary/15'
              : 'border-white/6 bg-white/2 hover:border-white/12'
          }`}>
            {/* Background glow */}
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-primary/25 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Laptop className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-primary">Desktop App</span>
              </div>

              {/* Typewriter label */}
              {highlightDownload ? (
                <p className="text-sm font-bold text-white mb-3 font-mono min-h-[22px]">
                  {typeText}
                  {!typeDone && (
                    <span className="inline-block w-[2px] h-[14px] bg-primary ml-0.5 align-middle animate-pulse" />
                  )}
                </p>
              ) : (
                <p className="text-white/50 text-xs mb-3 leading-relaxed">
                  Invisible AI overlay for your interviews.
                </p>
              )}

              {/* Windows */}
              <a
                href="/downloads/zyro-ai-setup-win.exe"
                download
                className="flex items-center gap-3 w-full px-3.5 py-2.5 bg-white/6 hover:bg-white/12 border border-white/8 hover:border-white/18 rounded-xl text-xs font-semibold transition-all group mb-2"
              >
                <div className="w-7 h-7 flex items-center justify-center bg-blue-500/15 rounded-lg flex-shrink-0">
                  <MonitorDown className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
                </div>
                <div className="flex-1">
                  <div className="text-white text-xs font-bold leading-tight">Windows</div>
                  <div className="text-white/25 text-[10px]">.exe · 64-bit</div>
                </div>
                <ExternalLink className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors" />
              </a>

              {/* macOS */}
              <a
                href="/downloads/zyro-ai-mac.dmg"
                download
                className="flex items-center gap-3 w-full px-3.5 py-2.5 bg-white/6 hover:bg-white/12 border border-white/8 hover:border-white/18 rounded-xl text-xs font-semibold transition-all group"
              >
                <div className="w-7 h-7 flex items-center justify-center bg-white/8 rounded-lg flex-shrink-0">
                  <Apple className="w-3.5 h-3.5 text-white/55 group-hover:scale-110 transition-transform" />
                </div>
                <div className="flex-1">
                  <div className="text-white text-xs font-bold leading-tight">macOS</div>
                  <div className="text-white/25 text-[10px]">.dmg · Apple Silicon + Intel</div>
                </div>
                <ExternalLink className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors" />
              </a>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 mt-4 border-t border-white/4" />

        {/* User & logout */}
        <div className="mt-auto p-4">
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center flex-shrink-0 text-white font-black text-sm">
              {name[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-bold truncate leading-tight">{name}</p>
              <p className="text-white/25 text-[10px] truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/5 rounded-xl font-semibold text-sm transition-all"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN ══════════════════════════════════════════════════════════════ */}
      <main className="lg:ml-[17rem] flex-1 p-6 lg:p-10 min-h-screen">

        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/25 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Workspace active
            </div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight">
              Hey, <span className="text-primary">{name}</span> 👋
            </h1>
            <p className="text-white/30 text-sm mt-1">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <button
            onClick={() => window.location.href = 'zyro-ai://open'}
            className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
          >
            <Zap className="w-4 h-4" /> Launch App
          </button>
        </header>

        {/* ── Stats ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
          <StatCard
            icon={<Crown className="w-5 h-5" />}
            iconBg="bg-primary/15" iconColor="text-primary"
            badge={isPremium ? 'Premium' : hasSessions ? 'Paid' : 'Free'}
            badgeBg={isPremium
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : hasSessions
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}
            label="Active Plan"
            value={isPremium ? 'Unlimited' : hasSessions ? 'Session Pack' : 'Free Trial'}
          />

          <StatCard
            icon={<Sparkles className="w-5 h-5" />}
            iconBg="bg-blue-500/15" iconColor="text-blue-400"
            label="Sessions Left"
            value={isPremium ? '∞' : String(balance)}
            sub={
              !isPremium ? (
                <Link href="/pricing" className="text-[10px] text-primary/70 hover:text-primary transition-colors font-bold mt-1 block">
                  Buy more →
                </Link>
              ) : undefined
            }
          />

          <StatCard
            icon={<Clock className="w-5 h-5" />}
            iconBg="bg-purple-500/15" iconColor="text-purple-400"
            label="Free Trial"
            value={trial.expired ? 'Used' : trial.label}
            valueColor={trial.expired ? 'text-red-400' : 'text-white'}
            sub={
              !trial.expired ? (
                <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-primary transition-all"
                    style={{ width: `${trial.percent}%` }}
                  />
                </div>
              ) : undefined
            }
          />

          <StatCard
            icon={<ShieldCheck className="w-5 h-5" />}
            iconBg="bg-emerald-500/15" iconColor="text-emerald-400"
            badge="● Live"
            badgeBg="bg-emerald-500/10 text-emerald-400 border-emerald-500/15"
            label="System Status"
            value="All Good"
            valueColor="text-emerald-400"
          />
        </div>

        {/* ── Content grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">

          {/* Quick start steps */}
          <div className="lg:col-span-3 glass-card p-7">
            <h2 className="text-base font-black mb-5 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Quick Start
            </h2>
            <div className="space-y-2">
              {[
                {
                  n: 1, title: 'Download the desktop app', desc: 'Windows & macOS supported', done: false,
                  onClick: () => { setActiveNav('downloads'); downloadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
                  cta: 'Download ↓',
                },
                {
                  n: 2, title: 'Log in automatically', desc: 'Auth is synced — no extra steps', done: true,
                  onClick: null, cta: null,
                },
                {
                  n: 3, title: 'Start your session', desc: 'Hit "Start Interview" and let AI cover you', done: false,
                  onClick: () => window.location.href = 'zyro-ai://open',
                  cta: 'Launch →',
                },
              ].map(({ n, title, desc, done, onClick, cta }) => (
                <div
                  key={n}
                  className="flex items-start gap-4 p-3.5 rounded-xl hover:bg-white/3 transition-colors group cursor-default"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-black ${
                    done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/7 text-white/40'
                  }`}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm ${done ? 'text-white/40 line-through' : 'text-white'}`}>{title}</p>
                    <p className="text-white/30 text-xs mt-0.5">{desc}</p>
                  </div>
                  {cta && onClick && (
                    <button
                      onClick={onClick}
                      className="text-primary text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {cta}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="lg:col-span-2 glass-card p-7 flex flex-col">
            <h2 className="text-base font-black mb-5 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" /> Capabilities
            </h2>
            <ul className="space-y-3 flex-1">
              {[
                'Real-time AI answer generation',
                'Transparent overlay — invisible to camera',
                'Whisper audio transcription',
                'Screen scan via Alt+S',
                'Behavioral + technical modes',
                'Sub-3s response time',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-4 h-4 bg-primary/12 rounded flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-2.5 h-2.5 text-primary" />
                  </div>
                  <span className="text-white/55">{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className="mt-5 flex items-center justify-center gap-2 py-2.5 bg-primary/8 hover:bg-primary/16 border border-primary/20 text-primary rounded-xl font-bold text-sm transition-all"
            >
              View Pricing <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* ── Upgrade banner ─────────────────────────────────────────────────── */}
        {!isPremium && !hasSessions && (
          <div className="relative rounded-2xl border border-primary/18 bg-gradient-to-r from-primary/8 via-primary/3 to-transparent overflow-hidden p-7 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="absolute -right-20 -top-20 w-56 h-56 bg-primary/8 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary bg-primary/12 px-3 py-1 rounded-full border border-primary/18 mb-3">
                <Crown className="w-3 h-3" /> Upgrade
              </div>
              <h3 className="text-2xl font-black mb-1">Go beyond 10 minutes</h3>
              <p className="text-white/35 text-sm">Session packs from ₹300. Never expire.</p>
            </div>
            <Link
              href="/pricing"
              className="relative flex items-center gap-2 px-7 py-3 bg-primary text-white rounded-xl font-black text-sm shadow-xl shadow-primary/25 hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
            >
              Buy Sessions <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Trial expired notice */}
        {trial.expired && !isPremium && !hasSessions && (
          <div className="mt-5 flex items-center gap-4 p-5 bg-red-500/7 border border-red-500/18 rounded-2xl">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-black text-sm text-red-400">Free trial exhausted</p>
              <p className="text-red-400/55 text-xs mt-0.5">Purchase a session pack to continue.</p>
            </div>
            <Link href="/pricing" className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors whitespace-nowrap">
              Buy now →
            </Link>
          </div>
        )}

      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen mesh-gradient flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
