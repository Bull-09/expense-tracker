'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Receipt, Users, Settings, LogOut, Handshake, Repeat2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/transactions', label: 'Transactions', icon: Receipt },
  { href: '/dashboard/subscriptions', label: 'Subs', icon: Repeat2 },
  { href: '/dashboard/groups', label: 'Groups', icon: Users },
  { href: '/dashboard/splits', label: 'Splits', icon: Handshake },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r border-ink-border bg-ink-raised p-5 sticky top-0 h-screen">
        <div className="flex items-center gap-2 mb-8 px-1">
          <div className="w-7 h-7 rounded-md bg-emerald flex items-center justify-center font-ledger text-sm font-bold">
            ₹
          </div>
          <span className="font-semibold text-lg leading-tight">C-137 Capital</span>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald/15 text-emerald'
                    : 'text-paper/60 hover:text-paper hover:bg-ink-border/50'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-ink-border pt-4 mt-4">
          <div className="flex items-center gap-3 px-1 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
              style={{ backgroundColor: profile.avatar_color }}
            >
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{profile.full_name}</p>
              <p className="text-xs text-paper/40 truncate">{profile.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-paper/50 hover:text-clay hover:bg-clay/10 w-full transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-ink-border bg-ink-raised sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald flex items-center justify-center font-ledger text-xs font-bold">
            ₹
          </div>
          <span className="font-semibold text-sm">C-137 Capital</span>
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
          style={{ backgroundColor: profile.avatar_color }}
        >
          {profile.full_name.charAt(0).toUpperCase()}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-20 lg:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-ink-raised border-t border-ink-border flex items-center justify-around py-2 z-10">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                active ? 'text-emerald' : 'text-paper/50'
              }`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
        <button onClick={handleSignOut} className="flex flex-col items-center gap-1 px-3 py-1.5 text-xs font-medium text-paper/50">
          <LogOut size={20} />
          Sign out
        </button>
      </nav>
    </div>
  );
}
