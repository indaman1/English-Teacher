import { useState } from 'react';
import { Activity, AlertTriangle, Clock, CreditCard, Flag, Users } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatDateTime } from '@/lib/utils';
import {
  adminListErrors,
  adminListLessons,
  adminListModes,
  adminListPlans,
  adminListReports,
  adminResolveReport,
  adminSetLessonPublished,
  adminSetModeActive,
  adminUpdatePlan,
  fetchOverview,
  type AdminPlan,
} from '@/services/supabase/admin';
import { levelLabel } from '@/types';

type Tab = 'overview' | 'content' | 'plans' | 'reports' | 'errors';

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-brand-600' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function PlanEditor({ plan, onSaved }: { plan: AdminPlan; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({
    daily_voice_minutes: Math.round(plan.daily_voice_seconds / 60),
    monthly_voice_minutes: Math.round(plan.monthly_voice_seconds / 60),
    daily_sessions: plan.daily_sessions,
    max_session_minutes: Math.round(plan.max_session_seconds / 60),
  });
  const [saving, setSaving] = useState(false);
  const field = (k: keyof typeof v, label: string) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        type="number"
        min={0}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
        className="h-10 w-full rounded-lg border border-slate-200 px-3"
      />
    </label>
  );
  async function save() {
    setSaving(true);
    try {
      await adminUpdatePlan(plan.code, {
        daily_voice_seconds: v.daily_voice_minutes * 60,
        monthly_voice_seconds: v.monthly_voice_minutes * 60,
        daily_sessions: v.daily_sessions,
        max_session_seconds: Math.min(1800, Math.max(60, v.max_session_minutes * 60)),
      });
      toast.success(`${plan.name} limits saved.`);
      onSaved();
    } catch {
      toast.error('Could not save. Check that you have admin access.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <CardHeader title={`${plan.name} plan limits`} />
      <CardBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {field('daily_voice_minutes', 'Voice minutes per day')}
          {field('monthly_voice_minutes', 'Voice minutes per month')}
          {field('daily_sessions', 'Lessons per day')}
          {field('max_session_minutes', 'Max minutes per lesson (≤ 30)')}
        </div>
        <Button onClick={save} loading={saving}>
          Save limits
        </Button>
      </CardBody>
    </Card>
  );
}

export default function Admin() {
  usePageTitle('Admin');
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');

  const overview = useAsync(fetchOverview, []);
  const content = useAsync(async () => ({ lessons: await adminListLessons(), modes: await adminListModes() }), []);
  const plans = useAsync(adminListPlans, []);
  const reports = useAsync(adminListReports, []);
  const errors = useAsync(adminListErrors, []);

  async function run(fn: () => Promise<void>, after: () => void) {
    try {
      await fn();
      after();
    } catch {
      toast.error('That action was not allowed or failed.');
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Admin</h1>
        <p className="mt-1 text-slate-600">Aggregate statistics only. Private conversations are not shown here.</p>
      </header>

      <Tabs
        label="Admin sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'content', label: 'Content' },
          { value: 'plans', label: 'Plans & limits' },
          { value: 'reports', label: 'Reports', count: reports.data?.filter((r) => r.status === 'open').length },
          { value: 'errors', label: 'Errors' },
        ]}
      />

      {tab === 'overview' &&
        (overview.loading ? (
          <LoadingState />
        ) : overview.error || !overview.data ? (
          <ErrorState message={overview.error ?? 'Unable to load.'} onRetry={overview.reload} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard icon={<Users className="h-5 w-5" aria-hidden />} label="Total users" value={String(overview.data.total_users)} hint={`${overview.data.new_users_7d} new in 7 days`} />
            <StatCard icon={<Activity className="h-5 w-5" aria-hidden />} label="Active (7d)" value={String(overview.data.active_users_7d)} />
            <StatCard icon={<Clock className="h-5 w-5" aria-hidden />} label="Speaking (7d)" value={`${Math.round(overview.data.speaking_minutes_7d)} min`} hint={`${overview.data.sessions_7d} lessons`} />
            <StatCard icon={<CreditCard className="h-5 w-5" aria-hidden />} label="Premium users" value={String(overview.data.premium_users)} />
            <StatCard icon={<Activity className="h-5 w-5" aria-hidden />} label="Lessons total" value={String(overview.data.sessions_total)} />
            <StatCard icon={<Flag className="h-5 w-5" aria-hidden />} label="Open reports" value={String(overview.data.open_reports)} />
            <StatCard icon={<AlertTriangle className="h-5 w-5" aria-hidden />} label="Errors (24h)" value={String(overview.data.errors_24h)} />
          </div>
        ))}

      {tab === 'content' &&
        (content.loading ? (
          <LoadingState />
        ) : !content.data ? (
          <ErrorState onRetry={content.reload} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Learning modes" />
              <CardBody className="space-y-3">
                {content.data.modes.map((m) => (
                  <div key={m.code} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{m.name}</span>
                    <Toggle on={m.is_active} label={`${m.name} active`} onChange={(v) => run(() => adminSetModeActive(m.code, v), content.reload)} />
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Lessons" description="Unpublished lessons are hidden from students." />
              <CardBody className="space-y-3">
                {content.data.lessons.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{l.title}</span>
                      <span className="text-xs text-slate-500">{levelLabel(l.level)}</span>
                    </span>
                    <Toggle on={l.is_published} label={`${l.title} published`} onChange={(v) => run(() => adminSetLessonPublished(l.id, v), content.reload)} />
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        ))}

      {tab === 'plans' &&
        (plans.loading ? (
          <LoadingState />
        ) : !plans.data ? (
          <ErrorState onRetry={plans.reload} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {plans.data.map((p) => (
              <PlanEditor key={`${p.code}-${p.daily_voice_seconds}-${p.monthly_voice_seconds}-${p.daily_sessions}-${p.max_session_seconds}`} plan={p} onSaved={plans.reload} />
            ))}
          </div>
        ))}

      {tab === 'reports' &&
        (reports.loading ? (
          <LoadingState />
        ) : !reports.data ? (
          <ErrorState onRetry={reports.reload} />
        ) : reports.data.length === 0 ? (
          <p className="text-sm text-slate-500">No reports.</p>
        ) : (
          <ul className="space-y-3">
            {reports.data.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={r.status === 'open' ? 'warning' : 'success'}>{r.status}</Badge>
                      <Badge>{r.category}</Badge>
                      <span className="text-xs text-slate-500">{formatDateTime(r.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-800">{r.message}</p>
                  </div>
                  {r.status === 'open' && (
                    <Button size="sm" variant="secondary" onClick={() => run(() => adminResolveReport(r.id), reports.reload)}>
                      Mark resolved
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'errors' &&
        (errors.loading ? (
          <LoadingState />
        ) : !errors.data ? (
          <ErrorState onRetry={errors.reload} />
        ) : errors.data.length === 0 ? (
          <p className="text-sm text-slate-500">No errors logged.</p>
        ) : (
          <Card>
            <CardBody className="divide-y divide-slate-100 p-0">
              {errors.data.map((e) => (
                <div key={e.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Badge>{e.source}</Badge>
                    {formatDateTime(e.created_at)}
                  </div>
                  <p className="mt-1 break-words font-mono text-xs text-slate-700">{e.message}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        ))}
    </div>
  );
}
