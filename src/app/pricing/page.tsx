import { Zap, Check, Crown, ArrowRight, Shield } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
    const plans = [
        {
            name: "Free Trial",
            price: "0",
            description: "Experience the power of Zyro AI",
            features: [
                "10-min Free Session",
                "Standard AI persona",
                "Screen analysis beta",
                "Community support"
            ],
            cta: "Start Free Trial",
            href: "/login",
            popular: false
        },
        {
            name: "Lifetime Premium",
            price: "49",
            description: "One-time payment, forever yours",
            features: [
                "Unlimited sessions",
                "All advanced personas",
                "High-priority audio",
                "Early Beta access",
                "Priority 24/7 support",
                "Cloud recording sync"
            ],
            cta: "Get Instant Access",
            href: "/login",
            popular: true
        }
    ];

    return (
        <div className="min-h-screen mesh-gradient py-24 px-6">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-20 animate-fade-in">
                    <h1 className="text-5xl md:text-6xl font-extrabold mb-6 tracking-tight">
                        Simple, <span className="text-primary">Transparent</span> Pricing
                    </h1>
                    <p className="text-white/40 text-xl font-medium max-w-2xl mx-auto">
                        Choose the plan that fits your career goals. No monthly subscriptions, just results.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                    {plans.map((plan, idx) => (
                        <div
                            key={idx}
                            className={`glass-card p-10 flex flex-col relative overflow-hidden group transition-all hover:scale-[1.02] ${plan.popular ? 'border-primary/50 shadow-2xl shadow-primary/10' : ''}`}
                        >
                            {plan.popular && (
                                <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-black uppercase px-4 py-1 rounded-bl-xl tracking-widest animate-pulse">
                                    Most Popular
                                </div>
                            )}

                            <div className="mb-8">
                                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                                <p className="text-white/40 font-medium mb-6">{plan.description}</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-5xl font-black">${plan.price}</span>
                                    <span className="text-white/40 font-bold uppercase tracking-widest text-sm">USD</span>
                                </div>
                            </div>

                            <div className="space-y-4 mb-10 flex-grow">
                                {plan.features.map((feature, fIdx) => (
                                    <div key={fIdx} className="flex items-center gap-3">
                                        <div className="w-5 h-5 bg-primary/20 rounded flex items-center justify-center">
                                            <Check className="w-3.5 h-3.5 text-primary" />
                                        </div>
                                        <span className="text-white/70 font-medium">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <Link
                                href={plan.href}
                                className={`glow-btn py-4 rounded-2xl font-bold text-center flex items-center justify-center gap-2 transition-all ${plan.popular ? 'bg-primary text-white' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'}`}
                            >
                                {plan.cta} <ArrowRight className="w-5 h-5" />
                            </Link>
                        </div>
                    ))}
                </div>

                {/* Guarantee Banner */}
                <div className="mt-20 text-center glass-card p-8 bg-black/40 border-white/5 max-w-xl mx-auto animate-fade-in-up">
                    <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-6 h-6 text-green-500" />
                    </div>
                    <h4 className="font-bold text-lg mb-2 text-green-500">100% Satisfaction Guarantee</h4>
                    <p className="text-white/40 text-sm font-medium">
                        If Zyro AI doesn't help you land your dream job, we'll refund your premium purchase, no questions asked.
                    </p>
                </div>
            </div>
        </div>
    );
}
