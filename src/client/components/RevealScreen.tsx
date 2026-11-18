import { useState } from 'react';
import type { RoomState } from '../../shared/types';
import { request } from '../socket';
import { GifMaker } from './GifMaker';
import { RevealTheater } from './RevealTheater';
import { ArrowRightIcon, FilmIcon, SparkIcon, TrophyIcon } from './Icons';

interface RevealScreenProps {
  room: RoomState;
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void;
}

export function RevealScreen({ room, notify }: RevealScreenProps) {
  const [starting, setStarting] = useState(false);
  const [gifChainId, setGifChainId] = useState<string | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const chains = room.chains ?? [];
  const panelCount = chains.reduce((count, chain) => count + chain.panels.length, 0);

  const startVoting = async () => {
    setStarting(true);
    const response = await request('start_voting');
    if (!response.ok) {
      notify(response.error, 'error');
      setStarting(false);
    }
  };

  const openGifMaker = (chainId: string | null = null) => {
    setGifChainId(chainId);
    setGifOpen(true);
  };

  return (
    <div className="page reveal-page">
      <section className="reveal-hero">
        <div className="reveal-copy">
          <span className="eyebrow"><SparkIcon size={15} /> The reveal</span>
          <h1>Every chain,<br /><em>one panel at a time.</em></h1>
          <p>
            {chains.length} chains. {panelCount} panels. The show walks each chain panel by panel,
            call and answer in order. The full wall stays hidden until voting opens.
          </p>
          <div className="reveal-meta">
            <span className="chip chip-orange"><TrophyIcon size={14} /> {chains.length} contenders</span>
            <span className="chip">{panelCount} total panels</span>
            <span className="chip">{room.totalRounds} rounds each</span>
          </div>
        </div>
        <div className="reveal-action">
          {room.you.isHost ? (
            <>
              <span className="eyebrow">Host only</span>
              <h2>Ready to judge?</h2>
              <p>Play the reveal at your own pace, then open the vote. Voting shows every chain at once.</p>
              <button
                type="button"
                className="button button-primary button-big"
                onClick={startVoting}
                disabled={starting}
              >
                {starting ? 'Opening the vote…' : 'Start voting'}
                <ArrowRightIcon size={20} />
              </button>
              <button
                type="button"
                className="button button-quiet button-small reveal-gif-open"
                onClick={() => openGifMaker()}
              >
                <FilmIcon size={16} /> Open GIF maker
              </button>
            </>
          ) : (
            <>
              <span className="pulse-dot" />
              <h2>Waiting for the host</h2>
              <p>Step through the damage below. Voting opens as soon as the host says so.</p>
              <button
                type="button"
                className="button button-quiet button-small reveal-gif-open"
                onClick={() => openGifMaker()}
              >
                <FilmIcon size={16} /> Open GIF maker
              </button>
            </>
          )}
        </div>
      </section>

      <div className="reveal-stage-section">
        <div className="gallery-heading">
          <span className="eyebrow">The premiere</span>
          <h2>Step through the chains</h2>
          <p>Arrow keys work too. The full gallery unlocks for voting.</p>
        </div>
        <RevealTheater chains={chains} onGif={(chainId) => openGifMaker(chainId)} />
      </div>

      {gifOpen ? (
        <GifMaker
          chains={chains}
          initialChainId={gifChainId}
          onClose={() => {
            setGifOpen(false);
            setGifChainId(null);
          }}
        />
      ) : null}
    </div>
  );
}
