import { useEffect, useMemo, useState } from 'react';
import type { ChainView } from '../../shared/types';
import { buildChainGif, gifFileName, type GifProgress } from '../gif';
import { formatBytes } from '../image';
import { DownloadIcon, FilmIcon, SparkIcon } from './Icons';
import { Modal } from './Modal';

interface GifMakerProps {
  chains: ChainView[];
  initialChainId?: string | null;
  onClose: () => void;
}

const DELAY_OPTIONS = [
  { value: 900, label: 'Fast · 0.9s per panel' },
  { value: 1500, label: 'Normal · 1.5s per panel' },
  { value: 2300, label: 'Slow · 2.3s per panel' },
];

export function GifMaker({ chains, initialChainId = null, onClose }: GifMakerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialChainId && chains.some((chain) => chain.id === initialChainId)
      ? initialChainId
      : chains[0]?.id ?? null,
  );
  const [delay, setDelay] = useState(1500);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<GifProgress | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => chains.find((chain) => chain.id === selectedId) ?? chains[0] ?? null,
    [chains, selectedId],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (initialChainId && chains.some((chain) => chain.id === initialChainId)) {
      setSelectedId(initialChainId);
    }
  }, [chains, initialChainId]);

  const clearPreview = () => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setBlob(null);
    setProgress(null);
    setError(null);
  };

  const generate = async () => {
    if (!selected || busy) return;
    setBusy(true);
    clearPreview();
    try {
      const output = await buildChainGif(selected, { panelDelayMs: delay }, setProgress);
      setBlob(output);
      setPreviewUrl(URL.createObjectURL(output));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The GIF could not be made.');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!selected || !previewUrl) return;
    const anchor = document.createElement('a');
    anchor.href = previewUrl;
    anchor.download = gifFileName(selected);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <Modal title="GIF maker" onClose={onClose} className="modal-gif-maker">
      <div className="gif-maker">
        <div className="gif-maker-intro">
          <span className="eyebrow"><FilmIcon size={15} /> Turn a chain into a looping GIF</span>
          <p>Every panel becomes a frame, captions included. Nothing leaves your browser.</p>
        </div>

        <div className="gif-chain-picker" role="list" aria-label="Choose a chain">
          {chains.map((chain) => (
            <button
              key={chain.id}
              type="button"
              className={`gif-chain-option ${selected?.id === chain.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedId(chain.id);
                clearPreview();
              }}
              disabled={busy}
            >
              <span>{String(chain.index).padStart(2, '0')}</span>
              <strong>{chain.ownerName}</strong>
              <small>{chain.panels.length} panels</small>
            </button>
          ))}
        </div>

        <div className="gif-controls">
          <label className="gif-delay">
            <span className="setting-label">Frame speed</span>
            <select
              className="select-input"
              value={delay}
              onChange={(event) => {
                setDelay(Number(event.target.value));
                clearPreview();
              }}
              disabled={busy}
            >
              {DELAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="button button-primary" onClick={() => void generate()} disabled={busy || !selected}>
            <SparkIcon size={17} /> {busy ? 'Making GIF…' : blob ? 'Make it again' : 'Make my GIF'}
          </button>
        </div>

        {busy && progress ? (
          <div className="gif-progress" role="status">
            <div className="gif-progress-track" aria-hidden="true">
              <div
                className="gif-progress-fill"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
            <span>{progress.label}</span>
          </div>
        ) : null}

        {previewUrl ? (
          <div className="gif-preview">
            <div className="gif-preview-head">
              <div>
                <span className="eyebrow">Preview</span>
                <strong>{selected ? `${selected.ownerName}'s chain` : 'Your GIF'}</strong>
              </div>
              {blob ? <span className="chip">{formatBytes(blob.size)}</span> : null}
            </div>
            <img src={previewUrl} alt="Animated GIF preview of the chain" />
            <div className="gif-preview-actions">
              <button type="button" className="button button-dark" onClick={download}>
                <DownloadIcon size={18} /> Download GIF
              </button>
              <span className="micro-help">Saved as {selected ? gifFileName(selected) : 'chain.gif'}</span>
            </div>
          </div>
        ) : (
          <div className="gif-empty">
            <FilmIcon size={30} />
            <p>Pick a chain, pick a speed, and make the artifact.</p>
            <span className="micro-help">Animated image uploads play in-game; the GIF export uses their first frame.</span>
          </div>
        )}

        {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      </div>
    </Modal>
  );
}
