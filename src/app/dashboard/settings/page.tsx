import { getCurrentProfile } from '@/lib/data/dashboard';
import { SettingsForm } from '@/components/dashboard/SettingsForm';

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-paper/50 text-sm mt-1">Manage your profile, security, and budget.</p>
      </div>

      <SettingsForm profile={profile} />
    </div>
  );
}
