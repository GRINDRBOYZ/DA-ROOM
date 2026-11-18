import type { SessionInfo } from '../shared/types';

const SESSION_KEY = 'da-room:session:v1';
const NICKNAME_KEY = 'da-room:nickname:v1';

export function loadSession(): SessionInfo | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionInfo>;
    if (
      typeof parsed.roomCode === 'string' &&
      typeof parsed.playerId === 'string' &&
      typeof parsed.token === 'string' &&
      typeof parsed.nickname === 'string'
    ) {
      return parsed as SessionInfo;
    }
  } catch {
    // Ignore corrupt local storage.
  }
  return null;
}

export function saveSession(session: SessionInfo): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private browsing may reject writes.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore.
  }
}

export function loadNickname(): string {
  try {
    return window.localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(nickname: string): void {
  try {
    window.localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // Ignore.
  }
}

export function roomFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('room');
  return code ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
}

export function setRoomInUrl(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function shareUrlForRoom(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('room', code);
  return url.toString();
}
