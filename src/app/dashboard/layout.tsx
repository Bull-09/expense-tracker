import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/data/dashboard';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
