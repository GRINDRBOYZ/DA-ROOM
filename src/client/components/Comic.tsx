import { useState, type CSSProperties } from 'react';
import { DEFAULT_TEXT_POSITION, type ChainView, type PanelView } from '../../shared/types';
import { CheckIcon, EyeIcon, FilmIcon, ImageIcon, TrophyIcon } from './Icons';
import { Modal } from './Modal';

interface ComicPanelProps {
  panel: PanelView;
  label?: string;
  onExpand?: (src: string, alt: string) => void;
  eager?: boolean;
}

function PanelCaption({ panel }: { panel: PanelView }) {
  if (!panel.caption || !panel.captionKind) return null;
  return (
    <div className={`caption caption-${panel.captionKind}`}>
      <span className="caption-kind">{panel.captionKind}</span>
      <span>{panel.caption}</span>
    </div>
  );
}

export function ComicPanel({ panel, label, onExpand, eager = false }: ComicPanelProps) {
  const alt = `Panel ${panel.round} by ${panel.authorName}`;
  return (
    <div className={`comic-panel ${panel.captionKind ? `comic-panel-${panel.captionKind}` : 'comic-panel-initial'}`}>
      {panel.captionKind === 'call' ? <PanelCaption panel={panel} /> : null}
      {panel.imageUrl && panel.text ? (
        <div
          className={`panel-text panel-text-with-image text-at-${panel.textPosition ?? DEFAULT_TEXT_POSITION}`}
          aria-label={alt}
        >
          <img
            className="panel-text-bg"
            src={panel.imageUrl}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            draggable={false}
          />
          <div className="panel-text-impact">
            <p>{panel.text}</p>
          </div>
          {panel.auto ? <span className="auto-badge">AUTO PANEL</span> : null}
        </div>
      ) : panel.imageUrl ? (
        <button
          type="button"
          className="panel-image-button"
          onClick={() => onExpand?.(panel.imageUrl ?? '', alt)}
          aria-label={onExpand ? `Enlarge ${alt}` : undefined}
          tabIndex={onExpand ? 0 : -1}
        >
          <img
            className="panel-image"
            src={panel.imageUrl}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            draggable={false}
          />
          {panel.auto ? <span className="auto-badge">AUTO PANEL</span> : null}
          {onExpand ? <span className="zoom-hint"><EyeIcon size={15} /> View</span> : null}
        </button>
      ) : (
        <div
          className={`panel-text text-at-${panel.textPosition ?? DEFAULT_TEXT_POSITION}`}
          aria-label={alt}
        >
          <div className="panel-text-impact">
            <p>{panel.text}</p>
          </div>
          {panel.auto ? <span className="auto-badge">AUTO PANEL</span> : null}
        </div>
      )}
      {panel.captionKind === 'answer' ? <PanelCaption panel={panel} /> : null}
      {label ? <div className="panel-footnote">{label}</div> : null}
    </div>
  );
}

interface ChainCardProps {
  chain: ChainView;
  mode: 'view' | 'vote' | 'results';
  selected?: boolean;
  selectable?: boolean;
  eligible?: boolean;
  isYourChain?: boolean;
  isWinner?: boolean;
  isTied?: boolean;
  isSuddenDeath?: boolean;
  votes?: number;
  totalRounds?: number;
  cardOrder?: number;
  onSelect?: (chainId: string) => void;
  onExpand?: (src: string, alt: string) => void;
  onGif?: (chainId: string) => void;
}

