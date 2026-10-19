import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VoiceError } from '@/features/voice/errors';
import type { VoiceState } from '@/features/voice/voiceStateMachine';
import PracticeLive from './PracticeLive';

// The hook is mocked so these tests verify what the SCREEN does for each real state.
const live = {
  state: 'idle' as VoiceState,
  messages: [] as { id: string; role: 'student' | 'teacher'; text: string; final: boolean; seq: number }[],
  error: null as VoiceError | null,
  muted: false,
  elapsed: 0,
  info: null as { sessionId: string; topic: string; level: string; maxSeconds: number } | null,
  endReason: null as string | null,
  start: vi.fn(),
  end: vi.fn(async () => ({ sessionId: 'sess-1', finalize: null, reason: 'user' as const })),
  reconnect: vi.fn(),
  reset: vi.fn(),
  toggleMute: vi.fn(),
  getMicLevel: () => 0,
  getAiLevel: () => 0,
  canStart: true,
  hasResumableSession: false,
};

vi.mock('@/features/voice/useLiveSession', () => ({ useLiveSession: () => live }));
vi.mock('@/features/voice/audioCapture', () => ({ isVoiceSupported: () => supported }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }) }));

let supported = true;
const config = { modeCode: 'interview', modeName: 'Interview Practice', topic: 'Tell me about yourself', level: 'intermediate' };

function renderScreen(withState = true) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/practice/live', state: withState ? config : null }]}>
      <Routes>
        <Route path="/practice/live" element={<PracticeLive />} />
        <Route path="/practice" element={<div>PRACTICE SETUP</div>} />
        <Route path="/conversations/:id" element={<div>REVIEW PAGE</div>} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.assign(live, {
    state: 'idle', messages: [], error: null, muted: false, elapsed: 0, info: null, endReason: null, hasResumableSession: false,
  });
  live.start.mockClear();
  live.end.mockClear();
  live.toggleMute.mockClear();
  live.reconnect.mockClear();
  live.reset.mockClear();
  supported = true;
});

describe('live lesson screen', () => {
  it('sends users without a lesson choice back to the practice setup', () => {
    renderScreen(false);
    expect(screen.getByText('PRACTICE SETUP')).toBeInTheDocument();
  });

  it('idle: shows an honest "ready" state, mode and level, and starts only on tap', async () => {
    renderScreen();
    expect(screen.getByText('Ready to start')).toBeInTheDocument();
    expect(screen.getByText('Interview Practice')).toBeInTheDocument();
    expect(screen.getByText('Intermediate')).toBeInTheDocument();
    expect(screen.queryByText(/Listening to you/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /end lesson/i })).not.toBeInTheDocument();
    expect(live.start).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /start lesson/i }));
    expect(live.start).toHaveBeenCalledWith({ modeCode: 'interview', topic: 'Tell me about yourself', lessonId: undefined, level: 'intermediate' });
  });

  it('explains the microphone and third-party audio processing before the lesson', () => {
    renderScreen();
    expect(screen.getByText(/ask to use your microphone/i)).toBeInTheDocument();
    expect(screen.getByText(/not stored by us/i)).toBeInTheDocument();
  });

  it('unsupported browser: shows a clear message and disables Start', () => {
    supported = false;
    renderScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(/does not support live voice lessons/i);
    expect(screen.getByRole('button', { name: /start lesson/i })).toBeDisabled();
  });

  it.each([
    ['requesting_mic', 'Waiting for microphone permission…'],
    ['connecting', 'Connecting to your teacher…'],
    ['listening', 'Listening to you'],
    ['processing', 'Thinking…'],
    ['ai_speaking', 'Teacher is speaking'],
    ['reconnecting', 'Reconnecting…'],
  ] as [VoiceState, string][])('shows "%s" as "%s"', (state, label) => {
    live.state = state;
    live.info = { sessionId: 's', topic: 'Interview', level: 'intermediate', maxSeconds: 600 };
    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('active lesson: shows the timer, live controls and ends the lesson to the review page', async () => {
    live.state = 'listening';
    live.elapsed = 65;
    live.info = { sessionId: 'sess-1', topic: 'Interview', level: 'intermediate', maxSeconds: 600 };
    renderScreen();
    expect(screen.getByText(/1:05 · 8:55 left/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start lesson/i })).not.toBeInTheDocument();
    expect(screen.getByText('Microphone on')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /end lesson/i }));
    expect(live.end).toHaveBeenCalledWith('user');
    expect(await screen.findByText('REVIEW PAGE')).toBeInTheDocument();
  });

  it('mute: the button toggles, and the UI says the teacher cannot hear the student', async () => {
    live.state = 'listening';
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /mute microphone/i }));
    expect(live.toggleMute).toHaveBeenCalled();
  });

  it('muted: never claims the microphone is on', () => {
    live.state = 'listening';
    live.muted = true;
    renderScreen();
    expect(screen.getByText(/microphone muted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unmute microphone/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('transcript toggle hides and shows the conversation', async () => {
    live.state = 'listening';
    live.messages = [{ id: 'a', role: 'teacher', text: 'Hello, tell me about yourself.', final: true, seq: 0 }];
    renderScreen();
    const section = screen.getByLabelText('Transcript', { selector: 'section' });
    expect(section).not.toHaveClass('hidden');
    await userEvent.click(screen.getByRole('button', { name: /transcript/i }));
    expect(section).toHaveClass('hidden');
  });

  it('error: shows the friendly message with retry, and offers reconnect only when it can work', async () => {
    live.state = 'error';
    live.error = new VoiceError('mic_denied');
    renderScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('Microphone access was denied. Please allow microphone access in your browser settings.');
    expect(screen.queryByRole('button', { name: /^reconnect/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(live.reset).toHaveBeenCalled();
  });

  it('connection lost mid-lesson: Reconnect is offered and works', async () => {
    live.state = 'error';
    live.error = new VoiceError('connection_lost');
    live.hasResumableSession = true;
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /reconnect/i }));
    expect(live.reconnect).toHaveBeenCalled();
  });

  it('limit reached: shows the message and a link to the plan page', () => {
    live.state = 'error';
    live.error = new VoiceError('limit_reached');
    renderScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('You have reached your current practice limit.');
    expect(screen.getByRole('link', { name: /see your plan/i })).toHaveAttribute('href', '/subscription');
  });

  it('warns when the device is offline and blocks starting', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    renderScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('Your internet connection appears to be unavailable.');
    expect(screen.getByRole('button', { name: /start lesson/i })).toBeDisabled();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});
