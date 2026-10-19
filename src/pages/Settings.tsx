import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { deleteMyAccount, deleteMyLearningData, submitReport } from '@/services/supabase/account';
import { GOALS, LEVELS, type EnglishLevel, type ExplanationLanguage } from '@/types';
import { cn } from '@/lib/utils';

export default function Settings() {
  usePageTitle('Settings');
  const { profile, user, saveProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [level, setLevel] = useState<EnglishLevel>(profile?.english_level ?? 'beginner');
  const [reason, setReason] = useState(profile?.primary_goal ?? '');
  const [goals, setGoals] = useState<string[]>(profile?.learning_goals ?? []);
  const [minutes, setMinutes] = useState(profile?.daily_target_minutes ?? 10);
  const [lang, setLang] = useState<ExplanationLanguage>(profile?.explanation_language ?? 'english');
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState<'data' | 'account' | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');

  const [report, setReport] = useState('');
  const [reporting, setReporting] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Please enter your name.');
    setSaving(true);
    try {
      await saveProfile({
        display_name: name.trim(),
        english_level: level,
        primary_goal: reason || null,
        learning_goals: goals,
        daily_target_minutes: minutes,
        explanation_language: lang,
      });
      toast.success('Settings saved.');
    } catch {
      toast.error('Could not save your settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function wipeData() {
    setBusy(true);
    try {
      await deleteMyLearningData();
      toast.success('Your lessons, words and progress were deleted.');
      setConfirm(null);
    } catch {
      toast.error('Could not delete your data. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function wipeAccount() {
    setBusy(true);
    try {
      await deleteMyAccount();
      navigate('/', { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  async function sendReport(e: FormEvent) {
    e.preventDefault();
    if (!user || report.trim().length < 5) return;
    setReporting(true);
    try {
      await submitReport(user.id, 'other', report.trim());
      setReport('');
      toast.success('Thank you. Your message was sent.');
    } catch {
      toast.error('Could not send your message.');
    } finally {
      setReporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>

      <form onSubmit={save}>
        <Card>
          <CardHeader title="Your learning profile" />
          <CardBody className="space-y-4">
            <Input label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" value={profile?.email ?? user?.email ?? ''} disabled readOnly />
            <Select label="English level" value={level} onChange={(e) => setLevel(e.target.value as EnglishLevel)}>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
            <Input label="Why are you learning English?" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-slate-700">What you want to improve</legend>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((g) => {
                  const on = goals.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setGoals((c) => (on ? c.filter((x) => x !== g) : [...c, g]))}
                      className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium', on ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700')}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Daily practice target" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
              <Select label="Explanations" value={lang} onChange={(e) => setLang(e.target.value as ExplanationLanguage)}>
                <option value="english">English only</option>
                <option value="hausa">English, with Hausa help</option>
              </Select>
            </div>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </CardBody>
        </Card>
      </form>

      <Card>
        <CardHeader title="Contact support" description="Report a problem or incorrect content." />
        <CardBody>
          <form onSubmit={sendReport} className="space-y-3">
            <Textarea label="Your message" value={report} onChange={(e) => setReport(e.target.value)} maxLength={2000} />
            <Button type="submit" variant="secondary" loading={reporting} disabled={report.trim().length < 5}>
              Send message
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card className="border-rose-200">
        <CardHeader title="Your data" description="We do not store raw audio. You control your saved lessons." />
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Delete my lessons, words and progress</p>
              <p className="text-sm text-slate-500">Keeps your account and profile.</p>
            </div>
            <Button variant="secondary" onClick={() => setConfirm('data')}>
              Delete learning data
            </Button>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-rose-700">Delete my account</p>
              <p className="text-sm text-slate-500">Permanently removes your account and all data. This cannot be undone.</p>
            </div>
            <Button variant="danger" onClick={() => { setTyped(''); setConfirm('account'); }}>
              Delete account
            </Button>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirm === 'data'}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={wipeData}
        loading={busy}
        danger
        confirmLabel="Delete everything"
        title="Delete all learning data?"
        description="All your lessons, transcripts, corrections, saved words and progress will be permanently deleted."
      />

      <Modal
        open={confirm === 'account'}
        onClose={() => !busy && setConfirm(null)}
        title="Delete your account?"
        description="This permanently deletes your account and everything in it. Type DELETE to confirm."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void wipeAccount()} loading={busy} disabled={typed !== 'DELETE'}>
              Delete my account
            </Button>
          </>
        }
      >
        <Input label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </Modal>
    </div>
  );
}
