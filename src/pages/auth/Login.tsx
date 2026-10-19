import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { signInWithEmail } from '@/services/supabase/auth';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function Login() {
  usePageTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Please enter a valid email address.');
    if (!password) return setError('Please enter your password.');
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your English lessons."
      footer={
        <>
          New here?{' '}
          <Link to="/auth/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex justify-end">
          <Link to="/auth/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth loading={loading}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
