import { AuthShell } from '@/components/auth/AuthShell';
import { SignupForm } from '@/components/auth/SignupForm';

export default function SignupPage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold mb-1">Create your tracker</h1>
      <p className="text-paper/50 mb-8">Track income, expenses, and shared costs.</p>
      <SignupForm />
    </AuthShell>
  );
}
