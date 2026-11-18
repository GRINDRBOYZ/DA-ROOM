import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { clipboardImageFile, formatBytes, prepareCanvas, prepareImage, readClipboardImage, type PreparedImage } from '../image';
import {
  BrushIcon,
  ClipboardIcon,
  FillIcon,
  ImageIcon,
  UndoIcon,
  UploadIcon,
  XIcon,
} from './Icons';

const MAX_CANVAS_SIDE = 1100;
const UNDO_LIMIT = 10;
const COLORS = ['#17130f', '#ff5b35', '#3355ff', '#f6c945', '#ffa6c9', '#b8e8a8', '#fffaf1'];
// Any ink above this alpha is treated as a wall by the strokes-only bucket.
const INK_ALPHA_WALL = 8;
// Per-channel tolerance for the bucket when it includes the background image.
const IMAGE_FILL_TOLERANCE = 40;
const IMAGE_ALPHA_TOLERANCE = 24;

type DrawTool = 'brush' | 'fill';
type LayerName = 'ink' | 'fill';

interface UndoSnapshot {
  layer: LayerName;
  data: ImageData;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const expanded = value.length === 3
    ? value.split('').map((character) => character + character).join('')
    : value;
  return [
    Number.parseInt(expanded.slice(0, 2), 16) || 0,
    Number.parseInt(expanded.slice(2, 4), 16) || 0,
    Number.parseInt(expanded.slice(4, 6), 16) || 0,
  ];
}

function computeFillMask(
  width: number,
  height: number,
  seed: number,
  matches: (index: number) => boolean,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let top = 0;
  mask[seed] = 1;
  stack[top++] = seed;

  while (top > 0) {
    const index = stack[--top];
    const x = index % width;
    const y = (index - x) / width;

    if (x > 0) {
      const next = index - 1;
      if (!mask[next] && matches(next)) {
        mask[next] = 1;
        stack[top++] = next;
      }
    }
    if (x < width - 1) {
      const next = index + 1;
      if (!mask[next] && matches(next)) {
        mask[next] = 1;
        stack[top++] = next;
      }
    }
    if (y > 0) {
      const next = index - width;
      if (!mask[next] && matches(next)) {
        mask[next] = 1;
        stack[top++] = next;
      }
    }
    if (y < height - 1) {
      const next = index + width;
      if (!mask[next] && matches(next)) {
        mask[next] = 1;
        stack[top++] = next;
      }
    }
  }

  return mask;
}

function createLayer(
  ref: { current: HTMLCanvasElement | null },
  width: number,
  height: number,
): HTMLCanvasElement {
  let layer = ref.current;
  if (!layer) {
    layer = document.createElement('canvas');
    ref.current = layer;
  }
  layer.width = width;
  layer.height = height;
  return layer;
}

export interface DrawingCanvasHandle {
  exportDrawing: () => PreparedImage;
  reset: () => void;
}

interface DrawingCanvasProps {
  backgroundUrl: string | null;
  onDirtyChange?: (dirty: boolean) => void;
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ backgroundUrl, onDirtyChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const backgroundRef = useRef<HTMLImageElement | null>(null);
    // Strokes and bucket fills live on separate offscreen layers. The bucket
    // can then use the stroke layer alone as its boundary and ignore the image,
    // while fills still sit underneath strokes in the final composite.
    const inkRef = useRef<HTMLCanvasElement | null>(null);
    const fillRef = useRef<HTMLCanvasElement | null>(null);
    const undoRef = useRef<UndoSnapshot[]>([]);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const backgroundInputRef = useRef<HTMLInputElement>(null);
    const customBackgroundRef = useRef<string | null>(null);
    const dragDepth = useRef(0);
    const [tool, setTool] = useState<DrawTool>('brush');
    const [fillIncludeImage, setFillIncludeImage] = useState(false);
    const [color, setColor] = useState(COLORS[0]);
    const [brush, setBrush] = useState(16);
    const [loading, setLoading] = useState(Boolean(backgroundUrl));
    const [error, setError] = useState<string | null>(null);
    const [hasMarks, setHasMarks] = useState(false);
    const [undoCount, setUndoCount] = useState(0);
    const [customBackground, setCustomBackground] = useState<string | null>(null);
    const [backgroundInfo, setBackgroundInfo] = useState<PreparedImage | null>(null);
    const [preparing, setPreparing] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    const activeBackground = customBackground ?? backgroundUrl;

