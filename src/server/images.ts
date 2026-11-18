import { randomUUID } from 'node:crypto';
import { MAX_IMAGE_BYTES, MAX_IMAGE_DATA_URL_CHARS, MAX_ROOM_IMAGE_BYTES } from '../shared/types';

type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/svg+xml';

interface StoredImage {
  id: string;
  buffer: Buffer;
  mime: ImageMime;
  bytes: number;
  roomCode: string | null;
  createdAt: number;
}

export interface ImageAddResult {
  ok: true;
  id: string;
  bytes: number;
}

export interface ImageError {
  ok: false;
  error: string;
}

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

function detectMime(buffer: Buffer): ImageMime | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function declaredMimeMatches(declared: string, detected: ImageMime): boolean {
  const normalized = declared === 'image/jpg' ? 'image/jpeg' : declared;
  return normalized === detected;
}

export function buildPlaceholderSvg(): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="#f4eddf"/>
  <g opacity="0.14" stroke="#17130f" stroke-width="2">
    ${Array.from({ length: 18 }, (_, i) => `<line x1="${i * 64 - 400}" y1="1080" x2="${i * 64 + 200}" y2="0"/>`).join('')}
  </g>
  <rect x="54" y="54" width="972" height="972" fill="none" stroke="#17130f" stroke-width="7"/>
  <circle cx="540" cy="410" r="192" fill="#ff5b35" stroke="#17130f" stroke-width="7"/>
  <path d="M470 362c30-46 110-46 140 0" fill="none" stroke="#f4eddf" stroke-width="15" stroke-linecap="round"/>
  <circle cx="486" cy="416" r="13" fill="#17130f"/>
  <circle cx="594" cy="416" r="13" fill="#17130f"/>
  <path d="M452 500c48 34 128 34 176 0" fill="none" stroke="#17130f" stroke-width="14" stroke-linecap="round"/>
  <text x="540" y="714" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="104" fill="#17130f">NO IMAGE</text>
  <text x="540" y="788" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="38" letter-spacing="4" fill="#17130f">THEY CHICKENED OUT</text>
  <rect x="330" y="850" width="420" height="76" rx="38" fill="#3355ff" stroke="#17130f" stroke-width="5"/>
  <text x="540" y="900" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="26" letter-spacing="5" fill="#fff">DA ROOM · AUTO PANEL</text>
</svg>`;
  return Buffer.from(svg, 'utf8');
}

export class ImageStore {
  private images = new Map<string, StoredImage>();
  private bytesByRoom = new Map<string, number>();
  readonly placeholderId: string;

  constructor() {
    this.placeholderId = randomUUID();
    const buffer = buildPlaceholderSvg();
    this.images.set(this.placeholderId, {
      id: this.placeholderId,
      buffer,
      mime: 'image/svg+xml',
      bytes: buffer.byteLength,
      roomCode: null,
      createdAt: Date.now(),
    });
  }

  addFromDataUrl(dataUrl: unknown, roomCode: string): ImageAddResult | ImageError {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return { ok: false, error: 'That is not a supported image.' };
    }
    if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
      return { ok: false, error: 'Image is too large. Please choose a smaller image.' };
    }
    const match = DATA_URL_PATTERN.exec(dataUrl);
    if (!match) {
      return { ok: false, error: 'Image data is malformed. Try pasting or uploading it again.' };
    }
    const declared = match[1].toLowerCase();
    let buffer: Buffer;
    try {
      buffer = Buffer.from(match[2], 'base64');
    } catch {
      return { ok: false, error: 'Image data could not be decoded.' };
    }
    if (buffer.byteLength < 32) {
      return { ok: false, error: 'That image looks empty or broken.' };
    }
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return { ok: false, error: 'Image is too large after processing (max 2 MB).' };
    }
    const detected = detectMime(buffer);
    if (!detected || detected === 'image/svg+xml' || !declaredMimeMatches(declared, detected)) {
      return { ok: false, error: 'Only PNG, JPEG, WebP, or GIF images are supported.' };
    }
    const roomBytes = this.bytesByRoom.get(roomCode) ?? 0;
    if (roomBytes + buffer.byteLength > MAX_ROOM_IMAGE_BYTES) {
      return { ok: false, error: 'This room’s image memory is full. Start a fresh room to keep playing.' };
    }

    const id = randomUUID();
    this.images.set(id, {
      id,
      buffer,
      mime: detected,
      bytes: buffer.byteLength,
      roomCode,
      createdAt: Date.now(),
    });
    this.bytesByRoom.set(roomCode, roomBytes + buffer.byteLength);
    return { ok: true, id, bytes: buffer.byteLength };
  }

  get(id: string): StoredImage | undefined {
    return this.images.get(id);
  }

  removeRoom(roomCode: string): void {
    for (const [id, image] of this.images) {
      if (image.roomCode === roomCode) this.images.delete(id);
    }
    this.bytesByRoom.delete(roomCode);
  }
}
