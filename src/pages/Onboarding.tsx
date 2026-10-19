import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Logo } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PLACEMENT_QUESTIONS, scorePlacement } from '@/features/auth/placement';
import { cn } from '@/lib/utils';
import { GOALS, LEVELS, levelLabel, type EnglishLevel, type ExplanationLanguage } from '@/types';

const REASONS = ['Work or career', 'School or exams', 'Travel', 'Moving abroad', 'Talking with friends and family', 'Personal growth'];
const MINUTES = [5, 10, 15, 20, 30, 45];
const TOTAL_STEPS = 6;

function Choice({ selected, onClick, children, hint }: { selected: boolean; onClick: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition',
        selected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <span>
        <span className="block text-[15px] font-semibold text-slate-900">{children}</span>
        {hint && <span className="mt-0.5 block text-sm text-slate-500">{hint}</span>}
      </span>
      {selected && <Check className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />}
    </button>
  );
}

export default function Onboarding() {
  usePageTitle('Set up your lessons');
  const { profile, saveProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [level, setLevel] = useState<EnglishLevel>(profile?.english_level ?? 'beginner');
  const [reason, setReason] = useState<string>('');
  const [goals, setGoals] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(10);
  const [hausa, setHausa] = useState<ExplanationLanguage>('english');
  const [saving, setSaving] = useState(false);
  const [quiz, setQuiz] = useState<{ index: number; answers: Record<string, number> } | null>(null);
  const [suggested, setSuggested] = useState<EnglishLevel | null>(null);

  const canNext = [name.trim().length > 0, true, Boolean(reason), goals.length > 0, true, true][step];

  async function finish() {
    setSaving(true);
    try {
      await saveProfile({
        display_name: name.trim(),
        english_level: level,
        primary_goal: reason,
        learning_goals: goals,
        daily_target_minutes: minutes,
        explanation_language: hausa,
        onboarding_completed: true,
      });
      toast.success('You are all set. Let’s start speaking!');
      navigate('/dashboard', { replace: true });
    } catch {
      toast.error('We could not save your answers. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function answerQuiz(optionIndex: number) {
    if (!quiz) return;
    const q = PLACEMENT_QUESTIONS[quiz.index];
    const answers = { ...quiz.answers, [q.id]: optionIndex };
    if (quiz.index + 1 >= PLACEMENT_QUESTIONS.length) {
      const result = scorePlacement(answers);
      setSuggested(result.level);
      setLevel(result.level);
      setQuiz(null);
    } else {
      setQuiz({ index: quiz.index + 1, answers });
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between">
        <Logo className="text-[15px]" />
        <span className="text-sm text-slate-500">
          Step {step + 1} of {TOTAL_STEPS}
        </span>
      </div>
      <ProgressBar className="mt-4" value={step + 1} max={TOTAL_STEPS} label="Setup progress" />

      <main className="card mt-6 flex-1 p-5 sm:p-8">
        {step === 0 && (
          <section aria-labelledby="s0">
            <h1 id="s0" className="text-2xl font-bold tracking-tight">What is your name?</h1>
            <p className="mt-1.5 text-sm text-slate-600">Your teacher will use it to greet you.</p>
            <div className="mt-6">
              <Input label="Your name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
            </div>
          </section>
        )}

        {step === 1 && !quiz && (
          <section aria-labelledby="s1">
            <h1 id="s1" className="text-2xl font-bold tracking-tight">What is your current English level?</h1>
            <p className="mt-1.5 text-sm text-slate-600">Choose the one that feels closest. You can change it later.</p>
            <div role="radiogroup" aria-label="English level" className="mt-5 space-y-2.5">
              {LEVELS.map((l) => (
                <Choice key={l.value} selected={level === l.value} onClick={() => setLevel(l.value)} hint={l.hint}>
                  {l.label}
                </Choice>
              ))}
            </div>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-800">Not sure?</p>
              <p className="mt-0.5 text-sm text-slate-600">Take a quick optional 10-question quiz for a suggested level. It is an estimate, not an official test.</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => { setSuggested(null); setQuiz({ index: 0, answers: {} }); }}>
                Take the placement quiz
              </Button>
              {suggested && (
                <p role="status" className="mt-3 text-sm text-emerald-700">
                  Suggested level: <strong>{levelLabel(suggested)}</strong>. We selected it for you, and you can still choose another.
                </p>
              )}
            </div>
          </section>
        )}

        {step === 1 && quiz && (
          <section aria-labelledby="quiz">
            <p className="text-sm text-slate-500">Question {quiz.index + 1} of {PLACEMENT_QUESTIONS.length}</p>
            <h1 id="quiz" className="mt-1 text-xl font-bold">{PLACEMENT_QUESTIONS[quiz.index].prompt}</h1>
            <div className="mt-5 grid gap-2.5">
              {PLACEMENT_QUESTIONS[quiz.index].options.map((opt, i) => (
                <Button key={opt} variant="secondary" size="lg" onClick={() => answerQuiz(i)}>
                  {opt}
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => setQuiz(null)}>
              Skip the quiz
            </Button>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="s2">
            <h1 id="s2" className="text-2xl font-bold tracking-tight">Why are you learning English?</h1>
            <div role="radiogroup" aria-label="Reason" className="mt-5 space-y-2.5">
              {REASONS.map((r) => (
                <Choice key={r} selected={reason === r} onClick={() => setReason(r)}>
                  {r}
                </Choice>
              ))}
            </div>
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="s3">
            <h1 id="s3" className="text-2xl font-bold tracking-tight">What do you want to improve?</h1>
            <p className="mt-1.5 text-sm text-slate-600">Pick as many as you like.</p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {GOALS.map((g) => {
                const on = goals.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGoals((cur) => (on ? cur.filter((x) => x !== g) : [...cur, g]))}
                    className={cn(
                      'rounded-full border px-4 py-2.5 text-sm font-medium transition',
                      on ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                    )}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 4 && (
          <section aria-labelledby="s4">
            <h1 id="s4" className="text-2xl font-bold tracking-tight">How many minutes a day can you practise?</h1>
            <div role="radiogroup" aria-label="Daily minutes" className="mt-5 grid grid-cols-3 gap-2.5">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={minutes === m}
                  onClick={() => setMinutes(m)}
                  className={cn(
                    'rounded-2xl border py-4 text-center transition',
                    minutes === m ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 bg-white hover:border-slate-300',
                  )}
                >
                  <span className="block text-xl font-bold">{m}</span>
                  <span className="text-xs text-slate-500">minutes</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 5 && (
          <section aria-labelledby="s5">
            <h1 id="s5" className="text-2xl font-bold tracking-tight">Do you want Hausa explanations when necessary?</h1>
            <p className="mt-1.5 text-sm text-slate-600">Lessons stay in English. Your teacher can briefly explain hard ideas in Hausa, then return to English practice.</p>
            <div role="radiogroup" aria-label="Explanation language" className="mt-5 space-y-2.5">
              <Choice selected={hausa === 'hausa'} onClick={() => setHausa('hausa')} hint="Short Hausa help when I am stuck">
                Yes, please
              </Choice>
              <Choice selected={hausa === 'english'} onClick={() => setHausa('english')} hint="Simple English explanations only (you can still ask for Hausa)">
                No, English only
              </Choice>
            </div>
          </section>
        )}
      </main>

      {!quiz && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Button>
          {step < TOTAL_STEPS - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button onClick={finish} loading={saving}>
              Finish setup
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
