import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sendPasswordReset } from '@/services/supabase/auth';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function ForgotPassword() {
  usePageTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Please enter a valid email address.');
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we will send you a reset link."
      footer={
        <Link to="/auth/login" className="font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox and spam folder.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Input label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button type="submit" fullWidth loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
