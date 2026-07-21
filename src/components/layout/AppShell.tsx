'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CircleDollarSign,
  Handshake,
  Home,
  LayoutGrid,
  LogOut,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Repeat2,
  Settings,
  Sparkles,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AiQuickAddModal } from '@/components/dashboard/AiQuickAddModal';
import { CaptureSheet } from '@/components/dashboard/CaptureSheet';
import { Category, DirectoryUser, Group, Profile } from '@/lib/types';

const PRIMARY_NAV = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/transactions', label: 'Activity', icon: ReceiptText },
  { href: '/dashboard/splits', label: 'Splits', icon: Handshake },
];

const DESKTOP_NAV = [
  ...PRIMARY_NAV,
  { href: '/dashboard/groups', label: 'Groups', icon: Users },
  { href: '/dashboard/categories', label: 'Categories', icon: LayoutGrid },
  { href: '/dashboard/subscriptions', label: 'Subscriptions', icon: Repeat2 },
];

const MORE_ITEMS = [
  { href: '/dashboard/categories', label: 'Categories', icon: LayoutGrid },
  { href: '/dashboard/subscriptions', label: 'Subscriptions', icon: Repeat2 },
  { href: '/dashboard/settings', label: 'Budget', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Currency', icon: CircleDollarSign },
  { href: '/dashboard/settings', label: 'Invite', icon: Users },
  { href: '/dashboard/settings', label: 'Install app', icon: WalletCards },
  { href: '/dashboard/settings', label: 'Password', icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

export function AppShell({
  profile,
  categories,
  directory,
  groups,
  children,
}: {
  profile: Profile;
  categories: Category[];
  directory: DirectoryUser[];
  groups: Group[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  function openCapture() {
    window.dispatchEvent(new Event('c137:open-capture'));
  }

  function openVoiceCapture() {
    window.dispatchEvent(new Event('c137:open-ai-capture'));
  }

  function startLongPress() {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      openVoiceCapture();
    }, 500);
  }

  function endLongPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-ink text-paper md:pl-[76px] lg:pl-[232px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col border-r border-ink-border bg-ink-raised px-3 py-5 md:flex lg:w-[232px] lg:px-4">
        <Link href="/dashboard" className="mb-9 flex h-10 items-center justify-center gap-3 lg:justify-start lg:px-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint font-ledger text-sm font-bold text-ink">₹</span>
          <span className="hidden text-[15px] font-bold tracking-tight lg:block">C-137 Capital</span>
        </Link>

        <nav className="flex flex-col gap-1.5" aria-label="Main navigation">
          {DESKTOP_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors lg:justify-start ${
                  active ? 'bg-mint/12 text-mint' : 'text-paper/55 hover:bg-ink-border-soft/60 hover:text-paper'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                <span className="hidden lg:block">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={openCapture}
          className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-mint font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={20} strokeWidth={2.5} />
          <span className="hidden lg:block">New entry</span>
        </button>

        <div className="mt-auto border-t border-ink-border pt-4">
          <Link href="/dashboard/settings" className="flex items-center justify-center gap-3 rounded-xl p-2 hover:bg-ink-border-soft/60 lg:justify-start">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-ink" style={{ backgroundColor: profile.avatar_color }}>
              {profile.full_name.charAt(0).toUpperCase()}
            </span>
            <span className="hidden min-w-0 lg:block">
              <span className="block truncate text-sm font-semibold">{profile.full_name}</span>
              <span className="block truncate text-xs text-paper/40">{profile.email}</span>
            </span>
          </Link>
          <button onClick={handleSignOut} title="Sign out" className="mt-2 flex h-10 w-full items-center justify-center gap-3 rounded-xl text-paper/40 hover:bg-peach/10 hover:text-peach lg:justify-start lg:px-3">
            <LogOut size={18} />
            <span className="hidden text-sm lg:block">Sign out</span>
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-ink-border bg-ink/90 px-4 backdrop-blur md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint font-ledger text-xs font-bold text-ink">₹</span>
          <span className="text-sm font-bold">C-137 Capital</span>
        </Link>
        <button onClick={() => setMoreOpen(true)} aria-label="Open more menu" className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-ink" style={{ backgroundColor: profile.avatar_color }}>
          {profile.full_name.charAt(0).toUpperCase()}
        </button>
      </header>

      <main className="min-h-screen pb-28 md:pb-0">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid h-[76px] grid-cols-5 border-t border-ink-border bg-ink-raised/95 px-2 pb-[max(6px,env(safe-area-inset-bottom))] backdrop-blur md:hidden" aria-label="Mobile navigation">
        {PRIMARY_NAV.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-mint' : 'text-paper/45'}`}>
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          aria-label="Open capture"
          onPointerDown={startLongPress}
          onPointerUp={endLongPress}
          onPointerCancel={endLongPress}
          onPointerLeave={endLongPress}
          onClick={() => { if (!longPressed.current) openCapture(); }}
          className="relative flex items-center justify-center"
        >
          <span className="absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full border-[5px] border-ink-raised bg-mint text-ink shadow-lg shadow-black/30">
            <Plus size={25} strokeWidth={2.5} />
          </span>
          <span className="mt-9 text-[10px] font-semibold text-mint">Capture</span>
        </button>

        <Link href="/dashboard/splits" className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive(pathname, '/dashboard/splits') ? 'text-mint' : 'text-paper/45'}`}>
          <Handshake size={20} strokeWidth={isActive(pathname, '/dashboard/splits') ? 2.5 : 1.8} />
          Splits
        </Link>
        <button onClick={() => setMoreOpen(true)} className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${moreOpen || pathname === '/dashboard/settings' ? 'text-mint' : 'text-paper/45'}`}>
          <MoreHorizontal size={20} />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} aria-label="Close more menu" />
          <section className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[28px] border border-ink-border bg-ink-raised px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-paper/20" />
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">More</p>
                <p className="text-xs text-paper/40">Settings and money tools</p>
              </div>
              <button onClick={() => setMoreOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper/60" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.label} href={item.href} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink p-3 text-sm font-medium text-paper/75">
                    <Icon size={18} className="text-mint" />
                    {item.label}
                  </Link>
                );
              })}
              {process.env.NEXT_PUBLIC_SHOW_AI_COST === 'true' && (
                <Link href="/dashboard/settings" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink p-3 text-sm font-medium text-paper/75">
                  <Sparkles size={18} className="text-lilac" /> AI usage
                </Link>
              )}
            </div>
            <button onClick={handleSignOut} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-peach/25 text-sm font-semibold text-peach">
              <LogOut size={17} /> Sign out
            </button>
          </section>
        </div>
      )}

      <CaptureSheet categories={categories} directory={directory} currentUserId={profile.id} />
      <AiQuickAddModal categories={categories} directory={directory} groups={groups} currentUserId={profile.id} />
    </div>
  );
}
