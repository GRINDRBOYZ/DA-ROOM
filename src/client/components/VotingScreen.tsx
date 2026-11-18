import { useEffect, useState } from 'react';
import type { RoomState } from '../../shared/types';
import { request } from '../socket';
import { ChainGallery } from './Comic';
import { Countdown } from './Countdown';
import { CheckIcon, ClockIcon, TrophyIcon, UsersIcon } from './Icons';

interface VotingScreenProps {
  room: RoomState;
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void;
}

export function VotingScreen({ room, notify }: VotingScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const votingState = room.voting;
  const chains = room.chains ?? [];
  const voted = room.you.hasVoted;
  const suddenDeath = votingState?.suddenDeath ?? false;
  const tiedIds = votingState?.tiedChainIds ?? [];
  const voterIds = votingState?.eligibleVoterIds ?? [];
  const votedIds = votingState?.votedPlayerIds ?? [];
  const eligibleVoters = room.players.filter((player) => voterIds.includes(player.id));
  const votedCount = eligibleVoters.filter((player) => votedIds.includes(player.id)).length;
  const yourVoteChainId = room.you.myVoteChainId;
  const displayedSelection = voted ? yourVoteChainId : selectedId;
  const selectedChain = chains.find((chain) => chain.id === displayedSelection);
  const eligible = room.you.eligibleChainIds;
  const ownChainExcluded = !room.settings.allowSelfVote;

  useEffect(() => {
    setSelectedId(null);
  }, [suddenDeath]);

  const castVote = async () => {
    if (!selectedId || voting) return;
    setVoting(true);
    const response = await request('vote', { chainId: selectedId });
    if (!response.ok) {
      notify(response.error, 'error');
      setVoting(false);
      return;
    }
    setVoting(false);
    notify('Vote locked in.', 'success');
  };

  return (
    <div className="page voting-page">
      <section className={`voting-hero ${suddenDeath ? 'is-sudden' : ''}`}>
        <div className="voting-copy">
          <span className="eyebrow">
            <TrophyIcon size={15} /> {suddenDeath ? 'Sudden death' : 'The final vote'}
          </span>
          <h1>{suddenDeath ? 'Break the tie. Fast.' : 'Pick the chain that broke you.'}</h1>
          <p>
            {suddenDeath
              ? 'Only the tied chains can win now. Everyone gets one fresh vote. Thirty seconds on the clock.'
              : 'One vote. Choose wisely, or at least choose loudly. Vote totals stay hidden until the end.'}
            {ownChainExcluded ? ' Self-voting is blocked.' : ' Self-voting is allowed this time.'}
          </p>
        </div>

        <div className="vote-status-card">
          <div className="vote-status-top">
            <span className="eyebrow"><UsersIcon size={14} /> Votes in</span>
            <strong>{votedCount}<span>/{eligibleVoters.length}</span></strong>
          </div>
          {votingState?.deadline ? (
            <Countdown deadline={votingState.deadline} label={suddenDeath ? 'Sudden death ends' : 'Voting ends'} />
          ) : (
            <span className="micro-help"><ClockIcon size={14} /> No voting timer</span>
          )}
          <div className="vote-roster">
            {eligibleVoters.map((player) => (
              <span
                key={player.id}
                className={`vote-person ${votedIds.includes(player.id) ? 'has-voted' : ''}`}
                title={votedIds.includes(player.id) ? 'Vote cast' : 'Still deciding'}
              >
                <span className="vote-person-dot">
                  {votedIds.includes(player.id) ? <CheckIcon size={11} /> : null}
                </span>
                {player.nickname}
              </span>
            ))}
          </div>
          <p className="micro-help">Disconnected players don&apos;t block the result.</p>
        </div>
      </section>

      {suddenDeath ? (
        <div className="sudden-banner">
          <span className="sudden-kicker">SUDDEN DEATH</span>
          <p>Only chains {tiedIds.map((id) => chains.find((chain) => chain.id === id)?.index ?? '?').map((n) => String(n).padStart(2, '0')).join(' & ')} are eligible.</p>
        </div>
      ) : null}

      {voted ? (
        <div className="voted-banner" role="status">
          <CheckIcon size={20} />
          <div>
            <strong>Your vote is locked in{selectedChain ? ` for chain ${String(selectedChain.index).padStart(2, '0')}` : ''}.</strong>
            <p>Now wait for the rest of the room. The reveal is out of your hands.</p>
          </div>
        </div>
      ) : null}

      <div className="gallery-section">
        <div className="gallery-heading">
          <span className="eyebrow">Choose one</span>
          <h2>{voted ? 'The contenders' : 'The contenders are waiting'}</h2>
          {eligible.length === 0 ? <p>No eligible chains. Ask the host to help.</p> : null}
        </div>
        <ChainGallery
          chains={chains}
          mode="vote"
          yourChainId={room.yourChainId}
          eligibleIds={eligible}
          selectedId={displayedSelection}
          tiedIds={tiedIds}
          suddenDeath={suddenDeath}
          totalRounds={room.totalRounds}
          onSelect={voted ? undefined : setSelectedId}
        />
      </div>

      <div className={`vote-dock ${voted ? 'is-locked' : ''}`}>
        {voted ? (
          <>
            <div className="vote-dock-copy">
              <span className="eyebrow"><CheckIcon size={15} /> Vote locked</span>
              <strong>{selectedChain ? `Chain ${String(selectedChain.index).padStart(2, '0')} · ${selectedChain.ownerName}` : 'Your vote is in'}</strong>
            </div>
            <span className="vote-dock-note">Waiting for everyone else…</span>
          </>
        ) : selectedChain ? (
          <>
            <div className="vote-dock-copy">
              <span className="eyebrow">Your pick</span>
              <strong>Chain {String(selectedChain.index).padStart(2, '0')} · {selectedChain.ownerName}</strong>
              <span className="vote-dock-note">One vote. It cannot be changed.</span>
            </div>
            <button type="button" className="button button-primary" onClick={castVote} disabled={voting}>
              {voting ? 'Locking it in…' : 'Lock in my vote'}
              <CheckIcon size={18} />
            </button>
          </>
        ) : (
          <>
            <div className="vote-dock-copy">
              <span className="eyebrow">No pick yet</span>
              <strong>Select a chain above</strong>
              <span className="vote-dock-note">Read the whole comic before you commit.</span>
            </div>
            <span className="vote-dock-badge">1 vote each</span>
          </>
        )}
      </div>
    </div>
  );
}
