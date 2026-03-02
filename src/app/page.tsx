import Link from 'next/link';
import {
  Zap,
  Shield,
  Cpu,
  Monitor,
  Download,
  ChevronRight,
  CheckCircle2,
  Star,
  Users
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen mesh-gradient selection:bg-primary/30">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Zap className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">Zyro AI</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-white transition-colors">Process</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors">
              Sign In
            </Link>
            <button className="glow-btn bg-primary text-white px-6 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2">
              Get Started <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-primary mb-8 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Next-Gen Interview Assistant is here
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
            Master Every Interview <br />
            with <span className="gradient-text">Zyro AI Assistant</span>
          </h1>

          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-12 leading-relaxed">
            The ultimate desktop companion that listens, thinks, and guides you through
            complex coding and behavioral interviews in real-time.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <button className="glow-btn bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 w-full sm:w-auto">
              <Download className="w-6 h-6" /> Download Desktop App
            </button>
            <button className="bg-white/5 hover:bg-white/10 border border-white/10 px-8 py-4 rounded-2xl font-bold text-lg transition-all w-full sm:w-auto">
              Start 10 Min Free Trial
            </button>
          </div>

          {/* App Preview Mockup */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary/20 blur-[120px] rounded-full"></div>
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-secondary/20 blur-[120px] rounded-full"></div>

            <div className="glass-card p-4 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
              <div className="bg-black/40 rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-white/5">
                <div className="text-center">
                  <Monitor className="w-16 h-16 text-white/20 mx-auto mb-4 group-hover:scale-110 transition-transform duration-500" />
                  <p className="text-white/40 font-mono text-sm">Desktop Overlay Preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6 bg-black/20">
        <div className="max-w-7xl mx-auto text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Unfair Advantage</h2>
          <p className="text-white/40">Powerful features designed to make you top 1% candidate.</p>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: "Real-time AI Guidance",
              desc: "Listen to the interviewer and get instant, context-aware answers generated specifically for your resume.",
              icon: <Zap className="w-8 h-8 text-primary" />
            },
            {
              title: "Smart Screen Scan",
              desc: "Solve complex coding problems on the fly. Alt+S to scan your screen and get optimal solutions.",
              icon: <Cpu className="w-8 h-8 text-secondary" />
            },
            {
              title: "Behavioral Excellence",
              desc: "AI-driven personas that help you navigate tricky behavioral questions with confidence.",
              icon: <Users className="w-8 h-8 text-accent" />
            }
          ].map((f, i) => (
            <div key={i} className="glass-card p-8 hover:border-primary/50 transition-colors group">
              <div className="p-4 bg-white/5 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform">
                {f.icon}
              </div>
              <h3 className="text-xl font-bold mb-4">{f.title}</h3>
              <p className="text-white/50 leading-relaxed text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trial Section */}
      <section className="py-40 px-6 overflow-hidden relative">
        <div className="max-w-4xl mx-auto glass-card p-12 md:p-20 text-center relative z-10">
          <div className="absolute top-0 right-0 p-8 transform translate-x-1/2 -translate-y-1/2">
            <div className="w-40 h-40 bg-primary/20 blur-[60px] rounded-full"></div>
          </div>

          <h2 className="text-4xl font-bold mb-6">Test the Future Today</h2>
          <p className="text-xl text-white/60 mb-10 leading-relaxed">
            Experience the power of Zyro AI with our 10-minute free trial.
            No credit card required. Just login and start your first session.
          </p>
          <button className="glow-btn bg-white text-black px-12 py-5 rounded-2xl font-bold text-xl hover:bg-white/90">
            Try For Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-20 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-2">
            <Zap className="text-primary w-6 h-6" />
            <span className="text-xl font-bold">Zyro AI</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-8 mb-8 text-sm font-medium text-white/40">
            <Link href="/pricing" className="hover:text-primary transition-colors">Pricing</Link>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <a href="mailto:support@zyro-ai.in" className="hover:text-primary transition-colors">Support</a>
          </div>
          <p className="text-white/20 text-xs font-medium">
            © 2026 Zyro AI. All rights reserved. Professional Interview AI Assistant.
          </p>
        </div>
      </footer>
    </div>
  );
}
