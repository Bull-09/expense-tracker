import { redirect } from 'next/navigation';
import { getCategories, getCurrentProfile, getDirectory, getGroups, getMerchantRules } from '@/lib/data/dashboard';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  const [categories, directory, groups, merchantRules] = await Promise.all([
    getCategories(),
    getDirectory(),
    getGroups(),
    getMerchantRules(),
  ]);

  return (
    <AppShell profile={profile} categories={categories} merchantRules={merchantRules} directory={directory} groups={groups}>
      {children}
    </AppShell>
  );
}
