import {
  CALL_CAPTION_TEMPLATE,
  CaptionKind,
  DEFAULT_ANSWER_CAPTION,
  DEFAULT_TEXT_POSITION,
  MAX_CAPTION_LENGTH,
  MAX_NICKNAME_LENGTH,
  MAX_PRONOUN_LENGTH,
  MAX_ROUNDS,
  MAX_TEXT_LENGTH,
  MIN_ROUNDS,
  RoomSettings,
  TEXT_POSITIONS,
  TextPosition,
} from './types';

export const DEFAULT_SETTINGS: RoomSettings = {
  pronoun: 'SHE',
  answerCaption: DEFAULT_ANSWER_CAPTION,
  totalRounds: 6,
  submissionTimerSec: 0,
  votingTimerSec: 0,
  allowSelfVote: false,
  suddenDeathEnabled: false,
  drawingMode: false,
};

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function collapseText(value: string): string {
  return value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const nickname = collapseText(raw);
  if (nickname.length < 2 || nickname.length > MAX_NICKNAME_LENGTH) return null;
  return nickname;
}

export function normalizePanelText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text || text.length > MAX_TEXT_LENGTH) return null;
  return text;
}

export function normalizeTextPosition(raw: unknown): TextPosition {
  return TEXT_POSITIONS.includes(raw as TextPosition)
    ? (raw as TextPosition)
    : DEFAULT_TEXT_POSITION;
}

export function normalizeRoomCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function normalizePronoun(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_SETTINGS.pronoun;
  let value = collapseText(raw).replace(/[{}]/g, '');
  if (!value) return DEFAULT_SETTINGS.pronoun;
  if (value.length > MAX_PRONOUN_LENGTH) value = value.slice(0, MAX_PRONOUN_LENGTH).trim();
  const preset = value.toUpperCase();
  if (preset === 'SHE' || preset === 'HE' || preset === 'THEY') return preset;
  return value;
}

function normalizeCaption(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const value = collapseText(raw);
  if (!value || value.length > MAX_CAPTION_LENGTH) return fallback;
  return value;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeTimer(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return clampInt(number, 0, 15, 600);
}

export function normalizeSettings(input: unknown): RoomSettings {
  const source =
    input && typeof input === 'object' ? (input as Partial<Record<keyof RoomSettings, unknown>>) : {};

  return {
    pronoun: normalizePronoun(source.pronoun),
    answerCaption: normalizeCaption(source.answerCaption, DEFAULT_ANSWER_CAPTION),
    totalRounds: clampInt(source.totalRounds, DEFAULT_SETTINGS.totalRounds, MIN_ROUNDS, MAX_ROUNDS),
    submissionTimerSec: normalizeTimer(source.submissionTimerSec),
    votingTimerSec: normalizeTimer(source.votingTimerSec),
    allowSelfVote: Boolean(source.allowSelfVote),
    suddenDeathEnabled: Boolean(source.suddenDeathEnabled),
    drawingMode: Boolean(source.drawingMode),
  };
}

export function renderCaption(template: string, pronoun: string): string {
  const safeTemplate = template.trim() || DEFAULT_ANSWER_CAPTION;
  return safeTemplate.replace(/\{pronoun\}/gi, pronoun);
}

/** The call is deliberately fixed: only the pronoun can change it. */
export function renderCallCaption(pronoun: string): string {
  return CALL_CAPTION_TEMPLATE.replace(/\{pronoun\}/gi, pronoun);
}

export function renderPanelCaption(kind: CaptionKind, settings: RoomSettings): string {
  return kind === 'call'
    ? renderCallCaption(settings.pronoun)
    : renderCaption(settings.answerCaption, settings.pronoun);
}

/** Captions alternate: call on the first image of a pair, answer below the second. */
export function captionKindForIndex(panelIndex: number): CaptionKind {
  return panelIndex % 2 === 0 ? 'call' : 'answer';
}

export function settingsValidationErrors(input: Partial<RoomSettings>): string[] {
  const errors: string[] = [];
  const pronoun = normalizePronoun(input.pronoun);
  if (!pronoun) errors.push('Pronoun cannot be empty.');
  if (typeof input.answerCaption === 'string' && collapseText(input.answerCaption).length > MAX_CAPTION_LENGTH) {
    errors.push(`Answer caption must be ${MAX_CAPTION_LENGTH} characters or fewer.`);
  }
  const rounds = Number(input.totalRounds);
  if (!Number.isInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
    errors.push(`Rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}.`);
  }
  for (const timer of [input.submissionTimerSec, input.votingTimerSec]) {
    if (timer !== undefined && timer !== 0 && (!Number.isFinite(Number(timer)) || Number(timer) < 15)) {
      errors.push('Timers must be off or at least 15 seconds.');
    }
  }
  return errors;
}

export function timerLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}
