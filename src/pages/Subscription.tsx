import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState, ProgressBar } from '@/components/ui/States';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PAYMENTS_ENABLED } from '@/services/payments/provider';
import { getMySubscription, getMyUsage, listPlans } from '@/services/supabase/usage';
import { formatDate, formatMinutes } from '@/lib/utils';

export default function Subscription() {
  usePageTitle('Plan & usage');
  const { data, error, loading, reload } = useAsync(async () => {
    const [usage, subscription, plans] = await Promise.all([getMyUsage(), getMySubscription(), listPlans()]);
    return { usage, subscription, plans };
  }, []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message="We could not load your plan." onRetry={reload} />;

  const { usage, subscription, plans } = data;
  const current = subscription?.plan_code ?? 'free';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Plan &amp; usage</h1>
        <p className="mt-1 text-slate-600">Speaking limits are enforced on our servers and reset automatically.</p>
      </header>

      {usage && (
        <Card>
          <CardHeader title="Your usage" action={<Badge tone="brand">{current === 'premium' ? 'Premium' : 'Free'} plan</Badge>} />
          <CardBody className="space-y-5">
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">Today</span>
                <span className="text-slate-600">
                  {formatMinutes(usage.daily_used_seconds)} of {formatMinutes(usage.daily_limit_seconds)}
                </span>
              </div>
              <ProgressBar value={usage.daily_used_seconds} max={usage.daily_limit_seconds} label="Daily speaking time used" />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">This month</span>
                <span className="text-slate-600">
                  {formatMinutes(usage.monthly_used_seconds)} of {formatMinutes(usage.monthly_limit_seconds)}
                </span>
              </div>
              <ProgressBar value={usage.monthly_used_seconds} max={usage.monthly_limit_seconds} label="Monthly speaking time used" />
            </div>
            <p className="text-sm text-slate-600">
              Lessons today: <strong>{usage.sessions_today}</strong> of {usage.daily_sessions_limit} · Longest lesson: {formatMinutes(usage.max_session_seconds)}
            </p>
            <p className="text-xs text-slate-500">Daily limits reset at midnight UTC.</p>
          </CardBody>
        </Card>
      )}

      <section aria-label="Plans" className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => {
          const isCurrent = p.code === current;
          return (
            <Card key={p.code} className={isCurrent ? 'border-brand-500 ring-2 ring-brand-200' : ''}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  {isCurrent && <Badge tone="success">Current</Badge>}
                </div>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  {[
                    `${formatMinutes(p.daily_voice_seconds)} speaking per day`,
                    `${formatMinutes(p.monthly_voice_seconds)} speaking per month`,
                    `Up to ${p.daily_sessions} lessons a day`,
                    `Lessons up to ${formatMinutes(p.max_session_seconds)} long`,
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
                {p.code === 'premium' && !isCurrent && (
                  <Button className="mt-5" fullWidth disabled={!PAYMENTS_ENABLED}>
                    {PAYMENTS_ENABLED ? 'Upgrade to Premium' : 'Premium is coming soon'}
                  </Button>
                )}
              </CardBody>
            </Card>
          );
        })}
      </section>

      {subscription?.current_period_end && <p className="text-sm text-slate-500">Current period ends {formatDate(subscription.current_period_end)}.</p>}
      <p className="text-xs text-slate-500">Online payments are not connected yet. When they are, prices will be shown clearly before you are charged.</p>
    </div>
  );
}
