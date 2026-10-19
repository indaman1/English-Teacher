import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, BookText, ChevronDown, CreditCard, History, LayoutDashboard, LineChart, LogOut, Mic, Settings, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const mainNav = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/practice', label: 'Practice', icon: Mic },
  { to: '/lessons', label: 'Lessons', icon: BookOpen },
  { to: '/vocabulary', label: 'Words', icon: BookText },
  { to: '/progress', label: 'Progress', icon: LineChart },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap font-bold tracking-tight', className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
        <Mic className="h-4 w-4" aria-hidden />
      </span>
      <span>AI English Teacher</span>
    </span>
  );
}

function UserMenu() {
  const { profile, user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = profile?.display_name || user?.email || 'Account';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = [
    { to: '/conversations', label: 'Lesson history', icon: History },
    { to: '/subscription', label: 'Plan & usage', icon: CreditCard },
    { to: '/settings', label: 'Settings', icon: Settings },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate sm:block">{name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 animate-fade-up rounded-2xl border border-slate-200 bg-white p-1.5 shadow-soft">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Icon className="h-4 w-4 text-slate-400" aria-hidden />
              {label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/', { replace: true });
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="page-container flex h-16 items-center justify-between gap-4">
          <Link to="/dashboard" aria-label="AI English Teacher home">
            <Logo className="text-[15px]" />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {mainNav.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn('rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <UserMenu />
        </div>
      </header>

      <main id="main" className="page-container py-6 sm:py-8">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {mainNav.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium', isActive ? 'text-brand-600' : 'text-slate-500')
                }
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
