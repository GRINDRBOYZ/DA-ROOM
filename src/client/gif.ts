import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { DEFAULT_TEXT_POSITION, type ChainView, type PanelView, type TextPosition } from '../shared/types';

const WIDTH = 720;
const HEIGHT = 900;
const MARGIN = 44;
const PAPER = '#f4ede0';
const CARD = '#fffaf1';
const INK = '#17130f';
const ORANGE = '#ff5b35';
const BLUE = '#3355ff';
const YELLOW = '#f6c945';

export interface GifOptions {
  panelDelayMs: number;
}

export interface GifProgress {
  done: number;
  total: number;
  label: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A panel image could not be loaded for the GIF.'));
    image.src = url;
  });
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

interface FitTextOptions {
  maxSize: number;
  minSize: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  lineHeight?: number;
  maxLines?: number;
}

function drawFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: FitTextOptions,
) {
  const {
    maxSize,
    minSize,
    weight = 800,
    color = INK,
    align = 'center',
    lineHeight = 1.08,
    maxLines = 8,
  } = options;
  let size = maxSize;
  let lines: string[] = [];
  while (size >= minSize) {
    context.font = `${weight} ${size}px "Arial Black", "Segoe UI", Arial, sans-serif`;
    lines = wrapLines(context, text, width);
    if (lines.length <= maxLines && lines.length * size * lineHeight <= height) break;
    size -= 2;
  }
  if (lines.length > maxLines) lines = lines.slice(0, maxLines);
  const total = lines.length * size * lineHeight;
  let cursor = y + Math.max(0, (height - total) / 2) + size * 0.86;
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = 'alphabetic';
  for (const line of lines) {
    context.fillText(line, align === 'center' ? x + width / 2 : x, cursor);
    cursor += size * lineHeight;
  }
}

