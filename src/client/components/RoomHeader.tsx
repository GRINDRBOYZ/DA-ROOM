import { useState } from 'react';
import type { RoomState } from '../../shared/types';
import { shareUrlForRoom } from '../session';
import { Countdown } from './Countdown';
import { ConfirmDialog } from './Modal';
import { CopyIcon, ExitIcon, LinkIcon, UsersIcon } from './Icons';

interface RoomHeaderProps {
  room: RoomState;
  onLeave: () => void;
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void;
}

const PHASE_LABEL: Record<RoomState['phase'], string> = {
  lobby: 'Lobby',
  round_submit: 'Round',
  round_waiting: 'Round complete',
  reveal: 'The reveal',
  final_voting: 'Voting',
  results: 'Results',
};

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function RoomHeader({ room, onLeave, notify }: RoomHeaderProps) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const present = room.players.filter((player) => !player.left && player.connected).length;

  const handleCopyCode = async () => {
    try {
      await copyText(room.roomCode);
      notify('Room code copied.', 'success');
    } catch {
      notify('Could not copy the room code. Select it manually.', 'error');
    }
  };

  const handleCopyLink = async () => {
    try {
      await copyText(shareUrlForRoom(room.roomCode));
      notify('Join link copied. Send it to your people.', 'success');
    } catch {
      notify('Could not copy the link. Copy the address bar instead.', 'error');
    }
  };

  const showRound = room.phase !== 'lobby' && room.round > 0;

  return (
    <>
      <header className="room-header">
        <div className="room-brand" aria-label="DA ROOM">
          <span className="brand-mark">DA</span>
          <span className="brand-room">ROOM</span>
        </div>

        <div className="header-cluster">
          <button
            type="button"
            className="room-code-button"
            onClick={handleCopyCode}
            title="Copy room code"
          >
            <span className="room-code-label">CODE</span>
            <span className="room-code-value">{room.roomCode}</span>
            <CopyIcon size={16} />
          </button>

          <div className={`phase-pill phase-${room.phase}`}>
            <span>{PHASE_LABEL[room.phase]}</span>
            {showRound ? (
              <strong>
                {room.round}/{room.totalRounds}
              </strong>
            ) : null}
          </div>

          {room.deadline ? <Countdown deadline={room.deadline} /> : null}

          <span className="player-count" title="Players connected">
            <UsersIcon size={17} />
            {present}/{room.players.filter((player) => !player.left).length}
          </span>
        </div>

        <div className="header-actions">
          <button type="button" className="header-button" onClick={handleCopyLink}>
            <LinkIcon size={17} />
            <span className="header-button-label">Invite</span>
          </button>
          <button type="button" className="header-button header-leave" onClick={() => setConfirmLeave(true)}>
            <ExitIcon size={17} />
            <span className="header-button-label">Leave</span>
          </button>
        </div>
      </header>

      {confirmLeave ? (
        <ConfirmDialog
          title="Leave this room?"
          message={
            room.phase === 'lobby'
              ? 'You can come back with the room code if the lobby is still open.'
              : 'Your chain stays in the game and the rest can continue. You will not be able to rejoin this session.'
          }
          confirmLabel="Leave room"
          cancelLabel="Stay"
          danger
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => {
            setConfirmLeave(false);
            onLeave();
          }}
        />
      ) : null}
    </>
  );
}
