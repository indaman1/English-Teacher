// PCM helpers. Gemini Live input: raw 16-bit little-endian PCM, 16 kHz, mono.
// Gemini Live output: raw 16-bit little-endian PCM, 24 kHz, mono.

export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;
export const INPUT_MIME_TYPE = `audio/pcm;rate=${INPUT_SAMPLE_RATE}`;

/** Float32 samples in [-1, 1] → signed 16-bit PCM (clamped). */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Signed 16-bit PCM → Float32 samples in [-1, 1). */
export function int16ToFloat32(input: Int16Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] / 0x8000;
  return out;
}

/** Downsample by averaging each output sample's source window (acts as a cheap low-pass filter). */
export function downsample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (outputRate === inputRate) return input;
  if (outputRate > inputRate) throw new Error('downsample: output rate must not exceed input rate');
  const ratio = inputRate / outputRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

export function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const len = binary.length - (binary.length % 2); // drop a dangling odd byte rather than throw
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  // Copy to a fresh aligned buffer; Int16Array views require 2-byte alignment.
  return new Int16Array(bytes.buffer, 0, len / 2);
}

/** Root-mean-square level (0..1) of a Float32 buffer. */
export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}
