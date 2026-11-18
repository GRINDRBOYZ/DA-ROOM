import {
  CLIENT_IMAGE_TARGET_CHARS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DATA_URL_CHARS,
} from '../shared/types';

export interface PreparedImage {
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  originalType: string;
  animated: boolean;
}

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EXTENSION_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

function fileType(file: File): string {
  if (SUPPORTED_TYPES.has(file.type)) return file.type;
  if (file.type === 'image/jpg') return 'image/jpeg';
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? file.type;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function loadDrawable(
  file: File,
): Promise<{ drawable: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to an <img> decoder.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The image could not be decoded.'));
      element.src = objectUrl;
    });
    return {
      drawable: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function renderToJpeg(
  drawable: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  quality: number,
): { dataUrl: string; width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not process this image.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(drawable, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width, height };
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const type = fileType(file);
  if (!SUPPORTED_TYPES.has(type)) {
    throw new Error('Use a PNG, JPEG, WebP, or GIF image.');
  }
  if (file.size === 0) {
    throw new Error('That image file is empty.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That file is over 25 MB. Pick a smaller image.');
  }

  let loaded: Awaited<ReturnType<typeof loadDrawable>>;
  try {
    loaded = await loadDrawable(file);
  } catch {
    throw new Error('That image could not be read. Try another file.');
  }

  // Animated GIFs cannot be resized in-browser without losing the animation.
  // Small ones are kept byte-for-byte; larger ones fall back to a still frame.
  if (type === 'image/gif' && file.size <= MAX_IMAGE_BYTES) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Could not read the GIF.'));
        reader.readAsDataURL(file);
      });
      const result: PreparedImage = {
        dataUrl,
        bytes: file.size,
        width: loaded.width,
        height: loaded.height,
        originalType: type,
        animated: true,
      };
      loaded.cleanup();
      return result;
    } catch {
      // Fall through to the still-frame conversion below.
    }
  }

  try {
    if (!loaded.width || !loaded.height) throw new Error('That image has no readable size.');
    let maxDimension = 1280;
    let quality = 0.86;
    let rendered = renderToJpeg(loaded.drawable, loaded.width, loaded.height, maxDimension, quality);

    for (let attempt = 0; attempt < 16 && rendered.dataUrl.length > CLIENT_IMAGE_TARGET_CHARS; attempt++) {
      if (quality > 0.64) {
        quality = Math.max(0.64, quality - 0.07);
      } else {
        maxDimension = Math.max(420, Math.round(maxDimension * 0.84));
        quality = 0.78;
      }
      rendered = renderToJpeg(loaded.drawable, loaded.width, loaded.height, maxDimension, quality);
    }

    if (rendered.dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
      throw new Error('This image could not be compressed below 2 MB. Try a smaller one.');
    }

    const base64Length = rendered.dataUrl.length - rendered.dataUrl.indexOf(',') - 1;
    return {
      dataUrl: rendered.dataUrl,
      bytes: Math.round(base64Length * 0.75),
      width: rendered.width,
      height: rendered.height,
      originalType: type,
      animated: false,
    };
  } finally {
    loaded.cleanup();
  }
}

/** Compress a drawing canvas to the same limits as an uploaded panel. */
export function prepareCanvas(canvas: HTMLCanvasElement): PreparedImage {
  if (!canvas.width || !canvas.height) {
    throw new Error('The drawing is empty.');
  }

  const render = (width: number, height: number, quality: number) => {
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const context = output.getContext('2d');
    if (!context) throw new Error('Your browser could not export the drawing.');
    context.fillStyle = '#fffaf1';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(canvas, 0, 0, width, height);
    return output.toDataURL('image/jpeg', quality);
  };

  let width = Math.min(1280, canvas.width);
  let height = Math.round((canvas.height / canvas.width) * width);
  let quality = 0.86;
  let dataUrl = render(width, height, quality);

  for (let attempt = 0; attempt < 16 && dataUrl.length > CLIENT_IMAGE_TARGET_CHARS; attempt++) {
    if (quality > 0.6) {
      quality = Math.max(0.6, quality - 0.06);
    } else {
      width = Math.max(420, Math.round(width * 0.84));
      height = Math.max(1, Math.round((canvas.height / canvas.width) * width));
      quality = 0.78;
    }
    dataUrl = render(width, height, quality);
  }

  if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
    throw new Error('That drawing is too detailed to save. Undo a few strokes and try again.');
  }

  const base64Length = dataUrl.length - dataUrl.indexOf(',') - 1;
  return {
    dataUrl,
    bytes: Math.round(base64Length * 0.75),
    width,
    height,
    originalType: 'image/jpeg',
    animated: false,
  };
}

export function clipboardImageFile(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

export async function readClipboardImage(): Promise<File | null> {
  if (!navigator.clipboard || !('read' in navigator.clipboard)) {
    throw new Error('This browser cannot read the clipboard directly. Use Ctrl+V / ⌘V instead.');
  }
  const clipboardItems = await navigator.clipboard.read();
  for (const item of clipboardItems) {
    for (const type of item.types) {
      if (type.startsWith('image/')) {
        const blob = await item.getType(type);
        const extension = type.split('/')[1] || 'png';
        return new File([blob], `pasted-image.${extension}`, { type });
      }
    }
  }
  return null;
}
