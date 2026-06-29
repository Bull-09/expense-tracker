'use client';

import { useState, useTransition } from 'react';
import { Profile } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { updateBudget } from '@/app/actions/transactions';
import { createClient } from '@/lib/supabase/client';

export function SettingsForm({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const [budget, setBudget] = useState(profile.monthly_budget?.toString() ?? '');
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const value = budget.trim() === '' ? null : parseFloat(budget);
      await updateBudget(value);
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-ink-border bg-ink-raised p-5">
        <h2 className="text-sm font-semibold text-paper/60 uppercase tracking-wide mb-4">Profile</h2>
        <div className="flex items-center gap-4 mb-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-semibold"
            style={{ backgroundColor: profile.avatar_color }}
          >
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{profile.full_name}</p>
            <p className="text-sm text-paper/50">{profile.email}</p>
          </div>
        </div>
        <p className="text-xs text-paper/40">
          Name and email come from your account. Update them by signing in with a different provider, or contact yourself — you&apos;re the admin.
        </p>
      </div>

      <form onSubmit={handleSave} className="rounded-xl border border-ink-border bg-ink-raised p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-paper/60 uppercase tracking-wide">Monthly budget</h2>
        <p className="text-sm text-paper/50">
          Set a monthly expense budget and we&apos;ll flag it in your suggestions when you&apos;re getting close.
        </p>
        <Input
          type="number"
          placeholder="e.g. 30000"
          min="0"
          step="100"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save budget'}
          </Button>
          {saved && <span className="text-sm text-emerald">Saved</span>}
        </div>
      </form>

      <div className="rounded-xl border border-clay/30 bg-clay/5 p-5">
        <h2 className="text-sm font-semibold text-clay uppercase tracking-wide mb-2">Sign out everywhere</h2>
        <p className="text-sm text-paper/50 mb-3">This will sign you out of this device.</p>
        <Button
          variant="danger"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
