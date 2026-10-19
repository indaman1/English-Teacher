// AudioWorklet that collects microphone samples into ~40ms Float32 chunks
// and posts them to the main thread (which downsamples to 16 kHz PCM16).
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = Math.round(sampleRate * 0.04);
    this.buffer = new Float32Array(this.chunkSize);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let i = 0;
    while (i < channel.length) {
      const n = Math.min(channel.length - i, this.chunkSize - this.offset);
      this.buffer.set(channel.subarray(i, i + n), this.offset);
      this.offset += n;
      i += n;
      if (this.offset >= this.chunkSize) {
        const out = this.buffer;
        this.port.postMessage(out, [out.buffer]);
        this.buffer = new Float32Array(this.chunkSize);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
