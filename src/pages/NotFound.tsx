import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">This page could not be found</h1>
      <p className="mt-2 max-w-sm text-slate-600">The link may be broken or the page may have moved.</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
        Back to home
      </Link>
    </main>
  );
}
