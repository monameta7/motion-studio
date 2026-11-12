import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

function createPng(width, height, r, g, b, a = 255) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data: scanline filter byte (0) + width * 4 bytes per row
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.42;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // No filter

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Distance from center
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Gold soundwave bars logic
      const inCircle = dist <= radius;
      const inBar = Math.abs(dx) < width * 0.35 && Math.abs(dy) < height * 0.3 && (Math.abs(dx) % 18 < 10);

      if (inBar) {
        rawData[pixelOffset] = 245;     // Amber R
        rawData[pixelOffset + 1] = 158; // Amber G
        rawData[pixelOffset + 2] = 11;  // Amber B
        rawData[pixelOffset + 3] = 255;
      } else if (inCircle) {
        rawData[pixelOffset] = 17;      // Dark slate
        rawData[pixelOffset + 1] = 24;
        rawData[pixelOffset + 2] = 39;
        rawData[pixelOffset + 3] = 255;
      } else {
        rawData[pixelOffset] = 11;      // Background deep slate
        rawData[pixelOffset + 1] = 15;
        rawData[pixelOffset + 2] = 25;
        rawData[pixelOffset + 3] = 255;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(8 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + length));
  chunk.writeInt32BE(crc, 8 + length);
  return chunk;
}

// Standard CRC32
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return crc ^ -1;
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, 245, 158, 11));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, 245, 158, 11));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, 245, 158, 11));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, 245, 158, 11));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createPng(32, 32, 245, 158, 11));

console.log('Generated all PWA icons successfully in public/');
