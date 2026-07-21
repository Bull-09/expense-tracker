import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <h1 className="mb-1 text-2xl font-bold">Choose a new password</h1>
      <p className="mb-8 text-paper/50">Use at least 8 characters.</p>
      <ResetPasswordForm />
    </AuthShell>
  );
}