function ChainCard({
  chain,
  mode,
  selected = false,
  selectable = false,
  eligible = true,
  isYourChain = false,
  isWinner = false,
  isTied = false,
  isSuddenDeath = false,
  votes,
  totalRounds,
  cardOrder = 0,
  onSelect,
  onExpand,
  onGif,
}: ChainCardProps) {
  const classes = [
    'chain-card',
    selected ? 'is-selected' : '',
    isWinner ? 'is-winner' : '',
    isTied ? 'is-tied' : '',
    eligible ? '' : 'is-ineligible',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={classes}
      aria-label={`Chain ${chain.index} by ${chain.ownerName}`}
      style={{ '--card-order': cardOrder } as CSSProperties}
    >
      <header className="chain-head">
        <div>
          <div className="eyebrow">CHAIN {String(chain.index).padStart(2, '0')}</div>
          <h3>{chain.ownerName}</h3>
        </div>
        <div className="chain-badges">
          {isWinner ? (
            <span className="chip chip-lime">
              <TrophyIcon size={14} /> Winner
            </span>
          ) : null}
          {isTied && !isWinner ? <span className="chip chip-yellow">Tied</span> : null}
          {isYourChain ? <span className="chip chip-blue">Your chain</span> : null}
          {isSuddenDeath ? <span className="chip chip-pink">Finalist</span> : null}
          <span className="chip chip-paper">
            {chain.panels.length}
            {totalRounds ? ` / ${totalRounds}` : ''} panels
          </span>
        </div>
      </header>

      <div className="chain-panels">
        {chain.panels.map((panel, index) => (
          <div className="chain-panel" key={panel.id}>
            <div className="panel-meta">
              <span>PANEL {String(index + 1).padStart(2, '0')}</span>
              <span className="panel-author">by {panel.authorName}</span>
            </div>
            <ComicPanel
              panel={panel}
              onExpand={onExpand}
              eager={index === 0 && chain.index === 1}
            />
          </div>
        ))}
        {chain.panels.length === 0 ? (
          <div className="empty-chain">
            <ImageIcon size={24} />
            No panels made it into this chain.
          </div>
        ) : null}
      </div>

      <footer className="chain-foot">
        {mode === 'vote' ? (
          <button
            type="button"
            className={`vote-select ${selected ? 'is-chosen' : ''}`}
            disabled={!selectable || !eligible}
            onClick={() => onSelect?.(chain.id)}
            aria-pressed={selected}
          >
            {!eligible ? (
              isYourChain ? 'Your chain — not eligible' : 'Not in this vote'
            ) : selected ? (
              <>
                <CheckIcon size={18} /> Selected — confirm below
              </>
            ) : (
              'Choose this chain'
            )}
          </button>
        ) : null}
        {mode === 'results' ? (
          <div className="tally">
            <span className="tally-number">{votes ?? 0}</span>
            <span>{votes === 1 ? 'vote' : 'votes'}</span>
            <div className="tally-track" aria-hidden="true">
              <div className="tally-fill" style={{ width: `${Math.min(100, (votes ?? 0) * 18)}%` }} />
            </div>
          </div>
        ) : null}
        {onGif ? (
          <button type="button" className="button button-quiet button-small chain-gif-button" onClick={() => onGif(chain.id)}>
            <FilmIcon size={16} /> Make GIF
          </button>
        ) : null}
      </footer>
    </article>
  );
}

interface ChainGalleryProps {
  chains: ChainView[];
  mode: 'view' | 'vote' | 'results';
  yourChainId?: string | null;
  eligibleIds?: string[];
  selectedId?: string | null;
  tiedIds?: string[];
  winnerIds?: string[];
  suddenDeath?: boolean;
  tallies?: Record<string, number>;
  totalRounds?: number;
  onSelect?: (chainId: string) => void;
  onGif?: (chainId: string) => void;
}

export function ChainGallery({
  chains,
  mode,
  yourChainId,
  eligibleIds,
  selectedId = null,
  tiedIds = [],
  winnerIds = [],
  suddenDeath = false,
  tallies = {},
  totalRounds,
  onSelect,
  onGif,
}: ChainGalleryProps) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const handleExpand = (src: string, alt: string) => setLightbox({ src, alt });

  if (chains.length === 0) {
    return (
      <div className="empty-gallery">
        <ImageIcon size={32} />
        <p>No chains have been made yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="chain-gallery">
        {[...chains]
          .sort((a, b) => a.index - b.index)
          .map((chain, chainPosition) => {
            const eligible =
              mode !== 'vote' ||
              !eligibleIds ||
              eligibleIds.includes(chain.id);
            return (
              <ChainCard
                key={chain.id}
                chain={chain}
                mode={mode}
                eligible={eligible}
                selectable={mode === 'vote' && eligible}
                selected={selectedId === chain.id}
                isYourChain={yourChainId === chain.id}
                isWinner={winnerIds.includes(chain.id)}
                isTied={tiedIds.includes(chain.id)}
                isSuddenDeath={suddenDeath && tiedIds.includes(chain.id)}
                votes={tallies[chain.id] ?? 0}
                totalRounds={totalRounds}
                cardOrder={chainPosition}
                onSelect={onSelect}
                onExpand={handleExpand}
                onGif={onGif}
              />
            );
          })}
      </div>
      {lightbox ? (
        <Modal title={lightbox.alt} onClose={() => setLightbox(null)} className="modal-lightbox">
          <img className="lightbox-image" src={lightbox.src} alt={lightbox.alt} />
        </Modal>
      ) : null}
    </>
  );
}
