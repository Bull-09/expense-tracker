import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <h1 className="mb-1 text-2xl font-bold">Reset your password</h1>
      <p className="mb-8 text-paper/50">We&apos;ll email you a secure reset link.</p>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
