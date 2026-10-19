import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './AppShell';

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="page-container flex h-16 items-center">
          <Link to="/" aria-label="AI English Teacher home">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated: {updated}</p>
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This document is a plain-language starting point written with the product. The operator of this service should review it with a qualified
          lawyer and add their legal entity name and contact details before launching to the public.
        </div>
        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </main>
    </div>
  );
}
