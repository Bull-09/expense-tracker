import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
      <p className="text-paper/50 mb-8">Sign in to your tracker.</p>
      <LoginForm />
    </AuthShell>
  );
}
