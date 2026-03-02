export default function PrivacyPage() {
    return (
        <div className="min-h-screen mesh-gradient py-24 px-6 flex items-center justify-center">
            <div className="glass-card p-12 max-w-4xl w-full">
                <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
                <div className="space-y-6 text-white/60 font-medium leading-relaxed">
                    <p>Your privacy is important to us. Here's how we handle your data:</p>
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">1. Information We Collect</h2>
                    <p>We collect your email, full name, and resume text to personalize the AI experience. We do not sell this data to third parties.</p>
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">2. Audio Processing</h2>
                    <p>Audio is processed in real-time only. We do not store your interview audio files on our servers after the session ends.</p>
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">3. Data Security</h2>
                    <p>We use industry-standard encryption and Supabase-managed security to protect your profile and session information.</p>
                    <p className="pt-8 border-t border-white/5 text-sm italic">Last updated: March 2026</p>
                </div>
            </div>
        </div>
    );
}
