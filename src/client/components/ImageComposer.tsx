import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  DEFAULT_TEXT_POSITION,
  MAX_TEXT_LENGTH,
  TEXT_POSITIONS,
  type CaptionKind,
  type PanelView,
  type TextPosition,
} from '../../shared/types';
import type { PreparedImage } from '../image';
import {
  clipboardImageFile,
  formatBytes,
  prepareImage,
  readClipboardImage,
} from '../image';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';
import {
  BrushIcon,
  ClipboardIcon,
  ImageIcon,
  SparkIcon,
  TypeIcon,
  UploadIcon,
  XIcon,
} from './Icons';

type ComposeMode = 'image' | 'text' | 'draw';

interface PanelPayload {
  dataUrl?: string;
  text?: string;
  textPosition?: TextPosition;
}

const TEXT_POSITION_LABELS: Record<TextPosition, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};

interface ImageComposerProps {
  caption: string;
  captionKind: CaptionKind;
  isFirstRound: boolean;
  drawingMode: boolean;
  latestPanel: PanelView | null;
  onSubmit: (payload: PanelPayload) => Promise<string | null>;
}

function Caption({ caption, kind }: { caption: string; kind: CaptionKind }) {
  return (
    <div className={`caption caption-${kind}`}>
      <span className="caption-kind">{kind}</span>
      <span>{caption}</span>
    </div>
  );
}

