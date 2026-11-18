export const CALL_CAPTION_TEMPLATE = 'AND THEN {pronoun} WALKS IN';
export const DEFAULT_ANSWER_CAPTION = 'AND WALKS OUT TF?';
export const PRONOUN_PRESETS = ['SHE', 'HE', 'THEY'] as const;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
export const MIN_ROUNDS = 2;
export const MAX_ROUNDS = 12;
export const MAX_NICKNAME_LENGTH = 20;
export const MAX_CAPTION_LENGTH = 120;
export const MAX_TEXT_LENGTH = 280;
export const MAX_PRONOUN_LENGTH = 24;
export const MAX_ROOM_IMAGE_BYTES = 96 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_DATA_URL_CHARS = 2_800_000;
export const CLIENT_IMAGE_TARGET_CHARS = 1_800_000;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
export const HOST_GRACE_MS = 20_000;
export const ROUND_WAIT_MS = 2_200;
export const SUDDEN_DEATH_MS = 30_000;

export type Phase =
  | 'lobby'
  | 'round_submit'
  | 'round_waiting'
  | 'reveal'
  | 'final_voting'
  | 'results';

export type CaptionKind = 'call' | 'answer';

export const TEXT_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];
export const DEFAULT_TEXT_POSITION: TextPosition = 'bottom-left';

export interface RoomSettings {
  pronoun: string;
  answerCaption: string;
  totalRounds: number;
  submissionTimerSec: number;
  votingTimerSec: number;
  allowSelfVote: boolean;
  suddenDeathEnabled: boolean;
  drawingMode: boolean;
}

export interface PlayerView {
  id: string;
  nickname: string;
  connected: boolean;
  left: boolean;
  ready: boolean;
  isHost: boolean;
  submitted: boolean;
  joinedAt: number;
}

export interface PanelView {
  id: string;
  round: number;
  imageUrl: string | null;
  text: string | null;
  textPosition: TextPosition | null;
  caption: string | null;
  captionKind: CaptionKind | null;
  authorId: string;
  authorName: string;
  auto: boolean;
}

export interface ChainView {
  id: string;
  index: number;
  ownerId: string;
  ownerName: string;
  panels: PanelView[];
}

export interface RoundAssignment {
  chainId: string;
  round: number;
  isFirstRound: boolean;
  caption: string;
  captionKind: CaptionKind;
  latestPanel: PanelView | null;
  deadline: number | null;
}

export interface MyState {
  id: string;
  nickname: string;
  isHost: boolean;
  hasSubmitted: boolean;
  assignment: RoundAssignment | null;
  myRoundPanel: PanelView | null;
  hasVoted: boolean;
  myVoteChainId: string | null;
  eligibleChainIds: string[];
}

export interface RoundInfo {
  submittedPlayerIds: string[];
  activePlayerIds: string[];
  assignedPlayerIds: string[];
  deadline: number | null;
}

export interface VotingView {
  deadline: number | null;
  votedPlayerIds: string[];
  eligibleVoterIds: string[];
  suddenDeath: boolean;
  tiedChainIds: string[];
}

export interface ResultsView {
  tallies: Record<string, number>;
  winnerChainIds: string[];
  tiedChainIds: string[];
  decidedBy: 'votes' | 'host' | 'sudden-death' | 'pending';
  pendingHostTieBreak: boolean;
  suddenDeath: boolean;
  totalVotes: number;
}

export interface RoomState {
  rev: number;
  roomCode: string;
  phase: Phase;
  hostId: string;
  players: PlayerView[];
  settings: RoomSettings;
  round: number;
  totalRounds: number;
  deadline: number | null;
  roundInfo: RoundInfo | null;
  voting: VotingView | null;
  chains: ChainView[] | null;
  results: ResultsView | null;
  yourChainId: string | null;
  you: MyState;
  paused: boolean;
  notice: string | null;
  serverTime: number;
}

export interface SessionInfo {
  roomCode: string;
  playerId: string;
  token: string;
  nickname: string;
}

export type ActionResponse =
  | { ok: true; session?: SessionInfo; message?: string }
  | { ok: false; error: string };

export interface CreateRoomPayload {
  nickname: string;
}

export interface JoinRoomPayload {
  nickname: string;
  roomCode: string;
}

export interface ReconnectPayload {
  roomCode: string;
  playerId: string;
  token: string;
}

export interface SubmitPanelPayload {
  dataUrl?: string;
  text?: string;
  textPosition?: string;
}
