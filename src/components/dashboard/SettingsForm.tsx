'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, Copy, Download, KeyRound, Share2, Smartphone } from 'lucide-react';
import { Profile } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { updateBudget } from '@/app/actions/transactions';
import { createClient } from '@/lib/supabase/client';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function SettingsForm({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const [budget, setBudget] = useState(profile.monthly_budget?.toString() ?? '');
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [appUrl, setAppUrl] = useState('');
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAppUrl(window.location.origin);
      setHasNativeShare('share' in navigator);
    });

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const value = budget.trim() === '' ? null : parseFloat(budget);
      await updateBudget(value);
      setSaved(true);
    });
  }

  async function handleShare() {
    if (!appUrl) return;

    if (hasNativeShare) {
      await navigator.share({
        title: 'Join my C-137 Capital',
        text: 'Track shared expenses with me on C-137 Capital.',
        url: appUrl,
      });
      return;
    }

    await navigator.clipboard.writeText(appUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSaved(false);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('Choose a password different from your current password.');
      return;
    }

    setPasswordPending(true);

    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword,
    });

    if (verificationError) {
      setPasswordError('Current password is incorrect.');
      setPasswordPending(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordPending(false);

    if (error) {
      setPasswordError(error.message);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSaved(true);
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

      <div className="rounded-xl border border-mint/30 bg-mint/5 p-5">
        <h2 className="text-sm font-semibold text-mint uppercase tracking-wide mb-2">Share with friends</h2>
        <p className="text-sm text-paper/50 mb-4">
          Send this link to people you split expenses with. Once they sign up, they&apos;ll appear in your split picker.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="min-w-0 flex-1 rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm text-paper/70 truncate">
            {appUrl || 'Your app link'}
          </div>
          <Button type="button" variant="secondary" onClick={handleShare} className="sm:w-auto">
            {copied ? <Check size={16} /> : hasNativeShare ? <Share2 size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : hasNativeShare ? 'Share' : 'Copy link'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-ink-border bg-ink-raised p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-sand/15 text-sand">
            <Smartphone size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-paper/60 uppercase tracking-wide">Install on phone</h2>
            <p className="mt-2 text-sm text-paper/50">
              Add C-137 Capital to your home screen for an app-like launch, full-screen view, and quicker daily logging.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              {installPrompt ? (
                <Button type="button" variant="secondary" onClick={handleInstall}>
                  <Download size={16} />
                  Install app
                </Button>
              ) : (
                <p className="rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm text-paper/50">
                  iPhone: open the live site in Safari, tap Share, then Add to Home Screen.
                </p>
              )}
            </div>
          </div>
        </div>
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
          {saved && <span className="text-sm text-mint">Saved</span>}
        </div>
      </form>

      <form onSubmit={handlePasswordChange} className="rounded-xl border border-ink-border bg-ink-raised p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-mint/15 text-mint">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-paper/60 uppercase tracking-wide">Change password</h2>
            <p className="mt-1 text-sm text-paper/50">Confirm your current password, then choose a new one with at least 8 characters.</p>
          </div>
        </div>
        <Input
          id="current-password"
          type="password"
          label="Current password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Input
          id="new-password"
          type="password"
          label="New password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Input
          id="confirm-password"
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={passwordPending}>
            {passwordPending ? 'Updating…' : 'Update password'}
          </Button>
          {passwordSaved && <span className="text-sm text-mint">Password updated</span>}
          {passwordError && <span role="alert" className="text-sm text-peach">{passwordError}</span>}
        </div>
      </form>

      <div className="rounded-xl border border-peach/30 bg-peach/5 p-5">
        <h2 className="text-sm font-semibold text-peach uppercase tracking-wide mb-2">Sign out everywhere</h2>
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