    const paintComposite = useCallback(() => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#fffaf1';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const image = backgroundRef.current;
      if (image) {
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      }
      const fills = fillRef.current;
      if (fills) context.drawImage(fills, 0, 0);
      const ink = inkRef.current;
      if (ink) context.drawImage(ink, 0, 0);
      context.restore();
    }, []);

    const clearLayers = useCallback((width: number, height: number) => {
      createLayer(inkRef, width, height);
      createLayer(fillRef, width, height);
    }, []);

    const reset = useCallback(() => {
      const canvas = canvasRef.current;
      if (canvas) clearLayers(canvas.width, canvas.height);
      undoRef.current = [];
      drawingRef.current = false;
      lastPointRef.current = null;
      setHasMarks(false);
      setUndoCount(0);
      onDirtyChange?.(Boolean(customBackgroundRef.current));
      paintComposite();
    }, [clearLayers, onDirtyChange, paintComposite]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const finish = (width: number, height: number) => {
        canvas.width = width;
        canvas.height = height;
        clearLayers(width, height);
        undoRef.current = [];
        setHasMarks(false);
        setUndoCount(0);
        paintComposite();
      };

      if (!activeBackground) {
        backgroundRef.current = null;
        finish(1000, 1000);
        setLoading(false);
        return;
      }

      let cancelled = false;
      setLoading(true);
      setError(null);
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        // Always fit the longest side to the canvas budget. Small images are
        // scaled up so there is still room to draw over them.
        const scale = MAX_CANVAS_SIDE / Math.max(1, image.naturalWidth, image.naturalHeight);
        backgroundRef.current = image;
        finish(
          Math.max(1, Math.round(image.naturalWidth * scale)),
          Math.max(1, Math.round(image.naturalHeight * scale)),
        );
        setLoading(false);
      };
      image.onerror = () => {
        if (cancelled) return;
        setLoading(false);
        setError('That background image could not be loaded. Draw on a blank canvas instead.');
        backgroundRef.current = null;
        finish(1000, 1000);
      };
      image.src = activeBackground;

      return () => {
        cancelled = true;
      };
    }, [activeBackground, clearLayers, paintComposite]);

    const applyBackground = async (file: File | null) => {
      if (!file) return;
      setPreparing(true);
      setError(null);
      try {
        const result = await prepareImage(file);
        customBackgroundRef.current = result.dataUrl;
        setCustomBackground(result.dataUrl);
        setBackgroundInfo(result);
        onDirtyChange?.(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'That background image could not be processed.');
      } finally {
        setPreparing(false);
      }
    };

    const removeBackground = () => {
      customBackgroundRef.current = null;
      setCustomBackground(null);
      setBackgroundInfo(null);
      setError(null);
      onDirtyChange?.(false);
    };

    const pasteBackground = async () => {
      try {
        setError(null);
        const file = await readClipboardImage();
        if (!file) {
          setError('No image found on the clipboard. Copy an image first, or use Ctrl+V / ⌘V.');
          return;
        }
        await applyBackground(file);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not read the clipboard.');
      }
    };

    useEffect(() => {
      const handlePaste = (event: ClipboardEvent) => {
        if (preparing) return;
        const file = clipboardImageFile(event);
        if (!file) return;
        event.preventDefault();
        void applyBackground(file);
      };
      window.addEventListener('paste', handlePaste);
      return () => window.removeEventListener('paste', handlePaste);
    });

    const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current++;
      setDragActive(true);
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragActive(false);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      void applyBackground(event.dataTransfer.files[0] ?? null);
    };

    useImperativeHandle(ref, () => ({
      exportDrawing: () => {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('The drawing canvas is not ready yet.');
        return prepareCanvas(canvas);
      },
      reset,
    }), [reset]);

    const pointFor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    };

    const pushUndo = (layer: LayerName) => {
      const source = layer === 'ink' ? inkRef.current : fillRef.current;
      const context = source?.getContext('2d');
      if (!source || !context) return;
      try {
        undoRef.current.push({
          layer,
          data: context.getImageData(0, 0, source.width, source.height),
        });
        if (undoRef.current.length > UNDO_LIMIT) undoRef.current.shift();
        setUndoCount(undoRef.current.length);
      } catch {
        // Very large canvases can refuse snapshots; drawing still works without undo.
      }
    };

    const strokeContexts = () => {
      const visible = canvasRef.current?.getContext('2d') ?? null;
      const ink = inkRef.current?.getContext('2d') ?? null;
      return { visible, ink };
    };

    const paintDot = (point: { x: number; y: number }) => {
      const { visible, ink } = strokeContexts();
      for (const context of [ink, visible]) {
        if (!context) continue;
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = brush;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.arc(point.x, point.y, brush / 2, 0, Math.PI * 2);
        context.fill();
      }
    };

    const paintSegment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const { visible, ink } = strokeContexts();
      for (const context of [ink, visible]) {
        if (!context) continue;
        context.strokeStyle = color;
        context.lineWidth = brush;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }
    };

    const fillAt = (point: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      const visible = canvas?.getContext('2d');
      const ink = inkRef.current;
      const inkContext = ink?.getContext('2d');
      const fillLayer = fillRef.current;
      const fillContext = fillLayer?.getContext('2d');
      if (!canvas || !visible || !ink || !inkContext || !fillLayer || !fillContext) return;

      const width = canvas.width;
      const height = canvas.height;
      const startX = Math.floor(point.x);
      const startY = Math.floor(point.y);
      if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;
      const seed = startY * width + startX;

      let matches: (index: number) => boolean;
      if (fillIncludeImage) {
        // Include-image mode samples the final composite, so image colors and
        // edges stop the fill as well as the strokes.
        const { data } = visible.getImageData(0, 0, width, height);
        const offset = seed * 4;
        const seedR = data[offset];
        const seedG = data[offset + 1];
        const seedB = data[offset + 2];
        const seedA = data[offset + 3];
        matches = (index) => {
          const pixel = index * 4;
          return (
            Math.abs(data[pixel] - seedR) +
              Math.abs(data[pixel + 1] - seedG) +
              Math.abs(data[pixel + 2] - seedB) <=
              IMAGE_FILL_TOLERANCE &&
            Math.abs(data[pixel + 3] - seedA) <= IMAGE_ALPHA_TOLERANCE
          );
        };
      } else {
        // Strokes-only mode ignores image colors and existing fills entirely.
        // The stroke layer is the boundary, so filling cannot be broken by a
        // busy photo behind the drawing.
        const { data: inkData } = inkContext.getImageData(0, 0, width, height);
        matches = (index) => inkData[index * 4 + 3] <= INK_ALPHA_WALL;
      }

      if (!matches(seed)) return;

      const mask = computeFillMask(width, height, seed, matches);
      pushUndo('fill');
      const fillImage = fillContext.getImageData(0, 0, width, height);
      const [red, green, blue] = hexToRgb(color);
      const pixels = fillImage.data;
      for (let index = 0; index < mask.length; index += 1) {
        if (!mask[index]) continue;
        const pixel = index * 4;
        pixels[pixel] = red;
        pixels[pixel + 1] = green;
        pixels[pixel + 2] = blue;
        pixels[pixel + 3] = 255;
      }
      fillContext.putImageData(fillImage, 0, 0);
      paintComposite();
      setHasMarks(true);
      onDirtyChange?.(true);
    };

    const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (loading) return;
      const point = pointFor(event);
      if (tool === 'fill') {
        fillAt(point);
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      pushUndo('ink');
      drawingRef.current = true;
      lastPointRef.current = point;
      paintDot(point);
    };

    const moveStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const point = pointFor(event);
      const last = lastPointRef.current;
      if (last) paintSegment(last, point);
      lastPointRef.current = point;
    };

    const endStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      lastPointRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setHasMarks(true);
      onDirtyChange?.(true);
    };

    const undo = () => {
      const snapshot = undoRef.current.pop();
      if (!snapshot) return;
      const layer = snapshot.layer === 'ink' ? inkRef.current : fillRef.current;
      const context = layer?.getContext('2d');
      if (!layer || !context) return;
      context.putImageData(snapshot.data, 0, 0);
      paintComposite();
      setUndoCount(undoRef.current.length);
      if (undoRef.current.length === 0) {
        setHasMarks(false);
        onDirtyChange?.(Boolean(customBackgroundRef.current));
      }
    };

    return (
      <div className="drawing-tool">
        <div className="drawing-toolbar">
          <div className="drawing-tool-toggle" role="group" aria-label="Drawing tool">
            <button
              type="button"
              className={`drawing-tool-option ${tool === 'brush' ? 'is-active' : ''}`}
              aria-pressed={tool === 'brush'}
              onClick={() => setTool('brush')}
            >
              <BrushIcon size={15} /> Brush
            </button>
            <button
              type="button"
              className={`drawing-tool-option ${tool === 'fill' ? 'is-active' : ''}`}
              aria-pressed={tool === 'fill'}
              onClick={() => setTool('fill')}
            >
              <FillIcon size={15} /> Fill
            </button>
          </div>
          <div className="brush-swatches" role="group" aria-label="Brush color">
            {COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`brush-swatch ${color === swatch ? 'is-active' : ''}`}
                style={{ backgroundColor: swatch }}
                onClick={() => setColor(swatch)}
                aria-label={`Brush color ${swatch}`}
                aria-pressed={color === swatch}
              />
            ))}
          </div>
          <label className="brush-color-custom">
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              aria-label="Custom brush color"
            />
            <span className="brush-color-value">{color.toUpperCase()}</span>
          </label>
          {tool === 'brush' ? (
            <label className="brush-size">
              <BrushIcon size={16} />
              <input
                type="range"
                min={4}
                max={52}
                value={brush}
                onChange={(event) => setBrush(Number(event.target.value))}
                aria-label="Brush size"
              />
              <span>{brush}px</span>
            </label>
          ) : (
            <div className="fill-include">
              <span>Include image</span>
              <button
                type="button"
                className={`switch ${fillIncludeImage ? 'is-on' : ''}`}
                role="switch"
                aria-checked={fillIncludeImage}
                aria-label="Fill includes background image"
                onClick={() => setFillIncludeImage((current) => !current)}
              >
                <span className="switch-knob" />
              </button>
            </div>
          )}
          <div className="drawing-actions">
            <button type="button" className="button button-quiet button-small" onClick={undo} disabled={undoCount === 0}>
              <UndoIcon size={15} /> Undo
            </button>
            <button type="button" className="button button-quiet button-small" onClick={reset} disabled={!hasMarks}>
              Clear
            </button>
          </div>
        </div>
        <div className="drawing-background-bar">
          <span className="drawing-background-label"><ImageIcon size={15} /> Background</span>
          <span className="drawing-background-status">
            {preparing
              ? 'Preparing…'
              : backgroundInfo
                ? `${backgroundInfo.animated ? 'Animated GIF' : `${backgroundInfo.width}×${backgroundInfo.height}`} · ${formatBytes(backgroundInfo.bytes)}`
                : activeBackground
                  ? 'Latest panel'
                  : 'Blank canvas'}
          </span>
          <div className="drawing-background-actions">
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={() => backgroundInputRef.current?.click()}
              disabled={loading || preparing}
            >
              <UploadIcon size={15} /> {activeBackground ? 'Replace' : 'Add image'}
            </button>
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={() => void pasteBackground()}
              disabled={loading || preparing}
            >
              <ClipboardIcon size={15} /> Paste
            </button>
            {customBackground ? (
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={removeBackground}
                disabled={preparing}
              >
                <XIcon size={15} /> Remove
              </button>
            ) : null}
          </div>
        </div>
        <div
          className={`drawing-board ${loading ? 'is-loading' : ''} ${dragActive ? 'is-dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <canvas
            ref={canvasRef}
            className={`drawing-canvas ${tool === 'fill' ? 'is-fill' : ''}`}
            onPointerDown={beginStroke}
            onPointerMove={moveStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={(event) => {
              if (drawingRef.current) endStroke(event);
            }}
            aria-label={
              tool === 'fill'
                ? 'Tap a region to fill it with the current color'
                : activeBackground
                  ? 'Draw over the background image'
                  : 'Blank drawing canvas'
            }
          />
          {loading ? <span className="drawing-loading"><span className="big-spinner" /> Loading the background…</span> : null}
          {!loading && !hasMarks && !dragActive ? (
            <span className="drawing-hint" aria-hidden="true">
              {tool === 'fill' ? 'Tap a region to fill it' : 'Draw something unhinged'}
            </span>
          ) : null}
          {dragActive ? (
            <span className="drawing-drop-hint"><ImageIcon size={22} /> Drop to use as the background</span>
          ) : null}
        </div>
        {error ? <p className="inline-alert" role="alert">{error}</p> : null}
        <p className="micro-help">
          {tool === 'fill'
            ? fillIncludeImage
              ? 'Fill includes the background image: it stops at image edges and at your strokes.'
              : 'Fill only reacts to your drawing: it spreads until it hits your strokes and ignores the background image.'
            : activeBackground
              ? 'Draw directly over the background. Replace it any time; your strokes become the next panel.'
              : 'Blank canvas. Add a background image or draw your opening panel from scratch.'}
        </p>
        <input
          ref={backgroundInputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            void applyBackground(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
      </div>
    );
  },
);