export function ImageComposer({
  caption,
  captionKind,
  isFirstRound,
  drawingMode,
  latestPanel,
  onSubmit,
}: ImageComposerProps) {
  const [mode, setMode] = useState<ComposeMode>(drawingMode ? 'draw' : 'image');
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [background, setBackground] = useState<PreparedImage | null>(null);
  const [text, setText] = useState('');
  const [textPosition, setTextPosition] = useState<TextPosition>(DEFAULT_TEXT_POSITION);
  const [drawDirty, setDrawDirty] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [bgDragActive, setBgDragActive] = useState(false);
  const dragDepth = useRef(0);
  const bgDragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<DrawingCanvasHandle>(null);
  const requestId = useRef(0);

  const ingest = async (file: File | null, extraCount = 0) => {
    if (!file) return;
    const id = ++requestId.current;
    setProcessing(true);
    setError(null);
    setNote(extraCount > 0 ? 'One image at a time — using the first one.' : null);
    try {
      const result = await prepareImage(file);
      if (id !== requestId.current) return;
      setPrepared(result);
      setMode('image');
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : 'That image could not be processed.');
    } finally {
      if (id === requestId.current) setProcessing(false);
    }
  };

  const ingestBackground = async (file: File | null, extraCount = 0) => {
    if (!file) return;
    const id = ++requestId.current;
    setProcessing(true);
    setError(null);
    setNote(extraCount > 0 ? 'One background at a time — using the first one.' : null);
    try {
      const result = await prepareImage(file);
      if (id !== requestId.current) return;
      setBackground(result);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : 'That background image could not be processed.');
    } finally {
      if (id === requestId.current) setProcessing(false);
    }
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (busy || processing) return;
      if (mode !== 'image' && mode !== 'text') return;
      const file = clipboardImageFile(event);
      if (!file) return;
      event.preventDefault();
      if (mode === 'text') void ingestBackground(file);
      else void ingest(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void ingest(files[0], files.length - 1);
  };

  const handleBackgroundFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void ingestBackground(files[0], files.length - 1);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    handleFiles(event.dataTransfer.files);
  };

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

  const handleBackgroundDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    bgDragDepth.current++;
    setBgDragActive(true);
  };

  const handleBackgroundDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    bgDragDepth.current = Math.max(0, bgDragDepth.current - 1);
    if (bgDragDepth.current === 0) setBgDragActive(false);
  };

  const handleBackgroundDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    bgDragDepth.current = 0;
    setBgDragActive(false);
    handleBackgroundFiles(event.dataTransfer.files);
  };

  const pasteFromButton = async (target: 'panel' | 'background') => {
    try {
      setError(null);
      const file = await readClipboardImage();
      if (!file) {
        setError('No image found on the clipboard. Copy an image first, or use Ctrl+V / ⌘V.');
        return;
      }
      if (target === 'background') await ingestBackground(file);
      else await ingest(file);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `${caught.message} You can also click Upload or drag a file in.`
          : 'Could not read the clipboard. Use Ctrl+V / ⌘V instead.',
      );
    }
  };

  const canSubmit =
    mode === 'image'
      ? Boolean(prepared)
      : mode === 'text'
        ? text.trim().length > 0
        : drawingMode && (drawDirty || Boolean(latestPanel?.imageUrl));

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    let payload: PanelPayload | null = null;
    try {
      if (mode === 'image' && prepared) {
        payload = { dataUrl: prepared.dataUrl };
      } else if (mode === 'text') {
        payload = {
          text: text.trim(),
          textPosition,
          ...(background ? { dataUrl: background.dataUrl } : {}),
        };
      } else if (mode === 'draw') {
        const drawing = drawingRef.current?.exportDrawing();
        if (!drawing) throw new Error('The drawing could not be exported.');
        payload = { dataUrl: drawing.dataUrl };
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare that panel.');
      setBusy(false);
      return;
    }
    if (!payload) {
      setBusy(false);
      return;
    }
    const submitError = await onSubmit(payload);
    if (submitError) {
      setError(submitError);
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  const modes: Array<{ id: ComposeMode; label: string; icon: JSX.Element }> = [
    { id: 'image', label: 'Image', icon: <ImageIcon size={16} /> },
    { id: 'text', label: 'Text', icon: <TypeIcon size={16} /> },
    ...(drawingMode
      ? [{ id: 'draw' as ComposeMode, label: 'Draw', icon: <BrushIcon size={16} /> }]
      : []),
  ];

  return (
    <section className="image-composer">
      <div className="composer-head">
        <div>
          <span className="eyebrow"><SparkIcon size={15} /> Your panel</span>
          <h2>
            {isFirstRound
              ? 'Start the chain your way.'
              : mode === 'draw'
                ? 'Deface the panel.'
                : mode === 'text'
                  ? 'Write the next beat.'
                  : 'Paste your panel.'}
          </h2>
        </div>
        <span className="paste-first"><ClipboardIcon size={15} /> {drawingMode ? 'Image · Text · Draw' : 'Image · Text'}</span>
      </div>

      <div className="composer-tabs" role="tablist" aria-label="Panel type">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            className={`composer-tab ${mode === item.id ? 'is-active' : ''}`}
            onClick={() => {
              setMode(item.id);
              setError(null);
            }}
            disabled={busy || processing}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {mode === 'image' ? (
        prepared ? (
          <div className="composer-preview comic-panel">
            {captionKind === 'call' ? <Caption caption={caption} kind={captionKind} /> : null}
            <div className="composer-image-wrap">
              <img src={prepared.dataUrl} alt="Your selected panel" className="composer-image" />
            </div>
            {captionKind === 'answer' ? <Caption caption={caption} kind={captionKind} /> : null}
          </div>
        ) : (
          <>
            {captionKind === 'call' ? <Caption caption={caption} kind={captionKind} /> : null}
            <div
              className={`dropzone ${dragActive ? 'is-dragging' : ''} ${processing ? 'is-processing' : ''}`}
              onDragEnter={handleDragEnter}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !processing && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && !processing) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label="Drop an image or open the file picker"
            >
              {dragActive ? (
                <div className="dropzone-active">
                  <div className="dropzone-icon"><ImageIcon size={34} /></div>
                  <h3>Drop it. It&apos;s art now.</h3>
                  <p>One image per panel.</p>
                </div>
              ) : processing ? (
                <div className="dropzone-active">
                  <span className="big-spinner" />
                  <h3>Shrinking your image…</h3>
                  <p>Resizing to 1280px and squeezing it under 2 MB.</p>
                </div>
              ) : (
                <>
                  <div className="dropzone-icon"><ClipboardIcon size={32} /></div>
                  <h3>Paste, drop, or upload an image</h3>
                  <p>Hit <kbd>Ctrl</kbd> + <kbd>V</kbd> (or <kbd>⌘</kbd> + <kbd>V</kbd>) anywhere on this card.</p>
                  <div className="dropzone-actions">
                    <span className="button button-dark button-small" aria-hidden="true">
                      <UploadIcon size={16} /> Upload file
                    </span>
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      onClick={(event) => {
                        event.stopPropagation();
                        void pasteFromButton('panel');
                      }}
                    >
                      <ClipboardIcon size={16} /> Paste from clipboard
                    </button>
                  </div>
                  <span className="dropzone-formats">PNG · JPEG · WebP · GIF · animated GIFs under 2 MB keep moving</span>
                </>
              )}
            </div>
            {captionKind === 'answer' ? <Caption caption={caption} kind={captionKind} /> : null}
          </>
        )
      ) : null}

      {mode === 'text' ? (
        <div className="text-panel-composer">
          <div className="composer-preview comic-panel">
            {captionKind === 'call' ? <Caption caption={caption} kind={captionKind} /> : null}
            <div
              className={`panel-text composer-text-preview text-at-${textPosition} ${background ? 'panel-text-with-image' : ''}`}
            >
              {background ? (
                <img className="panel-text-bg" src={background.dataUrl} alt="" draggable={false} />
              ) : null}
              <div className="panel-text-impact">
                <p>{text.trim() || 'Your text will appear here.'}</p>
              </div>
            </div>
            {captionKind === 'answer' ? <Caption caption={caption} kind={captionKind} /> : null}
          </div>
          <label className="text-panel-field">
            <span className="setting-label">Write the next panel</span>
            <textarea
              className="text-input textarea-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={MAX_TEXT_LENGTH}
              rows={5}
              placeholder="Type the next unhinged beat…"
            />
            <span className="text-panel-count">{text.length} / {MAX_TEXT_LENGTH}</span>
          </label>

          <div className="text-corner-field">
            <span className="setting-label">Text corner</span>
            <div className="text-corner-grid" role="group" aria-label="Text corner">
              {TEXT_POSITIONS.map((position) => (
                <button
                  key={position}
                  type="button"
                  className={`text-corner-option ${textPosition === position ? 'is-active' : ''}`}
                  aria-pressed={textPosition === position}
                  onClick={() => setTextPosition(position)}
                  disabled={busy}
                >
                  <span className={`text-corner-dot text-corner-dot-${position}`} aria-hidden="true" />
                  {TEXT_POSITION_LABELS[position]}
                </button>
              ))}
            </div>
            <span className="micro-help">The text lands in that corner of the panel.</span>
          </div>

          <div
            className={`text-background ${bgDragActive ? 'is-dragging' : ''}`}
            onDragEnter={handleBackgroundDragEnter}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={handleBackgroundDragLeave}
            onDrop={handleBackgroundDrop}
          >
            <div className="text-background-head">
              <div>
                <span className="setting-label">
                  Background image <span className="optional-tag">optional</span>
                </span>
                <span className="micro-help">PNG, JPEG, WebP, or GIF. Same limits as any other panel image.</span>
              </div>
              {background ? (
                <span className="text-background-meta">
                  {background.animated ? 'Animated GIF' : `${background.width}×${background.height}`} · {formatBytes(background.bytes)}
                </span>
              ) : null}
            </div>
            {bgDragActive ? (
              <div className="text-background-empty is-active">
                <p>Drop the background image here.</p>
              </div>
            ) : background ? (
              <div className="text-background-preview">
                <img src={background.dataUrl} alt="Selected background" draggable={false} />
                <div className="text-background-actions">
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => backgroundInputRef.current?.click()}
                    disabled={processing || busy}
                  >
                    <UploadIcon size={15} /> Replace
                  </button>
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => {
                      setBackground(null);
                      setError(null);
                    }}
                    disabled={processing || busy}
                  >
                    <XIcon size={15} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-background-empty">
                <p>Paste, drop, or upload a background image behind the text.</p>
                <div className="dropzone-actions">
                  <button
                    type="button"
                    className="button button-dark button-small"
                    onClick={() => backgroundInputRef.current?.click()}
                    disabled={processing}
                  >
                    <UploadIcon size={16} /> Upload background
                  </button>
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => void pasteFromButton('background')}
                    disabled={processing}
                  >
                    <ClipboardIcon size={16} /> Paste from clipboard
                  </button>
                </div>
                <span className="dropzone-formats">Animated GIFs under 2 MB stay animated</span>
              </div>
            )}
            {processing ? <span className="micro-help">Shrinking the background image…</span> : null}
          </div>
        </div>
      ) : null}

      {mode === 'draw' ? (
        <DrawingCanvas
          ref={drawingRef}
          backgroundUrl={latestPanel?.imageUrl ?? null}
          onDirtyChange={setDrawDirty}
        />
      ) : null}

      {prepared && mode === 'image' ? (
        <div className="prepared-meta">
          <span>
            Optimized · {prepared.width}×{prepared.height} · {formatBytes(prepared.bytes)}
          </span>
          {prepared.animated ? <span>Animated GIF preserved</span> : prepared.originalType === 'image/gif' ? <span>GIF → still frame</span> : null}
        </div>
      ) : null}

      <div className="composer-actions">
        {prepared && mode === 'image' ? (
          <button
            type="button"
            className="button button-quiet"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing || busy}
          >
            <UploadIcon size={18} /> Replace
          </button>
        ) : null}
        <button
          type="button"
          className="button button-primary"
          onClick={submit}
          disabled={processing || busy || !canSubmit}
        >
          {busy ? 'Sending…' : isFirstRound ? 'Start my chain' : 'Add to the chain'}
          <SparkIcon size={18} />
        </button>
      </div>

      {mode === 'image' && !prepared ? (
        <p className="micro-help prompt-caption-note">
          {captionKind === 'call'
            ? 'The call caption sits above this image.'
            : 'The answer caption lands below this image.'}
        </p>
      ) : null}

      {mode === 'draw' && !latestPanel?.imageUrl && !isFirstRound ? (
        <p className="micro-help">
          The previous panel is text, so this becomes a fresh drawing.
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <input
        ref={backgroundInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          handleBackgroundFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {error ? (
        <div className="inline-alert composer-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {note ? <p className="micro-help">{note}</p> : null}
      {prepared && mode === 'image' ? (
        <button
          type="button"
          className="text-link clear-image"
          onClick={() => {
            setPrepared(null);
            setError(null);
          }}
          disabled={busy}
        >
          <XIcon size={14} /> Remove and choose another
        </button>
      ) : null}
    </section>
  );
}