function drawBackground(context: CanvasRenderingContext2D) {
  context.fillStyle = PAPER;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = 'rgba(23, 19, 15, 0.08)';
  for (let y = 18; y < HEIGHT; y += 24) {
    for (let x = 18 + ((y / 24) % 2) * 12; x < WIDTH; x += 24) {
      context.beginPath();
      context.arc(x, y, 1.4, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawHeader(context: CanvasRenderingContext2D, chain: ChainView, panelIndex: number | null) {
  context.fillStyle = INK;
  roundRect(context, MARGIN, 32, 132, 38, 19);
  context.fill();
  context.fillStyle = CARD;
  context.font = '900 20px "Arial Black", Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('DA ROOM', MARGIN + 66, 52);

  context.fillStyle = INK;
  context.font = '800 17px "Cascadia Mono", Consolas, monospace';
  context.textAlign = 'right';
  context.fillText(`CHAIN ${String(chain.index).padStart(2, '0')}`, WIDTH - MARGIN, 44);
  context.fillStyle = '#6d6155';
  context.font = '600 13px "Cascadia Mono", Consolas, monospace';
  context.fillText(
    panelIndex === null ? `${chain.panels.length} PANELS` : `PANEL ${panelIndex + 1} / ${chain.panels.length}`,
    WIDTH - MARGIN,
    66,
  );
}

function drawCaption(
  context: CanvasRenderingContext2D,
  panel: PanelView,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!panel.caption || !panel.captionKind) return;
  const isCall = panel.captionKind === 'call';
  context.save();
  context.fillStyle = isCall ? INK : YELLOW;
  roundRect(context, x, y, width, height, 6);
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.stroke();

  context.fillStyle = isCall ? 'rgba(255, 250, 241, 0.65)' : 'rgba(23, 19, 15, 0.62)';
  context.font = '800 12px "Cascadia Mono", Consolas, monospace';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillText(panel.captionKind.toUpperCase(), x + 14, y + 10);

  drawFittedText(
    context,
    panel.caption,
    x + 16,
    y + 20,
    width - 32,
    height - 26,
    {
      maxSize: 29,
      minSize: 15,
      weight: 800,
      color: isCall ? CARD : INK,
      maxLines: 2,
    },
  );

  const tagSize = 24;
  context.fillStyle = isCall ? BLUE : ORANGE;
  context.beginPath();
  context.arc(x + width - 16, y + 16, tagSize / 2, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = isCall ? '#fff' : INK;
  context.font = '900 13px "Arial Black", Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(isCall ? 'C' : 'A', x + width - 16, y + 17);
  context.restore();
}

function drawImagePanel(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.save();
  context.fillStyle = '#211b16';
  roundRect(context, x, y, width, height, 6);
  context.fill();
  context.clip();
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
  context.strokeStyle = INK;
  context.lineWidth = 3;
  roundRect(context, x, y, width, height, 6);
  context.stroke();
}

function drawImpactText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  position: TextPosition,
) {
  const padding = Math.max(18, Math.round(width * 0.055));
  const availableWidth = Math.max(40, width - padding * 2);
  const availableHeight = Math.max(40, height - padding * 2);
  const rightAligned = position.endsWith('right');
  const topAligned = position.startsWith('top');

  let fontSize = Math.min(Math.round(width * 0.13), Math.round(height * 0.13), 64);
  fontSize = Math.max(fontSize, 20);
  let lines: string[] = [];
  let lineHeight = fontSize * 1.06;
  let totalHeight = 0;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    context.font = `900 ${fontSize}px Impact, "Arial Black", "Arial Narrow", sans-serif`;
    lines = wrapLines(context, text, availableWidth);
    lineHeight = fontSize * 1.06;
    totalHeight = lines.length * lineHeight;
    if (totalHeight <= availableHeight || fontSize <= 16) break;
    fontSize = Math.max(16, Math.round(fontSize * 0.88));
  }

  context.save();
  context.font = `900 ${fontSize}px Impact, "Arial Black", "Arial Narrow", sans-serif`;
  context.textAlign = rightAligned ? 'right' : 'left';
  context.textBaseline = 'top';
  context.lineJoin = 'round';
  context.miterLimit = 2;
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#000000';
  context.lineWidth = Math.max(4, Math.round(fontSize * 0.14));

  const startX = rightAligned ? x + width - padding : x + padding;
  const startY = topAligned
    ? y + padding
    : y + height - padding - totalHeight;

  lines.forEach((line, index) => {
    if (!line) return;
    const lineY = startY + index * lineHeight;
    context.strokeText(line, startX, lineY);
    context.fillText(line, startX, lineY);
  });
  context.restore();
}

function drawTextPanel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  background: HTMLImageElement | null,
  position: TextPosition,
) {
  context.save();
  context.fillStyle = '#211b16';
  roundRect(context, x, y, width, height, 6);
  context.fill();
  if (background) {
    roundRect(context, x, y, width, height, 6);
    context.clip();
    const scale = Math.max(width / background.naturalWidth, height / background.naturalHeight);
    const drawWidth = background.naturalWidth * scale;
    const drawHeight = background.naturalHeight * scale;
    context.drawImage(
      background,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  }
  context.restore();

  context.strokeStyle = INK;
  context.lineWidth = 3;
  roundRect(context, x, y, width, height, 6);
  context.stroke();

  drawImpactText(context, text, x, y, width, height, position);
}

interface PanelFrameOptions {
  chain: ChainView;
  panel: PanelView;
  panelIndex: number;
  image: HTMLImageElement | null;
}

function drawPanelFrame(
  context: CanvasRenderingContext2D,
  options: PanelFrameOptions,
) {
  const { chain, panel, panelIndex, image } = options;
  drawBackground(context);
  drawHeader(context, chain, panelIndex);

  context.fillStyle = INK;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = '900 34px "Arial Black", Arial, sans-serif';
  context.fillText(`${chain.ownerName}'s chain`, MARGIN, 118);

  const cardX = MARGIN;
  const cardY = 142;
  const cardWidth = WIDTH - MARGIN * 2;
  const cardHeight = 630;
  const padding = 20;
  const captionHeight = 82;
  const hasCall = panel.captionKind === 'call';
  const hasAnswer = panel.captionKind === 'answer';
  const imageX = cardX + padding;
  const imageY = cardY + padding + (hasCall ? captionHeight + 12 : 0);
  const imageWidth = cardWidth - padding * 2;
  const imageHeight = cardHeight - padding * 2 - (hasCall ? captionHeight + 12 : 0) - (hasAnswer ? captionHeight + 12 : 0);

  context.fillStyle = CARD;
  roundRect(context, cardX, cardY, cardWidth, cardHeight, 10);
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.stroke();

  if (hasCall) {
    drawCaption(context, panel, imageX, cardY + padding, imageWidth, captionHeight);
  }
  if (image && panel.text) {
    drawTextPanel(
      context,
      panel.text,
      imageX,
      imageY,
      imageWidth,
      imageHeight,
      image,
      panel.textPosition ?? DEFAULT_TEXT_POSITION,
    );
  } else if (image) {
    drawImagePanel(context, image, imageX, imageY, imageWidth, imageHeight);
  } else if (panel.text) {
    drawTextPanel(
      context,
      panel.text,
      imageX,
      imageY,
      imageWidth,
      imageHeight,
      null,
      panel.textPosition ?? DEFAULT_TEXT_POSITION,
    );
  }
  if (hasAnswer) {
    drawCaption(
      context,
      panel,
      imageX,
      cardY + cardHeight - padding - captionHeight,
      imageWidth,
      captionHeight,
    );
  }

  context.fillStyle = '#6d6155';
  context.font = '700 13px "Cascadia Mono", Consolas, monospace';
  context.textAlign = 'left';
  context.fillText(`BY ${panel.authorName.toUpperCase()}`, MARGIN, 822);
  context.textAlign = 'right';
  context.fillText(panel.auto ? 'AUTO PANEL' : 'MADE IN DA ROOM', WIDTH - MARGIN, 822);
}

function drawTitleFrame(context: CanvasRenderingContext2D, chain: ChainView) {
  context.fillStyle = BLUE;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = 'rgba(255, 255, 255, 0.14)';
  for (let x = -HEIGHT; x < WIDTH + HEIGHT; x += 64) {
    context.save();
    context.translate(x, 0);
    context.rotate(-0.55);
    context.fillRect(0, -200, 22, HEIGHT + 400);
    context.restore();
  }

  context.fillStyle = CARD;
  context.strokeStyle = INK;
  context.lineWidth = 4;
  roundRect(context, 70, 110, WIDTH - 140, HEIGHT - 220, 20);
  context.fill();
  context.stroke();

  context.fillStyle = ORANGE;
  roundRect(context, 110, 156, 250, 52, 26);
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = CARD;
  context.font = '900 24px "Arial Black", Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('CHAIN PREMIERE', 235, 183);

  context.fillStyle = INK;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = '900 76px "Arial Black", Arial, sans-serif';
  context.fillText('DA ROOM', 110, 300);
  context.fillStyle = ORANGE;
  context.font = '900 58px "Arial Black", Arial, sans-serif';
  context.fillText(`CHAIN ${String(chain.index).padStart(2, '0')}`, 110, 370);

  drawFittedText(context, chain.ownerName, 110, 410, WIDTH - 220, 130, {
    maxSize: 56,
    minSize: 28,
    weight: 900,
    color: INK,
    align: 'left',
    maxLines: 2,
  });

  context.fillStyle = '#6d6155';
  context.font = '700 18px "Cascadia Mono", Consolas, monospace';
  context.fillText(`${chain.panels.length} PANELS · CALL → ANSWER`, 110, 600);

  context.fillStyle = YELLOW;
  roundRect(context, 110, 650, WIDTH - 220, 84, 8);
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = INK;
  context.font = '900 24px "Arial Black", Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('NOBODY SAW THIS COMING', WIDTH / 2, 692);
}

function drawEndFrame(context: CanvasRenderingContext2D, chain: ChainView) {
  drawBackground(context);
  context.fillStyle = INK;
  roundRect(context, 70, 120, WIDTH - 140, HEIGHT - 240, 18);
  context.fill();

  context.fillStyle = YELLOW;
  context.font = '900 92px "Arial Black", Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('THE END', WIDTH / 2, 300);

  context.fillStyle = CARD;
  context.font = '900 40px "Arial Black", Arial, sans-serif';
  context.fillText(`${chain.ownerName}'s chain`, WIDTH / 2, 400);

  context.fillStyle = '#bcb1a5';
  context.font = '700 16px "Cascadia Mono", Consolas, monospace';
  context.fillText(`${chain.panels.length} PANELS · DA ROOM · KEEP IT WEIRD`, WIDTH / 2, 470);

  context.fillStyle = ORANGE;
  context.beginPath();
  context.arc(WIDTH / 2, 580, 72, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = CARD;
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = CARD;
  context.font = '900 34px "Arial Black", Arial, sans-serif';
  context.fillText('DA', WIDTH / 2, 572);
  context.font = '900 24px "Arial Black", Arial, sans-serif';
  context.fillText('ROOM', WIDTH / 2, 604);
}

function writeCanvasFrame(
  gif: ReturnType<typeof GIFEncoder>,
  context: CanvasRenderingContext2D,
  delay: number,
  first: boolean,
) {
  const { data } = context.getImageData(0, 0, WIDTH, HEIGHT);
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);
  gif.writeFrame(index, WIDTH, HEIGHT, {
    palette,
    delay,
    repeat: first ? 0 : undefined,
  });
}

export async function buildChainGif(
  chain: ChainView,
  options: GifOptions,
  onProgress?: (progress: GifProgress) => void,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create the GIF canvas.');

  const gif = GIFEncoder();
  const total = Math.max(1, chain.panels.length);

  drawTitleFrame(context, chain);
  writeCanvasFrame(gif, context, 1100, true);

  for (let index = 0; index < chain.panels.length; index++) {
    const panel = chain.panels[index];
    onProgress?.({ done: index, total, label: `Drawing panel ${index + 1} of ${total}…` });
    let image: HTMLImageElement | null = null;
    if (panel.imageUrl) {
      try {
        image = await loadImage(panel.imageUrl);
      } catch {
        image = null;
      }
    }
    drawPanelFrame(context, { chain, panel, panelIndex: index, image });
    writeCanvasFrame(gif, context, options.panelDelayMs, false);
    // Give the UI a chance to paint the progress label between frames.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  onProgress?.({ done: total, total, label: 'Sealing the GIF…' });
  drawEndFrame(context, chain);
  writeCanvasFrame(gif, context, 2200, false);
  gif.finish();
  onProgress?.({ done: total, total, label: 'Ready to download.' });
  const bytes = gif.bytes();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'image/gif' });
}

export function gifFileName(chain: ChainView): string {
  const safeOwner = chain.ownerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'chain';
  return `da-room-chain-${String(chain.index).padStart(2, '0')}-${safeOwner}.gif`;
}
