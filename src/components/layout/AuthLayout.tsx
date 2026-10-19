import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './AppShell';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-200/60 to-violet-200/60 blur-3xl" />
      <Link to="/" className="relative mb-8" aria-label="AI English Teacher home">
        <Logo className="text-lg" />
      </Link>
      <main className="card relative w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
      {footer && <div className="relative mt-5 text-center text-sm text-slate-600">{footer}</div>}
    </div>
  );
}
