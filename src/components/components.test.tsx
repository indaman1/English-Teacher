import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TranscriptView } from '@/components/voice/TranscriptView';
import { AudioVisualizer } from '@/components/voice/AudioVisualizer';
import { EmptyState, ErrorState, ProgressBar } from '@/components/ui/States';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ProtectedRoute, PublicOnlyRoute } from '@/components/layout/ProtectedRoute';
import { LessonCard } from '@/components/lessons/LessonCard';
import type { Lesson } from '@/types';

type AuthMock = { user: unknown; profile: unknown; loading: boolean; isAdmin: boolean; configured: boolean };
let auth: AuthMock;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const setAuth = (a: Partial<AuthMock>) => {
  auth = { user: null, profile: null, loading: false, isAdmin: false, configured: true, ...a };
};

function renderRoutes(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/auth/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/onboarding" element={<div>ONBOARDING PAGE</div>} />
        <Route path="/dashboard" element={<div>DASHBOARD PAGE</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/practice" element={<div>PRACTICE PAGE</div>} />
        </Route>
        <Route element={<ProtectedRoute requireAdmin />}>
          <Route path="/admin" element={<div>ADMIN PAGE</div>} />
        </Route>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/auth/register" element={<div>REGISTER PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('protected routes', () => {
  it('sends signed-out visitors to login', () => {
    setAuth({});
    renderRoutes('/practice');
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('shows a loading state while the session is being checked (no flash of content)', () => {
    setAuth({ loading: true });
    renderRoutes('/practice');
    expect(screen.queryByText('PRACTICE PAGE')).not.toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('sends users who have not finished onboarding to onboarding', () => {
    setAuth({ user: { id: 'u1' }, profile: { onboarding_completed: false } });
    renderRoutes('/practice');
    expect(screen.getByText('ONBOARDING PAGE')).toBeInTheDocument();
  });

  it('lets onboarded users in', () => {
    setAuth({ user: { id: 'u1' }, profile: { onboarding_completed: true } });
    renderRoutes('/practice');
    expect(screen.getByText('PRACTICE PAGE')).toBeInTheDocument();
  });

  it('blocks non-admins from /admin and allows admins', () => {
    setAuth({ user: { id: 'u1' }, profile: { onboarding_completed: true }, isAdmin: false });
    renderRoutes('/admin');
    expect(screen.getByText('DASHBOARD PAGE')).toBeInTheDocument();
  });

  it('admins reach /admin', () => {
    setAuth({ user: { id: 'u1' }, profile: { onboarding_completed: true }, isAdmin: true });
    renderRoutes('/admin');
    expect(screen.getByText('ADMIN PAGE')).toBeInTheDocument();
  });

  it('keeps signed-in users away from the register page', () => {
    setAuth({ user: { id: 'u1' }, profile: { onboarding_completed: true } });
    renderRoutes('/auth/register');
    expect(screen.getByText('DASHBOARD PAGE')).toBeInTheDocument();
  });

  it('explains missing configuration instead of crashing', () => {
    setAuth({ configured: false });
    renderRoutes('/practice');
    expect(screen.getByText(/Supabase is not configured/i)).toBeInTheDocument();
  });
});

describe('TranscriptView', () => {
  it('renders both speakers accessibly', () => {
    render(
      <TranscriptView
        messages={[
          { id: 'a', role: 'teacher', text: 'What did you do yesterday?', final: true },
          { id: 'b', role: 'student', text: 'I went to the market.', final: true },
        ]}
      />,
    );
    const log = screen.getByRole('log', { name: /conversation transcript/i });
    expect(within(log).getByText('What did you do yesterday?')).toBeInTheDocument();
    expect(within(log).getByText('I went to the market.')).toBeInTheDocument();
    expect(log.querySelector('[data-role="student"]')).not.toBeNull();
    expect(log.querySelector('[data-role="teacher"]')).not.toBeNull();
  });

  it('shows a helpful empty state', () => {
    render(<TranscriptView messages={[]} />);
    expect(screen.getByText(/conversation will appear here/i)).toBeInTheDocument();
  });
});

describe('AudioVisualizer reflects real state', () => {
  const noop = () => 0;
  const labelFor = (state: Parameters<typeof AudioVisualizer>[0]['state'], muted = false) => {
    const { container, unmount } = render(<AudioVisualizer state={state} muted={muted} getMicLevel={noop} getAiLevel={noop} />);
    const source = container.querySelector('[data-source]')?.getAttribute('data-source');
    unmount();
    return source;
  };

  it('is idle when nothing is running (never pretends to listen)', () => {
    for (const s of ['idle', 'requesting_mic', 'connecting', 'error', 'completed', 'ending'] as const) expect(labelFor(s)).toBe('none');
  });

  it('shows the microphone only while a session is live and not muted', () => {
    expect(labelFor('listening')).toBe('mic');
    expect(labelFor('listening', true)).toBe('none');
  });

  it('shows the teacher while the AI is speaking', () => {
    expect(labelFor('ai_speaking')).toBe('ai');
  });
});

describe('UI components', () => {
  it('renders empty and error states', async () => {
    const onRetry = vi.fn();
    render(
      <>
        <EmptyState title="Nothing here" description="Start a lesson" />
        <ErrorState message="Boom" onRetry={onRetry} />
      </>,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('exposes progress values to assistive tech and clamps them', () => {
    render(<ProgressBar value={150} max={100} label="Goal" />);
    const bar = screen.getByRole('progressbar', { name: 'Goal' });
    expect(bar).toHaveAttribute('aria-valuenow', '150');
    expect((bar.firstChild as HTMLElement).style.width).toBe('100%');
  });

  it('confirm dialog is modal, closes on Escape and confirms on click', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Delete?" description="Sure?" onClose={onClose} onConfirm={onConfirm} confirmLabel="Yes, delete" />);
    expect(screen.getByRole('dialog', { name: 'Delete?' })).toHaveAttribute('aria-modal', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('disables a loading button so it cannot be double-submitted', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const b = screen.getByRole('button', { name: /save/i });
    expect(b).toBeDisabled();
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('lesson cards link to the lesson and show completion', () => {
    const lesson = { id: 'abc', title: 'To be', description: 'Learn am/is/are', level: 'beginner', estimated_minutes: 10 } as Lesson;
    render(
      <MemoryRouter>
        <LessonCard lesson={lesson} completed categoryName="Grammar" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/lessons/abc');
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Beginner')).toBeInTheDocument();
  });
});
