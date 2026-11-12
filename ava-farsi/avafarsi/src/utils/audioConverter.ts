import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * Converts a base64 encoded WAV string (or ArrayBuffer) into an MP3 Blob.
 * Parses the WAV header to extract channel count, sample rate, and 16-bit PCM samples.
 */
export async function convertWavToMp3Blob(
  wavBase64: string,
  kbps = 128
): Promise<{ blob: Blob; base64: string }> {
  const binaryString = atob(wavBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Parse channels and sample rate from WAV header
  let channels = 1;
  let sampleRate = 24000;
  let pcmOffset = 44;

  try {
    // Check 'RIFF' header
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46
    ) {
      channels = view.getUint16(22, true) || 1;
      sampleRate = view.getUint32(24, true) || 24000;

      // Find 'data' subchunk offset
      for (let i = 12; i < bytes.length - 8; i++) {
        if (
          bytes[i] === 0x64 &&
          bytes[i + 1] === 0x61 &&
          bytes[i + 2] === 0x74 &&
          bytes[i + 3] === 0x61
        ) {
          pcmOffset = i + 8;
          break;
        }
      }
    }
  } catch (err) {
    console.warn('WAV header parse warning, using defaults:', err);
  }

  // Extract signed 16-bit PCM samples
  const pcmBytesLength = bytes.length - pcmOffset;
  const sampleCount = Math.floor(pcmBytesLength / 2);
  const samples = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    samples[i] = view.getInt16(pcmOffset + i * 2, true);
  }

  const encoder = new Mp3Encoder(channels, sampleRate, kbps);
  const mp3Chunks: Uint8Array[] = [];

  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Chunks.push(new Uint8Array(mp3buf));
    }
  }

  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Chunks.push(new Uint8Array(flushBuf));
  }

  const totalLength = mp3Chunks.reduce((acc, curr) => acc + curr.length, 0);
  const mergedMp3 = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Chunks) {
    mergedMp3.set(chunk, offset);
    offset += chunk.length;
  }

  const blob = new Blob([mergedMp3], { type: 'audio/mp3' });

  // Convert to base64
  let binary = '';
  const len = mergedMp3.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(mergedMp3[i]);
  }
  const base64 = btoa(binary);

  return { blob, base64 };
}
