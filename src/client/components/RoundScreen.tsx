import type { RoomState } from '../../shared/types';
import { request } from '../socket';
import { ComicPanel } from './Comic';
import { Countdown } from './Countdown';
import { ImageComposer } from './ImageComposer';
import {
  BoltIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  ImageIcon,
  SparkIcon,
  UsersIcon,
} from './Icons';

interface RoundScreenProps {
  room: RoomState;
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void;
}

function RoundProgress({ room }: { room: RoomState }) {
  const info = room.roundInfo;
  if (!info) return null;
  const assigned = new Set(info.assignedPlayerIds);
  const submitted = new Set(info.submittedPlayerIds);
  const active = new Set(info.activePlayerIds);
  const activeAssigned = info.assignedPlayerIds.filter((id) => active.has(id));
  const done = activeAssigned.filter((id) => submitted.has(id)).length;
  const visiblePlayers = room.players.filter((player) => !player.left);
  const percent = activeAssigned.length ? Math.round((done / activeAssigned.length) * 100) : 0;

  return (
    <section className="card progress-card">
      <div className="card-head compact-head">
        <div>
          <span className="eyebrow"><UsersIcon size={14} /> Submission status</span>
          <h2>{done} of {activeAssigned.length} panels in</h2>
        </div>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="status-list">
        {visiblePlayers.map((player) => {
          const isActive = active.has(player.id);
          const isAssigned = assigned.has(player.id);
          const hasSubmitted = submitted.has(player.id);
          return (
            <div className={`status-row ${hasSubmitted ? 'is-done' : ''}`} key={player.id}>
              <span className="status-name">
                {player.nickname}
                {player.id === room.you.id ? <span className="you-tag">you</span> : null}
              </span>
              <span className="status-value">
                {!player.connected ? (
                  <><span className="status-dot muted" /> Offline</>
                ) : hasSubmitted ? (
                  <><CheckIcon size={14} /> Panel in</>
                ) : isAssigned ? (
                  <><span className="status-dot" /> Working</>
                ) : (
                  <><span className="status-dot muted" /> Benched this round</>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RoundContext({ room }: { room: RoomState }) {
  const assignment = room.you.assignment;
  if (!assignment) return null;
  if (assignment.latestPanel) {
    return (
      <section className="card context-card">
        <div className="card-head compact-head">
          <div>
            <span className="eyebrow"><EyeIcon size={14} /> Only you can see this</span>
            <h2>The latest panel</h2>
          </div>
          <span className="chip chip-blue">Mystery chain</span>
        </div>
        <ComicPanel panel={assignment.latestPanel} />
        <p className="micro-help">
          This is the newest panel in the chain you were handed. Add one image, text panel, or drawing.
          Do not break the chain&apos;s fragile internal logic.
        </p>
      </section>
    );
  }

  return (
    <section className="card context-card how-card">
      <div className="card-head compact-head">
        <div>
          <span className="eyebrow"><SparkIcon size={14} /> Fresh chain</span>
          <h2>How this works</h2>
        </div>
      </div>
      <ol className="mini-steps">
        <li><span>1</span><p>Start your own chain with an image, text panel, or drawing. The call caption opens it.</p></li>
        <li><span>2</span><p>Next round, your chain goes to someone else. You get a random mystery chain — never your own.</p></li>
        <li><span>3</span><p>Captions alternate: the call sits above one panel, the answer below the next.</p></li>
      </ol>
      <p className="micro-help">Nobody sees the whole chain until the final reveal. Not even you.</p>
    </section>
  );
}

function WaitingScreen({ room }: { room: RoomState }) {
  const panel = room.you.myRoundPanel;
  const info = room.roundInfo;
  const active = new Set(info?.activePlayerIds ?? []);
  const submitted = new Set(info?.submittedPlayerIds ?? []);
  const waitingCount = (info?.assignedPlayerIds ?? []).filter(
    (id) => active.has(id) && !submitted.has(id),
  ).length;
  const isRoundDone = room.phase === 'round_waiting';
  const isFinalRound = room.round >= room.totalRounds;

  return (
    <div className="page round-page">
      <div className="round-heading waiting-heading">
        <div>
          <span className="eyebrow"><CheckIcon size={15} /> Panel secured</span>
          <h1>{isRoundDone ? `Round ${room.round} is in the bag.` : 'You did your part.'}</h1>
          <p>
            {isRoundDone
              ? isFinalRound
                ? 'All chains are complete. The reveal is right around the corner.'
                : 'The chains are rotating. Your next assignment is being dealt.'
              : room.paused
                ? 'Game paused — waiting for at least two connected players.'
                : `Waiting on ${waitingCount} more ${waitingCount === 1 ? 'player' : 'players'}. No peeking at other chains.`}
          </p>
        </div>
        <div className="waiting-badge">
          <span className="pulse-dot" />
          {isRoundDone ? 'Next round incoming' : 'Waiting room'}
        </div>
      </div>

      <div className="waiting-grid">
        <div className="waiting-panel-column">
          {panel ? (
            <section className="card submitted-panel-card">
              <div className="card-head compact-head">
                <div>
                  <span className="eyebrow">Your submission</span>
                  <h2>{panel.auto ? 'The timer got you' : 'Locked in'}</h2>
                </div>
                <span className={`chip ${panel.auto ? 'chip-yellow' : 'chip-lime'}`}>
                  {panel.auto ? 'Auto panel' : 'Panel in'}
                </span>
              </div>
              <ComicPanel panel={panel} eager />
              <p className="micro-help">
                {panel.auto
                  ? 'Time ran out, so the server added a placeholder panel for you. It still counts.'
                  : 'This panel is permanent now. That’s the game, baby.'}
              </p>
            </section>
          ) : (
            <section className="card submitted-panel-card">
              <div className="empty-chain">
                <ImageIcon size={28} />
                <p>No panel from you this round.</p>
              </div>
            </section>
          )}
        </div>
        <div className="waiting-side">
          <RoundProgress room={room} />
          <section className="card waiting-note">
            <BoltIcon size={22} />
            <h3>{isRoundDone ? 'The chains are moving.' : 'Why can’t you see the others?'}</h3>
            <p>
              {isRoundDone
                ? 'Everything will be revealed at the end. Try to act normal until then.'
                : 'Showing other chains mid-game would ruin the entire bit. Everything gets revealed after the final round.'}
            </p>
            {room.deadline ? <Countdown deadline={room.deadline} label="Round closes" /> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

export function RoundScreen({ room, notify }: RoundScreenProps) {
  const assignment = room.you.assignment;
  if (room.you.hasSubmitted || room.phase === 'round_waiting') {
    return <WaitingScreen room={room} />;
  }

  const submitPanel = async (payload: { dataUrl?: string; text?: string }): Promise<string | null> => {
    const response = await request('submit_panel', payload);
    if (!response.ok) {
      notify(response.error, 'error');
      return response.error;
    }
    return null;
  };

  if (!assignment) {
    return (
      <div className="page round-page">
        <div className="round-heading">
          <div>
            <span className="eyebrow"><ClockIcon size={15} /> Round {room.round}</span>
            <h1>You&apos;re on the bench this round.</h1>
            <p>
              You reconnected after this round&apos;s chains were already dealt. Sit tight — you&apos;ll get a
              chain assignment in the next round.
            </p>
          </div>
        </div>
        <div className="round-layout">
          <section className="card benched-card">
            <ClockIcon size={32} />
            <h2>Nothing to paste yet</h2>
            <p>Round {room.round} is still rolling. The game will move on automatically once the assigned players finish.</p>
          </section>
          <div className="round-side">
            <RoundProgress room={room} />
          </div>
        </div>
      </div>
    );
  }

  const isFirstRound = assignment.isFirstRound;
  const timerEnabled = Boolean(room.deadline);

  return (
    <div className="page round-page">
      <div className="round-heading">
        <div>
          <span className="eyebrow"><SparkIcon size={15} /> Round {room.round} of {room.totalRounds}</span>
          <h1>{isFirstRound ? 'Start the nonsense.' : 'Keep the nonsense alive.'}</h1>
          <p>
            {isFirstRound
              ? 'Start your own chain with an image, text panel, or drawing. The first image carries the call caption.'
              : 'Add exactly one panel to the random chain you were handed. You never get your own starting image.'}
          </p>
        </div>
        <div className={`round-timer-card ${timerEnabled ? '' : 'is-off'}`}>
          <span className="eyebrow"><ClockIcon size={14} /> {timerEnabled ? 'Round timer' : 'No timer'}</span>
          {room.deadline ? (
            <>
              <Countdown deadline={room.deadline} />
              <span className="micro-help">Missing panels become auto placeholders.</span>
            </>
          ) : (
            <strong>Take your time</strong>
          )}
        </div>
      </div>

      {room.paused ? (
        <div className="pause-callout" role="status">
          <span className="pause-icon">⏸</span>
          <div>
            <strong>Game paused</strong>
            <p>Waiting for at least two connected players to continue. The room will carry on automatically.</p>
          </div>
        </div>
      ) : null}

      <div className="round-layout">
        <div className="round-main">
          <ImageComposer
            key={`${assignment.chainId}-${room.round}`}
            caption={assignment.caption}
            captionKind={assignment.captionKind}
            isFirstRound={isFirstRound}
            drawingMode={room.settings.drawingMode}
            latestPanel={assignment.latestPanel}
            onSubmit={submitPanel}
          />
        </div>
        <aside className="round-side">
          <RoundContext room={room} />
          <RoundProgress room={room} />
          <div className="round-side-note">
            <ImageIcon size={18} />
            <span>
              {room.settings.drawingMode
                ? 'Drawing mode: doodle over the panel you were handed.'
                : 'Image, text, or paste — one new panel per round.'}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
