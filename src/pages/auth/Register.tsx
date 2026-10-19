import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { signUpWithEmail } from '@/services/supabase/auth';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function Register() {
  usePageTitle('Create your account');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Please tell us your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Please enter a valid email address.');
    if (password.length < 8) return setError('Your password must be at least 8 characters.');
    if (!agree) return setError('Please accept the Terms of Service and Privacy Policy to continue.');
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUpWithEmail(email.trim(), password, name.trim());
      if (needsEmailConfirmation) setConfirmSent(true);
      else navigate('/onboarding', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (confirmSent) {
    return (
      <AuthLayout title="Check your email" footer={<Link to="/auth/login" className="font-semibold text-brand-700 hover:underline">Back to sign in</Link>}>
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <MailCheck className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-sm text-slate-600">
            We sent a confirmation link to <strong>{email}</strong>. Open it to verify your email, then sign in to start your first lesson.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start speaking English with your personal AI teacher."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/auth/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Input label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="flex items-start gap-2.5 text-sm text-slate-600">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
          <span>
            I agree to the{' '}
            <Link to="/terms" className="font-medium text-brand-700 hover:underline" target="_blank">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="font-medium text-brand-700 hover:underline" target="_blank">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth loading={loading}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
