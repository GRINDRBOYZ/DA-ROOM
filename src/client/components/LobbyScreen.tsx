import { useEffect, useMemo, useState } from 'react';
import type { RoomSettings, RoomState } from '../../shared/types';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  renderCallCaption,
  renderCaption,
  timerLabel,
} from '../../shared/settings';
import { request } from '../socket';
import { shareUrlForRoom } from '../session';
import { SettingsPanel } from './SettingsPanel';
import { ArrowRightIcon, CheckIcon, CopyIcon, CrownIcon, LinkIcon, SparkIcon } from './Icons';

interface LobbyScreenProps {
  room: RoomState;
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function SettingSummary({ room }: { room: RoomState }) {
  const settings = room.settings;
  return (
    <section className="card rules-card">
      <div className="card-head">
        <div>
          <span className="eyebrow">House rules</span>
          <h2>What we&apos;re playing</h2>
        </div>
      </div>
      <dl className="rules-list">
        <div><dt>Pronoun</dt><dd>{settings.pronoun}</dd></div>
        <div><dt>Panels per chain</dt><dd>{settings.totalRounds}</dd></div>
        <div><dt>Submission timer</dt><dd>{settings.submissionTimerSec ? timerLabel(settings.submissionTimerSec) : 'Off'}</dd></div>
        <div><dt>Voting timer</dt><dd>{settings.votingTimerSec ? timerLabel(settings.votingTimerSec) : 'Off'}</dd></div>
        <div><dt>Self-voting</dt><dd>{settings.allowSelfVote ? 'Allowed' : 'Blocked'}</dd></div>
        <div><dt>Tiebreak</dt><dd>{settings.suddenDeathEnabled ? 'Sudden death' : 'Host picks'}</dd></div>
      </dl>
      <p className="micro-help">The host can change these until the game starts.</p>
    </section>
  );
}

export function LobbyScreen({ room, notify }: LobbyScreenProps) {
  const [draft, setDraft] = useState<RoomSettings>(room.settings);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [readyBusy, setReadyBusy] = useState(false);
  const settingsJson = JSON.stringify(room.settings);

  useEffect(() => {
    setDraft(room.settings);
  }, [settingsJson]);

  const isHost = room.you.isHost;
  const me = room.players.find((player) => player.id === room.you.id);
  const connectedPlayers = room.players.filter((player) => !player.left && player.connected);
  const presentCount = connectedPlayers.length;
  const requiredReady = room.players.filter((player) => !player.left && player.id !== room.hostId);
  const readyCount = requiredReady.filter((player) => player.ready).length;
  const effectiveDraft = useMemo(() => normalizeSettings(draft), [draft]);
  const dirty = JSON.stringify(effectiveDraft) !== settingsJson;
  const canStart = isHost && presentCount >= 2 && !starting;

  const saveSettings = async (): Promise<boolean> => {
    setSaving(true);
    const response = await request('update_settings', { settings: effectiveDraft });
    setSaving(false);
    if (!response.ok) {
      notify(response.error, 'error');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (await saveSettings()) notify('Settings saved.', 'success');
  };

  const handleStart = async () => {
    setStarting(true);
    if (dirty && !(await saveSettings())) {
      setStarting(false);
      return;
    }
    const response = await request('start_game');
    if (!response.ok) {
      notify(response.error, 'error');
      setStarting(false);
    }
    // On success, the server broadcasts round_submit and this screen unmounts.
  };

  const toggleReady = async () => {
    if (!me || isHost) return;
    setReadyBusy(true);
    const response = await request('toggle_ready', { ready: !me.ready });
    if (!response.ok) notify(response.error, 'error');
    setReadyBusy(false);
  };

  const copyInvite = async () => {
    try {
      await copyText(shareUrlForRoom(room.roomCode));
      notify('Join link copied.', 'success');
    } catch {
      notify('Could not copy the link.', 'error');
    }
  };

  const call = renderCallCaption(effectiveDraft.pronoun || 'SHE');
  const answer = renderCaption(effectiveDraft.answerCaption, effectiveDraft.pronoun || 'SHE');

  return (
    <div className="page lobby-page">
      <section className="lobby-hero">
        <div className="lobby-hero-copy">
          <span className="eyebrow"><SparkIcon size={15} /> Game lobby</span>
          <h1>Assemble the weirdos.</h1>
          <p>
            {presentCount < 2
              ? 'Send the link. You need at least two connected players to start.'
              : `${presentCount} connected. ${readyCount}/${requiredReady.length} guests ready. The host can start whenever.`}
          </p>
        </div>
        <div className="invite-block">
          <span className="invite-label">Room code</span>
          <div className="invite-code">{room.roomCode}</div>
          <button type="button" className="button button-dark button-small invite-copy" onClick={copyInvite}>
            <LinkIcon size={16} /> Copy join link
          </button>
        </div>
      </section>

      <div className="lobby-grid">
        <div className="lobby-column">
          <section className="card players-card">
            <div className="card-head">
              <div>
                <span className="eyebrow">The room</span>
                <h2>Players <span className="count-bubble">{room.players.length}</span></h2>
              </div>
              <span className="capacity">{room.players.length}/12</span>
            </div>
            <div className="player-list">
              {room.players.map((player, index) => {
                const isMe = player.id === room.you.id;
                return (
                  <div className={`player-row ${player.connected ? '' : 'is-offline'}`} key={player.id}>
                    <div className={`avatar avatar-${index % 6}`}>
                      {player.nickname.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="player-copy">
                      <span className="player-name">
                        {player.nickname}
                        {isMe ? <span className="you-tag">you</span> : null}
                      </span>
                      <span className="player-sub">
                        {player.isHost ? (
                          <><CrownIcon size={13} /> Host</>
                        ) : player.connected ? (
                          player.ready ? 'Ready to ruin a story' : 'Not ready yet'
                        ) : (
                          'Reconnecting…'
                        )}
                      </span>
                    </div>
                    <div className="player-state">
                      {player.isHost ? (
                        <span className="chip chip-yellow"><CrownIcon size={13} /> Host</span>
                      ) : isMe ? (
                        <button
                          type="button"
                          className={`ready-button ${player.ready ? 'is-ready' : ''}`}
                          onClick={toggleReady}
                          disabled={readyBusy}
                        >
                          {player.ready ? <><CheckIcon size={15} /> Ready</> : 'I’m ready'}
                        </button>
                      ) : (
                        <span className={`ready-state ${player.ready ? 'is-ready' : ''}`}>
                          {player.ready ? 'Ready' : player.connected ? 'Waiting' : 'Offline'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {room.players.length < 2 ? (
                <div className="empty-player-row">
                  <span>It&apos;s just you so far. Copy that link and recruit the group chat.</span>
                </div>
              ) : null}
            </div>
            <p className="micro-help ready-note">
              Ready is a vibe check, not a requirement. The host can start at any time with 2+ connected players.
            </p>
          </section>

          <section className="card start-card">
            <div>
              <span className="eyebrow">Ready when you are</span>
              <h2>
                {isHost
                  ? presentCount < 2
                    ? 'Need one more human'
                    : 'Light this candle'
                  : 'The host has the wheel'}
              </h2>
              <p>
                {isHost
                  ? dirty
                    ? 'Your unsaved settings will be applied automatically when you start.'
                    : presentCount < 2
                      ? 'Share the room link and wait for someone to show up.'
                      : `${effectiveDraft.totalRounds} rounds. ${effectiveDraft.pronoun}. One panel per round. Good luck.`
                  : `You can keep chatting until they hit start.${effectiveDraft.drawingMode ? ' Drawing mode is on.' : ''}`}
              </p>
            </div>
            {isHost ? (
              <button
                type="button"
                className="button button-primary button-start"
                onClick={handleStart}
                disabled={!canStart || presentCount < 2}
              >
                {starting ? 'Starting…' : 'Start the game'}
                <ArrowRightIcon size={20} />
              </button>
            ) : (
              <div className="waiting-host">
                <span className="pulse-dot" />
                Waiting for host
              </div>
            )}
          </section>
        </div>

        <div className="lobby-column lobby-preview-column">
          <section className="card preview-card">
            <div className="card-head">
              <div>
                <span className="eyebrow">Live preview</span>
                <h2>How a panel reads</h2>
              </div>
              <span className="chip chip-orange">Round 2+</span>
            </div>
            <div className="preview-comic">
              <div className="caption caption-call"><span className="caption-kind">call</span>{call}</div>
              <div className="preview-photo">
                <span className="preview-photo-emoji">📸</span>
                <span className="preview-photo-text">FIRST PANEL</span>
                <span className="preview-photo-tape" />
              </div>
              <div className="preview-photo preview-photo-two">
                <span className="preview-photo-emoji">🖍️</span>
                <span className="preview-photo-text">ANSWER LANDS HERE</span>
              </div>
              <div className="caption caption-answer"><span className="caption-kind">answer</span>{answer}</div>
            </div>
            <div className="preview-legend">
              <span><strong>Call:</strong> fixed opener, changed only by the pronoun.</span>
              <span><strong>Answer:</strong> editable, shown below the next panel.</span>
              <span><strong>Panels:</strong> image, text, or drawing.</span>
            </div>
            <p className="micro-help">Preview updates as the host edits. Panels cannot be changed after submission.</p>
          </section>

          {isHost ? (
            <SettingsPanel
              settings={draft}
              dirty={dirty}
              saving={saving}
              onChange={setDraft}
              onSave={handleSave}
              onReset={() => setDraft(DEFAULT_SETTINGS)}
            />
          ) : (
            <SettingSummary room={room} />
          )}

          <section className="card invite-card">
            <div>
              <span className="eyebrow">Invite the group chat</span>
              <h2>Room {room.roomCode}</h2>
              <p className="invite-url">{shareUrlForRoom(room.roomCode)}</p>
            </div>
            <button type="button" className="button button-dark button-small" onClick={copyInvite}>
              <CopyIcon size={16} /> Copy link
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
