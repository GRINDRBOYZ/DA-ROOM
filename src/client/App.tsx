import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomState, SessionInfo } from '../shared/types';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { RevealScreen } from './components/RevealScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { RoomHeader } from './components/RoomHeader';
import { RoundScreen } from './components/RoundScreen';
import { ToastStack, type ToastItem } from './components/Toast';
import { VotingScreen } from './components/VotingScreen';
import { socket, request } from './socket';
import {
  clearSession,
  loadSession,
  roomFromUrl,
  saveNickname,
  saveSession,
  setRoomInUrl,
} from './session';

function bootstrapSession(): { session: SessionInfo | null; roomCode: string | null } {
  const stored = loadSession();
  const urlRoom = roomFromUrl();
  if (stored && (!urlRoom || stored.roomCode === urlRoom)) {
    return { session: stored, roomCode: stored.roomCode };
  }
  if (stored) clearSession();
  return { session: null, roomCode: urlRoom };
}

const BOOTSTRAP = bootstrapSession();

function BootScreen({
  roomCode,
  connected,
  onForget,
}: {
  roomCode: string;
  connected: boolean;
  onForget: () => void;
}) {
  return (
    <div className="boot-screen">
      <div className="boot-brand">
        <span className="brand-mark">DA</span>
        <span className="brand-room">ROOM</span>
      </div>
      <div className="boot-card">
        <span className="big-spinner" />
        <span className="eyebrow">Reclaiming your seat</span>
        <h1>Room {roomCode}</h1>
        <p>{connected ? 'Restoring your game session…' : 'Waiting for the server connection…'}</p>
        <button type="button" className="text-link" onClick={onForget}>
          Leave this room instead
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(BOOTSTRAP.session);
  const sessionRef = useRef<SessionInfo | null>(BOOTSTRAP.session);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [restoring, setRestoring] = useState(Boolean(BOOTSTRAP.session));
  const [entryCode, setEntryCode] = useState<string | null>(BOOTSTRAP.roomCode);
  const [bootError, setBootError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const reconnectInFlight = useRef(false);
  const toastCounter = useRef(0);
  const attemptReconnectRef = useRef<(target: SessionInfo) => Promise<void>>(async () => {});

  const notify = useCallback(
    (message: string, tone: 'info' | 'error' | 'success' = 'info') => {
      const id = ++toastCounter.current;
      setToasts((current) => [...current.slice(-3), { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 5200);
    },
    [],
  );

  const commitSession = useCallback((next: SessionInfo | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) saveSession(next);
    else clearSession();
  }, []);

  const attemptReconnect = useCallback(
    async (target: SessionInfo) => {
      if (reconnectInFlight.current) return;
      reconnectInFlight.current = true;
      setRestoring(true);
      const response = await request('reconnect_room', {
        roomCode: target.roomCode,
        playerId: target.playerId,
        token: target.token,
      });
      reconnectInFlight.current = false;
      if (response.ok && response.session) {
        commitSession(response.session);
        setBootError(null);
        setRestoring(false);
        setRoomInUrl(response.session.roomCode);
      } else {
        commitSession(null);
        setRoom(null);
        setEntryCode(target.roomCode);
        setBootError(response.ok ? 'That session is no longer valid.' : response.error);
        setRestoring(false);
        setRoomInUrl(null);
      }
    },
    [commitSession],
  );

  useEffect(() => {
    attemptReconnectRef.current = attemptReconnect;
  }, [attemptReconnect]);

  useEffect(() => {
    const handleConnect = () => {
      setConnected(true);
      const current = sessionRef.current;
      if (current) void attemptReconnectRef.current(current);
    };
    const handleDisconnect = () => {
      setConnected(false);
    };
    const handleState = (next: RoomState) => {
      setRoom(next);
      setRestoring(false);
      setBootError(null);
    };
    const handleClosed = (payload: { message?: string }) => {
      commitSession(null);
      setRoom(null);
      setRestoring(false);
      setEntryCode(null);
      setRoomInUrl(null);
      setBootError(payload?.message ?? 'The room was closed.');
    };
    const handleGameError = (payload: { message?: string }) => {
      if (payload?.message) notify(payload.message, 'error');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleDisconnect);
    socket.on('room_state', handleState);
    socket.on('room_closed', handleClosed);
    socket.on('game_error', handleGameError);

    if (socket.connected) {
      setConnected(true);
      const current = sessionRef.current;
      if (current) void attemptReconnectRef.current(current);
    } else {
      setConnected(false);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleDisconnect);
      socket.off('room_state', handleState);
      socket.off('room_closed', handleClosed);
      socket.off('game_error', handleGameError);
    };
  }, [commitSession, notify]);

  useEffect(() => {
    if (session) setRoomInUrl(session.roomCode);
  }, [session]);

  const createRoom = async (nickname: string): Promise<string | null> => {
    setBootError(null);
    const response = await request('create_room', { nickname });
    if (!response.ok) return response.error;
    if (!response.session) return 'The room was created but the session is missing. Try refreshing.';
    setRoom(null);
    setRestoring(true);
    commitSession(response.session);
    setEntryCode(response.session.roomCode);
    setRoomInUrl(response.session.roomCode);
    saveNickname(response.session.nickname);
    return null;
  };

  const joinRoom = async (nickname: string, roomCode: string): Promise<string | null> => {
    setBootError(null);
    const response = await request('join_room', { nickname, roomCode });
    if (!response.ok) return response.error;
    if (!response.session) return 'The room was joined but the session is missing. Try refreshing.';
    setRoom(null);
    setRestoring(true);
    commitSession(response.session);
    setEntryCode(response.session.roomCode);
    setRoomInUrl(response.session.roomCode);
    saveNickname(response.session.nickname);
    return null;
  };

  const leaveRoom = useCallback(async () => {
    const current = sessionRef.current;
    if (current) await request('leave_room');
    commitSession(null);
    setRoom(null);
    setRestoring(false);
    setEntryCode(null);
    setBootError(null);
    setRoomInUrl(null);
  }, [commitSession]);

  const forgetSession = () => {
    commitSession(null);
    setRoom(null);
    setRestoring(false);
    setBootError(null);
    setEntryCode(BOOTSTRAP.roomCode);
    setRoomInUrl(null);
  };

  if (room) {
    let screen;
    switch (room.phase) {
      case 'lobby':
        screen = <LobbyScreen room={room} notify={notify} />;
        break;
      case 'round_submit':
      case 'round_waiting':
        screen = <RoundScreen room={room} notify={notify} />;
        break;
      case 'reveal':
        screen = <RevealScreen room={room} notify={notify} />;
        break;
      case 'final_voting':
        screen = <VotingScreen room={room} notify={notify} />;
        break;
      case 'results':
        screen = <ResultsScreen room={room} notify={notify} />;
        break;
    }

    return (
      <div className="app-shell">
        <RoomHeader room={room} onLeave={leaveRoom} notify={notify} />
        {!connected ? (
          <div className="connection-banner" role="status">
            <span className="pulse-dot" />
            Connection lost. Trying to get you back into the room…
          </div>
        ) : restoring ? (
          <div className="connection-banner is-soft" role="status">
            <span className="pulse-dot" />
            Syncing your session…
          </div>
        ) : null}
        {room.notice ? (
          <div className="notice-banner" role="status">
            <span className="notice-star">✦</span>
            <span>{room.notice}</span>
          </div>
        ) : null}
        <main className="app-main">{screen}</main>
        <footer className="app-foot">
          <span>DA ROOM · keep it weird</span>
          <span>Room {room.roomCode} · {room.players.filter((player) => !player.left).length} players</span>
        </footer>
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      </div>
    );
  }

  if (session) {
    return (
      <BootScreen
        roomCode={session.roomCode}
        connected={connected}
        onForget={forgetSession}
      />
    );
  }

  return (
    <div>
      <HomeScreen
        initialRoomCode={entryCode}
        initialError={bootError}
        connected={connected}
        onCreate={createRoom}
        onJoin={joinRoom}
      />
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  );
}
