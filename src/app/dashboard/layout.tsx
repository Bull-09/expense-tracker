import { redirect } from 'next/navigation';
import { getCategories, getCurrentProfile, getDirectory, getGroups } from '@/lib/data/dashboard';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  const [categories, directory, groups] = await Promise.all([
    getCategories(),
    getDirectory(),
    getGroups(),
  ]);

  return (
    <AppShell profile={profile} categories={categories} directory={directory} groups={groups}>
      {children}
    </AppShell>
  );
}
