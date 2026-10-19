import { Settings2 } from 'lucide-react';

export function ConfigMissing() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card max-w-lg p-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Settings2 className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">Supabase is not configured yet</h1>
        <p className="mt-2 text-sm text-slate-600">
          Copy <code className="rounded bg-slate-100 px-1.5 py-0.5">.env.example</code> to{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">.env.local</code>, then set{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code> from your Supabase project
          (Project Settings → API) and restart the dev server.
        </p>
        <p className="mt-3 text-sm text-slate-500">The README walks through the full setup, including the database migrations and the Gemini secret.</p>
      </div>
    </main>
  );
}
