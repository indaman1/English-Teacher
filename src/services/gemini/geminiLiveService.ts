import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { VoiceError, fromLiveClose } from '@/features/voice/errors';
import { INPUT_MIME_TYPE } from '@/features/voice/pcm';

export interface LiveConnectOptions {
  /** Short-lived ephemeral token from our Edge Function (NOT the permanent API key). */
  token: string;
  model: string;
  systemInstruction: string;
  voiceName: string;
  /** Present when resuming an earlier connection of the same lesson. */
  resumptionHandle?: string;
}

export interface LiveEvents {
  onOpen: () => void;
  /** base64 24 kHz PCM16 audio from the teacher */
  onAudio: (base64Pcm: string) => void;
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onInterrupted: () => void;
  onTurnComplete: () => void;
  onResumptionHandle: (handle: string) => void;
  /** Server says the connection will be closed soon — reconnect with the resumption handle. */
  onGoAway: () => void;
  /** Connection closed. userInitiated is true when we called close(). */
  onClose: (error: VoiceError | null, userInitiated: boolean) => void;
  onError: (error: VoiceError) => void;
}

/**
 * Thin wrapper around the official @google/genai Live API client.
 * Browser → Gemini Live directly over WebSocket, authenticated with an ephemeral token (API version v1beta).
 */
export class GeminiLiveService {
  private session: Session | null = null;
  private closedByUser = false;
  private open = false;

  get isOpen(): boolean {
    return this.open && this.session !== null;
  }

  async connect(options: LiveConnectOptions, events: LiveEvents): Promise<void> {
    if (this.session) throw new VoiceError('unknown', 'A live session is already open.'); // no duplicate sessions
    this.closedByUser = false;

    const ai = new GoogleGenAI({ apiKey: options.token, httpOptions: { apiVersion: 'v1alpha' } });

    try {
      this.session = await ai.live.connect({
        model: options.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: options.systemInstruction,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voiceName } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          sessionResumption: options.resumptionHandle ? { handle: options.resumptionHandle } : {},
        },
        callbacks: {
          onopen: () => {
            this.open = true;
            events.onOpen();
          },
          onmessage: (message: LiveServerMessage) => this.handleMessage(message, events),
          onerror: (e: ErrorEvent) => {
            console.warn('[live] socket error:', e?.message);
            console.warn('[live] socket error:', e?.message);
            console.warn('[live] socket error:', e?.message);
            events.onError(fromLiveClose(e?.message));
          },
          onclose: (e: CloseEvent) => {
            if (!this.closedByUser) console.warn('[live] closed:', e?.code, e?.reason);
            if (!this.closedByUser) console.warn('[live] closed:', e?.code, e?.reason);
            if (!this.closedByUser) console.warn('[live] closed:', e?.code, e?.reason);
            const userInitiated = this.closedByUser;
            this.open = false;
            this.session = null;
            const err = userInitiated ? null : fromLiveClose(e?.reason, e?.wasClean && e?.code === 1000);
            events.onClose(err, userInitiated);
          },
        },
      });
    } catch (err) {
      this.session = null;
      this.open = false;
      throw fromLiveClose((err as Error | undefined)?.message);
    }
  }

  private handleMessage(message: LiveServerMessage, events: LiveEvents): void {
    const content = message.serverContent;
    if (content) {
      if (content.interrupted) events.onInterrupted();

      const parts = content.modelTurn?.parts ?? [];
      for (const part of parts) {
        const data = part.inlineData?.data;
        if (data) events.onAudio(data);
      }

      if (content.inputTranscription?.text) events.onInputTranscript(content.inputTranscription.text);
      if (content.outputTranscription?.text) events.onOutputTranscript(content.outputTranscription.text);
      if (content.turnComplete) events.onTurnComplete();
    }

    const handle = message.sessionResumptionUpdate;
    if (handle?.resumable && handle.newHandle) events.onResumptionHandle(handle.newHandle);

    if (message.goAway) events.onGoAway();
  }

  /** Stream a chunk of microphone audio (base64, 16 kHz PCM16). */
  sendAudio(base64Pcm: string): void {
    if (!this.isOpen) return;
    try {
      this.session?.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: INPUT_MIME_TYPE } });
    } catch {
      /* the close handler reports connection problems */
    }
  }

  /** Send a text turn (used once, to make the teacher greet the student first). */
  sendText(text: string): void {
    if (!this.isOpen) return;
    try {
      this.session?.sendRealtimeInput({ text });
    } catch {
      /* ignored — student can simply speak first */
    }
  }

  close(): void {
    this.closedByUser = true;
    this.open = false;
    const s = this.session;
    this.session = null;
    try {
      s?.close();
    } catch {
      /* already closed */
    }
  }
}
