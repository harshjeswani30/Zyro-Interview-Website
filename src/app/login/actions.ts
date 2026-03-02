'use server';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export async function checkEmail(email: string) {
    console.log('DEBUG: checkEmail started for', email);
    try {
        // Test connectivity to a known outside host
        try {
            console.log('DEBUG: testing fetch to google.com...');
            const testFetch = await fetch('https://www.google.com', { method: 'HEAD', cache: 'no-store' });
            console.log('DEBUG: Connectivity test (google.com):', testFetch.ok ? 'SUCCESS' : 'FAILED', testFetch.status);
        } catch (fErr: any) {
            console.error('DEBUG: Connectivity test FAILED:', fErr.message);
        }

        const supabase = await createClient();
        console.log('DEBUG: Supabase client created');
        console.log('DEBUG: URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

        // Use RPC to check if the user exists in auth.users directly
        console.log('DEBUG: Attempting RPC check_user_exists...');
        const { data, error } = await supabase.rpc('check_user_exists', {
            email_to_check: email
        });

        if (error) {
            console.error('DEBUG: RPC Error:', error.message);
            return { exists: false, error: `Verification system error: ${error.message}` };
        }

        console.log('DEBUG: RPC Success, exists:', !!data);
        return { exists: !!data };
    } catch (err: any) {
        console.error('DEBUG: checkEmail caught error:', err);
        return { exists: false, error: `Verification system error: ${err.message || 'Unknown error'}` };
    }
}

export async function signIn(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return { error: error.message };
    }

    // established session via cookies
    return { success: true, session: data.session };
}

export async function signUp(formData: FormData, redirectTo?: string) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const supabase = await createClient();

    // Construct the callback URL with the original redirect if present
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3008';
    let callbackUrl = `${siteUrl}/auth/callback`;
    
    if (redirectTo) {
        callbackUrl += `?next=${encodeURIComponent(redirectTo)}`;
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: callbackUrl,
        },
    });

    if (error) {
        return { error: error.message };
    }

    return { success: true, user: data.user };
}
