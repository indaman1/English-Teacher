import { Link } from 'react-router-dom';
import { ArrowRight, AudioLines, BookOpenCheck, Briefcase, MessageCircle, Mic, Plane, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { Logo } from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';

const features = [
  { icon: Mic, title: 'Real voice conversations', text: 'Speak naturally and hear your teacher answer in real time. Interrupt any time, just like talking to a person.' },
  { icon: Sparkles, title: 'Gentle, instant corrections', text: 'Your teacher fixes the mistakes that matter, explains why in simple words, and asks you to try again.' },
  { icon: BookOpenCheck, title: 'Lessons for every level', text: 'From Beginner to Advanced: grammar, vocabulary, speaking, interviews, business and travel English.' },
  { icon: TrendingUp, title: 'Progress you can see', text: 'Speaking time, streaks, new words and a review of every lesson so you know you are improving.' },
];

const modes = [
  { icon: MessageCircle, label: 'Free conversation' },
  { icon: Briefcase, label: 'Job interviews' },
  { icon: Plane, label: 'Travel English' },
  { icon: AudioLines, label: 'Pronunciation practice' },
];

const steps = [
  { n: '1', title: 'Tell us your level and goals', text: 'A one-minute setup. Not sure of your level? Take the optional placement quiz.' },
  { n: '2', title: 'Tap start and speak', text: 'Allow your microphone and start talking. Your teacher listens and answers out loud.' },
  { n: '3', title: 'Review and improve', text: 'See your corrections, save new words, and watch your daily streak grow.' },
];

export default function Landing() {
  usePageTitle('AI English Teacher', 'Improve your English by speaking with your personal AI teacher. Real-time voice lessons, instant corrections, vocabulary and progress tracking.');
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="page-container flex h-16 items-center justify-between">
          <Link to="/" aria-label="AI English Teacher home">
            <Logo className="text-[15px] sm:text-base" />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
            {user ? (
              <Link to="/dashboard" className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/auth/login" className="inline-flex h-10 items-center whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:px-4">
                  Sign in
                </Link>
                <Link to="/auth/register" className="inline-flex h-10 items-center whitespace-nowrap rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700 sm:px-4">
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 h-[28rem] w-[60rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-200/70 via-violet-200/60 to-sky-200/60 blur-3xl" />
          <div className="page-container relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Live voice lessons with AI
              </span>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Improve your English by speaking with your <span className="gradient-text">personal AI teacher.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                Have natural spoken conversations, get friendly corrections right away, and practise interviews, travel and everyday English at your own pace — anytime, on your phone or computer.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={user ? '/practice' : '/auth/register'}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-7 text-base font-semibold text-white shadow-glow hover:bg-brand-700"
                >
                  {user ? 'Start a lesson' : 'Start speaking free'} <ArrowRight className="h-5 w-5" aria-hidden />
                </Link>
                <a href="#how-it-works" className="inline-flex h-14 items-center justify-center rounded-2xl border border-slate-200 bg-white px-7 text-base font-semibold text-slate-800 hover:bg-slate-50">
                  See how it works
                </a>
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> No raw audio is stored. You can delete your lessons any time.
              </p>
            </div>

            <div aria-hidden className="relative mx-auto w-full max-w-md">
              <div className="card space-y-3 p-5">
                <div className="flex justify-start"><div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2.5 text-[15px] text-slate-800">Hi! Let's practise. What did you do yesterday?</div></div>
                <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-[15px] text-white">I go market yesterday.</div></div>
                <div className="flex justify-start"><div className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2.5 text-[15px] text-slate-800">Good try! A better sentence is: "I went to the market yesterday." We use "went" for the past. Now try the full sentence.</div></div>
                <div className="flex items-center justify-center gap-[3px] pt-2">
                  {Array.from({ length: 24 }, (_, i) => (
                    <span key={i} className="w-1 rounded-full bg-gradient-to-t from-brand-500 to-violet-400" style={{ height: 8 + ((i * 7) % 5) * 7 }} />
                  ))}
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-slate-400">Example of a lesson</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="border-y border-slate-100 bg-slate-50/60 py-16">
          <div className="page-container">
            <h2 id="features-heading" className="text-center text-3xl font-bold tracking-tight text-slate-900">Everything you need to speak with confidence</h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, text }) => (
                <div key={title} className="card p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" aria-hidden /></div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
                </div>
              ))}
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-3" aria-label="Practice modes">
              {modes.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                  <Icon className="h-4 w-4 text-brand-600" aria-hidden /> {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" className="py-16">
          <div className="page-container">
            <h2 id="how-heading" className="text-center text-3xl font-bold tracking-tight text-slate-900">How it works</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="card p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{s.n}</span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-12 text-center">
              <Link to={user ? '/practice' : '/auth/register'} className="inline-flex h-14 items-center gap-2 rounded-2xl bg-brand-600 px-8 text-base font-semibold text-white shadow-glow hover:bg-brand-700">
                {user ? 'Start a lesson' : 'Create your free account'} <ArrowRight className="h-5 w-5" aria-hidden />
              </Link>
              <p className="mt-3 text-sm text-slate-500">Your teacher is an AI and can make mistakes. Use it as practice alongside other learning.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 py-8">
        <div className="page-container flex flex-col items-center justify-between gap-3 text-sm text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} AI English Teacher</span>
          <nav aria-label="Legal" className="flex gap-5">
            <Link to="/privacy" className="hover:text-slate-800">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-slate-800">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
