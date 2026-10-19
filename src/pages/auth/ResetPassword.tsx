import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { setNewPassword } from '@/services/supabase/auth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { LoadingState } from '@/components/ui/States';

export default function ResetPassword() {
  usePageTitle('Choose a new password');
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (authLoading) return <LoadingState />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Your password must be at least 8 characters.');
    setLoading(true);
    try {
      await setNewPassword(password);
      toast.success('Password updated.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password" footer={<Link to="/auth/login" className="font-semibold text-brand-700 hover:underline">Back to sign in</Link>}>
      {!user ? (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This reset link is invalid or has expired. Please request a new one from the sign-in page.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Input label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button type="submit" fullWidth loading={loading}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
