'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function ForgotPasswordForm() {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-mint/15 text-mint">
          <MailCheck size={23} />
        </span>
        <h2 className="text-lg font-bold">Check your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-paper/50">
          If an account exists for <span className="text-paper/75">{email}</span>, we sent a secure password-reset link.
        </p>
        <button type="button" onClick={() => setSent(false)} className="mt-5 text-sm font-medium text-mint hover:underline">
          Send another link
        </button>
        <Link href="/login" className="mt-4 flex items-center justify-center gap-2 text-sm text-paper/45 hover:text-paper">
          <ArrowLeft size={15} /> Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <Input
        id="reset-email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoComplete="email"
      />
      {error && <div role="alert" className="rounded-lg border border-peach/30 bg-peach/10 px-3 py-2 text-sm text-peach">{error}</div>}
      <Button type="submit" disabled={loading} size="lg">
        {loading ? 'Sending…' : 'Send reset link'}
      </Button>
      <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-paper/45 hover:text-paper">
        <ArrowLeft size={15} /> Back to sign in
      </Link>
    </form>
  );
}
