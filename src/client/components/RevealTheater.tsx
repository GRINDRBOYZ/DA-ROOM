import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChainView, PanelView } from '../../shared/types';
import { ComicPanel } from './Comic';
import { ArrowRightIcon, ChevronIcon, PauseIcon, PlayIcon, SparkIcon } from './Icons';
import { Modal } from './Modal';

interface RevealTheaterProps {
  chains: ChainView[];
  autoplayLabel?: string;
  onGif?: (chainId: string) => void;
}

interface RevealStep {
  chain: ChainView;
  panel: PanelView;
  chainPosition: number;
  panelPosition: number;
}

const AUTOPLAY_MS = 2600;

export function RevealTheater({ chains, autoplayLabel = 'Auto-play', onGif }: RevealTheaterProps) {
  const steps = useMemo<RevealStep[]>(() => {
    const flattened: RevealStep[] = [];
    chains.forEach((chain, chainPosition) => {
      chain.panels.forEach((panel, panelPosition) => {
        flattened.push({ chain, panel, chainPosition, panelPosition });
      });
    });
    return flattened;
  }, [chains]);

  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const signature = chains.map((chain) => chain.id).join('|');

  useEffect(() => {
    setStepIndex(0);
    setPlaying(false);
  }, [signature]);

  const clampStep = useCallback(
    (next: number) => setStepIndex(Math.max(0, Math.min(steps.length - 1, next))),
    [steps.length],
  );

  useEffect(() => {
    if (!playing || steps.length === 0) return;
    if (stepIndex >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStepIndex((current) => Math.min(steps.length - 1, current + 1));
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, stepIndex, steps.length]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPlaying(false);
        setStepIndex((current) => Math.min(steps.length - 1, current + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPlaying(false);
        setStepIndex((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [steps.length]);

  if (steps.length === 0) {
    return (
      <div className="empty-gallery">
        <SparkIcon size={32} />
        <p>No panels to reveal yet.</p>
      </div>
    );
  }

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const progress = ((stepIndex + 1) / steps.length) * 100;
  const isChainStart = step.panelPosition === 0;

  const jumpToChain = (position: number) => {
    const firstStep = steps.findIndex((candidate) => candidate.chainPosition === position);
    if (firstStep >= 0) {
      setPlaying(false);
      setStepIndex(firstStep);
    }
  };

  return (
    <section className="reveal-theater" aria-label="Step-by-step chain reveal">
      <div className="reveal-stage-head">
        <div className="reveal-stage-title">
          <span className="eyebrow"><SparkIcon size={15} /> The reveal · one panel at a time</span>
          <div className="reveal-chain-line">
            <span className="reveal-chain-number">CHAIN {String(step.chain.index).padStart(2, '0')}</span>
            <strong>{step.chain.ownerName}</strong>
            <span className="reveal-chain-count">
              panel {step.panelPosition + 1} / {step.chain.panels.length}
            </span>
          </div>
        </div>
        <div className="reveal-stage-actions">
          {onGif ? (
            <button type="button" className="button button-quiet button-small" onClick={() => onGif(step.chain.id)}>
              GIF this chain
            </button>
          ) : null}
          <span className="reveal-progress-label">{stepIndex + 1} / {steps.length}</span>
        </div>
      </div>

      <div className="reveal-progress-track" aria-hidden="true">
        <div className="reveal-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="reveal-stage-body">
        <button
          type="button"
          className="reveal-arrow reveal-arrow-prev"
          onClick={() => {
            setPlaying(false);
            clampStep(stepIndex - 1);
          }}
          disabled={stepIndex === 0}
          aria-label="Previous panel"
        >
          <ChevronIcon size={26} />
        </button>

        <div className="reveal-frame-slot">
          {isChainStart ? (
            <div className="reveal-chain-intro" key={`chain-${step.chain.id}`}>
              <span className="eyebrow">Now showing</span>
              <h2>{step.chain.ownerName}&apos;s chain</h2>
              <p>{step.chain.panels.length} panels · {step.chain.panels.map((panel) => panel.authorName).filter((name, index, list) => list.indexOf(name) === index).length} authors</p>
            </div>
          ) : null}
          <div className="reveal-frame" key={`${step.chain.id}-${step.panel.id}`}>
            <ComicPanel
              panel={step.panel}
              label={`Panel ${step.panelPosition + 1} · by ${step.panel.authorName}`}
              eager
              onExpand={(src, alt) => setLightbox({ src, alt })}
            />
          </div>
        </div>

        <button
          type="button"
          className="reveal-arrow reveal-arrow-next"
          onClick={() => {
            setPlaying(false);
            clampStep(stepIndex + 1);
          }}
          disabled={isLast}
          aria-label="Next panel"
        >
          <ChevronIcon size={26} />
        </button>
      </div>

      <div className="reveal-controls">
        <div className="reveal-control-buttons">
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={() => clampStep(stepIndex - 1)}
            disabled={stepIndex === 0}
          >
            Back
          </button>
          <button
            type="button"
            className={`button button-primary button-small reveal-play ${playing ? 'is-playing' : ''}`}
            onClick={() => {
              if (isLast) setStepIndex(0);
              setPlaying((current) => !current);
            }}
          >
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            {playing ? 'Pause' : isLast ? 'Play again' : autoplayLabel}
          </button>
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={() => {
              setPlaying(false);
              clampStep(stepIndex + 1);
            }}
            disabled={isLast}
          >
            Next <ArrowRightIcon size={16} />
          </button>
        </div>

        <div className="reveal-dots" aria-label="Panels in this chain">
          {step.chain.panels.map((panel, index) => (
            <button
              key={panel.id}
              type="button"
              className={`reveal-dot ${index === step.panelPosition ? 'is-active' : ''} ${index < step.panelPosition ? 'is-seen' : ''}`}
              onClick={() => {
                const target = steps.findIndex(
                  (candidate) => candidate.chain.id === step.chain.id && candidate.panelPosition === index,
                );
                if (target >= 0) {
                  setPlaying(false);
                  setStepIndex(target);
                }
              }}
              aria-label={`Go to panel ${index + 1}`}
              aria-current={index === step.panelPosition ? 'step' : undefined}
            />
          ))}
        </div>
      </div>

      <div className="reveal-chain-tabs" aria-label="Jump to a chain">
        {chains.map((chain, position) => (
          <button
            key={chain.id}
            type="button"
            className={`reveal-chain-tab ${position === step.chainPosition ? 'is-active' : ''}`}
            onClick={() => jumpToChain(position)}
          >
            <span>{String(chain.index).padStart(2, '0')}</span>
            {chain.ownerName}
          </button>
        ))}
      </div>

      {isLast ? (
        <div className="reveal-end-card">
          <span className="eyebrow">That&apos;s the whole room</span>
          <strong>No more panels. Only judgement.</strong>
          <span>Voting unlocks the full wall of chains.</span>
        </div>
      ) : null}

      {lightbox ? (
        <Modal title={lightbox.alt} onClose={() => setLightbox(null)} className="modal-lightbox">
          <img className="lightbox-image" src={lightbox.src} alt={lightbox.alt} />
        </Modal>
      ) : null}
    </section>
  );
}
