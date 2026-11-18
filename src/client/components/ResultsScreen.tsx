import { useMemo, useState } from 'react';
import type { ChainView, RoomState } from '../../shared/types';
import { request } from '../socket';
import { ChainGallery } from './Comic';
import { GifMaker } from './GifMaker';
import { RevealTheater } from './RevealTheater';
import { ConfirmDialog, Modal } from './Modal';
import { CrownIcon, FilmIcon, PlayIcon, TrophyIcon } from './Icons';

interface ResultsScreenProps {
  room: RoomState;
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void;
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, index) => ({
        left: `${(index * 37 + 13) % 100}%`,
        delay: `${(index % 9) * 0.12}s`,
        duration: `${2.6 + (index % 5) * 0.32}s`,
        color: ['#ff5b35', '#3355ff', '#f6c945', '#b7e4c7', '#ff9bbd'][index % 5],
        rotate: `${(index * 53) % 360}deg`,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece, index) => (
        <i
          key={index}
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotate})`,
          }}
        />
      ))}
    </div>
  );
}

function chainLabel(chain: ChainView): string {
  return `Chain ${String(chain.index).padStart(2, '0')}`;
}

export function ResultsScreen({ room, notify }: ResultsScreenProps) {
  const results = room.results;
  const [breakingTie, setBreakingTie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rematch, setRematch] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [gifChainId, setGifChainId] = useState<string | null>(null);
  const chains = room.chains ?? [];

  if (!results) return null;

  const winners = chains.filter((chain) => results.winnerChainIds.includes(chain.id));
  const tied = chains.filter((chain) => results.tiedChainIds.includes(chain.id));
  const winner = winners[0] ?? null;
  const isHost = room.you.isHost;
  const pending = results.pendingHostTieBreak;

  const decidedLabel =
    results.decidedBy === 'sudden-death'
      ? 'Won by sudden-death vote'
      : results.decidedBy === 'host'
        ? 'Chosen by the host after a tie'
        : results.decidedBy === 'pending'
          ? 'Tie pending'
          : 'Won by popular vote';

  const chooseTieWinner = async (chainId: string) => {
    setBusy(true);
    const response = await request('tie_break', { chainId });
    setBusy(false);
    setBreakingTie(null);
    if (!response.ok) notify(response.error, 'error');
  };

  const startRematch = async () => {
    setBusy(true);
    const response = await request('play_again');
    setBusy(false);
    setRematch(false);
    if (!response.ok) notify(response.error, 'error');
  };

  const openGifMaker = (chainId: string | null = null) => {
    setGifChainId(chainId);
    setGifOpen(true);
  };

  return (
    <div className="page results-page">
      {winner ? <Confetti /> : null}
      <section className={`results-hero ${pending ? 'is-tie' : ''}`}>
        <div className="results-copy">
          <span className="eyebrow"><TrophyIcon size={15} /> The results</span>
          {pending ? (
            <>
              <h1>Dead tie.<br /><em>Of course.</em></h1>
              <p>
                {results.totalVotes === 0
                  ? 'Nobody voted. Honestly, iconic. The host will have to crown a winner.'
                  : 'The room could not agree. The host has to make it weird now.'}
              </p>
            </>
          ) : winner ? (
            <>
              <h1>{chainLabel(winner)}<br /><em>takes it.</em></h1>
              <p>
                {winner.ownerName} started this beautiful mess. It earned{' '}
                <strong>{results.tallies[winner.id] ?? 0} {results.tallies[winner.id] === 1 ? 'vote' : 'votes'}</strong>.
              </p>
            </>
          ) : null}
          <div className="results-meta">
            <span className="chip chip-yellow">{decidedLabel}</span>
            <span className="chip">{results.totalVotes} total {results.totalVotes === 1 ? 'vote' : 'votes'}</span>
            {results.suddenDeath ? <span className="chip chip-pink">Sudden death</span> : null}
          </div>
        </div>

        <div className="winner-zone">
          {pending ? (
            <div className="tie-zone">
              <span className="eyebrow">Tied at the top</span>
              <div className="tied-chains">
                {tied.map((chain) => (
                  <div key={chain.id} className="tied-chain">
                    <span>{chainLabel(chain)}</span>
                    <strong>{chain.ownerName}</strong>
                    <small>{results.tallies[chain.id] ?? 0} votes</small>
                    {isHost ? (
                      <button
                        type="button"
                        className="button button-dark button-small"
                        onClick={() => setBreakingTie(chain.id)}
                        disabled={busy}
                      >
                        <CrownIcon size={15} /> Crown this one
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {!isHost ? (
                <p className="micro-help">The host is picking the winner. Stay tuned.</p>
              ) : (
                <p className="micro-help">Pick the chain that deserves the crown. This is final.</p>
              )}
            </div>
          ) : winner ? (
            <div className="winner-zone-card">
              <span className="winner-crown"><CrownIcon size={30} /></span>
              <span className="eyebrow">Winner</span>
              <h2>{winner.ownerName}</h2>
              <p>{chainLabel(winner)} · {winner.panels.length} panels of pure nonsense</p>
              <div className="winner-votes">
                <span>{results.tallies[winner.id] ?? 0}</span>
                <small>{results.tallies[winner.id] === 1 ? 'vote' : 'votes'}</small>
              </div>
            </div>
          ) : null}

          <div className="results-actions">
            {isHost ? (
              <button
                type="button"
                className="button button-primary"
                onClick={() => setRematch(true)}
                disabled={busy || pending}
              >
                {busy ? 'Starting…' : 'Play again'}
              </button>
            ) : (
              <span className="waiting-host"><span className="pulse-dot" /> Waiting for the host</span>
            )}
            <button type="button" className="button button-quiet" onClick={() => setShowReveal(true)}>
              <PlayIcon size={16} /> Replay reveal
            </button>
            <button type="button" className="button button-quiet" onClick={() => openGifMaker()}>
              <FilmIcon size={16} /> GIF maker
            </button>
            <a className="button button-quiet" href="#all-chains">See all chains</a>
          </div>
          {!isHost ? <p className="micro-help">The host can start a rematch with the same room.</p> : null}
        </div>
      </section>

      <div className="gallery-section" id="all-chains">
        <div className="gallery-heading">
          <span className="eyebrow">Final scoreboard</span>
          <h2>Every chain, every vote</h2>
          <p>Winners and vote totals are marked. The vote count is under each chain.</p>
        </div>
        <ChainGallery
          chains={chains}
          mode="results"
          yourChainId={room.yourChainId}
          winnerIds={results.winnerChainIds}
          tiedIds={pending ? results.tiedChainIds : []}
          tallies={results.tallies}
          totalRounds={room.totalRounds}
          onGif={(chainId) => openGifMaker(chainId)}
        />
      </div>

      {showReveal ? (
        <Modal title="Replay the reveal" onClose={() => setShowReveal(false)} className="modal-reveal">
          <RevealTheater chains={chains} onGif={(chainId) => openGifMaker(chainId)} />
        </Modal>
      ) : null}

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

      {breakingTie ? (
        <ConfirmDialog
          title={`Crown ${chainLabel(chains.find((chain) => chain.id === breakingTie) ?? chains[0])}?`}
          message="This picks the winner immediately. No backsies."
          confirmLabel="Crown it"
          cancelLabel="Keep looking"
          onCancel={() => setBreakingTie(null)}
          onConfirm={() => void chooseTieWinner(breakingTie)}
        />
      ) : null}

      {rematch ? (
        <ConfirmDialog
          title="Run it back?"
          message="This resets the chains and returns everyone to the lobby with the same settings. Players who left are removed."
          confirmLabel="Back to lobby"
          cancelLabel="Not yet"
          onCancel={() => setRematch(false)}
          onConfirm={() => void startRematch()}
        />
      ) : null}
    </div>
  );
}
