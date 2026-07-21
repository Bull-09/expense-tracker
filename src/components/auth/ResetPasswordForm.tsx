'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type RecoveryState = 'checking' | 'ready' | 'invalid' | 'saved';

export function ResetPasswordForm() {
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<RecoveryState>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function establishRecoverySession() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        if (active) setState('ready');
        return;
      }

      const code = new URLSearchParams(window.location.search).get('code');
      if (!code) {
        if (active) setState('invalid');
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (active) setState(exchangeError ? 'invalid' : 'ready');
    }

    void establishRecoverySession();
    return () => { active = false; };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut({ scope: 'local' });
    setState('saved');
  }

  if (state === 'checking') {
    return <div className="flex items-center gap-2 text-sm text-paper/50"><Loader2 size={17} className="animate-spin" /> Verifying your reset link…</div>;
  }

  if (state === 'invalid') {
    return (
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-peach/15 text-peach"><KeyRound size={22} /></span>
        <h2 className="text-lg font-bold">Reset link expired</h2>
        <p className="mt-2 text-sm text-paper/50">Request a new link to safely reset your password.</p>
        <Link href="/forgot-password" className="mt-5 inline-flex rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-ink">Request a new link</Link>
      </div>
    );
  }

  if (state === 'saved') {
    return (
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-mint/15 text-mint"><CheckCircle2 size={23} /></span>
        <h2 className="text-lg font-bold">Password updated</h2>
        <p className="mt-2 text-sm text-paper/50">You can now sign in with your new password.</p>
        <Link href="/login" className="mt-5 inline-flex rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-ink">Sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <Input id="new-password" type="password" label="New password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
      <Input id="confirm-password" type="password" label="Confirm password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
      {error && <div role="alert" className="rounded-lg border border-peach/30 bg-peach/10 px-3 py-2 text-sm text-peach">{error}</div>}
      <Button type="submit" size="lg" disabled={loading}>{loading ? 'Updating…' : 'Set new password'}</Button>
    </form>
  );
}
