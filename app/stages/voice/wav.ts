// Responsibility: read and write 16-bit PCM mono WAV buffers (what ava-farsi returns) and measure their loudness envelope.

export interface Pcm { sampleRate: number; samples: Int16Array }

export class WavError extends Error {}

/** Parses a 16-bit PCM WAV; mixes extra channels down to mono. Tolerates a data size that is 0 or larger than the file (streamed WAV). */
export function parseWav(buf: Buffer): Pcm {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new WavError('not a RIFF/WAVE file');
  let pos = 12;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      if (buf.readUInt16LE(body) !== 1) throw new WavError('only PCM WAV is supported');
      channels = buf.readUInt16LE(body + 2);
      rate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      if (bits !== 16 || channels < 1 || rate <= 0) throw new WavError(`unsupported WAV format (${bits}-bit, ${channels} ch, ${rate} Hz)`);
      const end = size === 0 || body + size > buf.length ? buf.length : body + size;
      const frames = Math.floor((end - body) / (2 * channels));
      const samples = new Int16Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += buf.readInt16LE(body + (i * channels + c) * 2);
        samples[i] = Math.round(sum / channels);
      }
      return { sampleRate: rate, samples };
    }
    pos = body + size + (size % 2);
  }
  throw new WavError('WAV has no data chunk');
}

export function encodeWav(pcm: Pcm): Buffer {
  const data = pcm.samples.length * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(pcm.sampleRate, 24);
  b.writeUInt32LE(pcm.sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(data, 40);
  for (let i = 0; i < pcm.samples.length; i++) b.writeInt16LE(pcm.samples[i]!, 44 + i * 2);
  return b;
}

export const FRAME_S = 0.01;

/** RMS level in dBFS for each 10 ms frame (−120 for digital silence). */
export function envelopeDb(pcm: Pcm): number[] {
  const n = Math.max(1, Math.round(pcm.sampleRate * FRAME_S));
  const out: number[] = [];
  for (let s = 0; s < pcm.samples.length; s += n) {
    let acc = 0;
    const e = Math.min(pcm.samples.length, s + n);
    for (let i = s; i < e; i++) { const v = pcm.samples[i]! / 32768; acc += v * v; }
    const rms = Math.sqrt(acc / (e - s));
    out.push(rms > 1e-6 ? 20 * Math.log10(rms) : -120);
  }
  return out;
}

export const durationS = (pcm: Pcm): number => pcm.samples.length / pcm.sampleRate;
