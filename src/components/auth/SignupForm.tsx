'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If email confirmation is off in the Supabase project, session exists immediately.
    if (data.session) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setDone(true);
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-sm text-center flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-paper/60 text-sm">
          We sent a confirmation link to {email}. Click it, then come back and sign in.
        </p>
        <Link href="/login" className="text-mint font-medium hover:underline text-sm">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <Input
        id="fullName"
        type="text"
        label="Full name"
        placeholder="Your name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
        autoComplete="name"
      />
      <Input
        id="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <Input
        id="password"
        type="password"
        label="Password"
        placeholder="At least 6 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        autoComplete="new-password"
      />
      {error && (
        <div className="rounded-lg bg-peach/10 border border-peach/30 px-3 py-2 text-sm text-peach">
          {error}
        </div>
      )}
      <Button type="submit" disabled={loading} size="lg" className="mt-2">
        {loading ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-sm text-paper/50 text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-mint font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
