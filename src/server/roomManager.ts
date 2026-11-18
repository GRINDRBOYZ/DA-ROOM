import { randomUUID, randomBytes } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  ActionResponse,
  ChainView,
  CreateRoomPayload,
  HOST_GRACE_MS,
  JoinRoomPayload,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MyState,
  PanelView,
  ReconnectPayload,
  ResultsView,
  ROOM_TTL_MS,
  RoomSettings,
  RoomState,
  ROUND_WAIT_MS,
  RoundAssignment,
  SessionInfo,
  SUDDEN_DEATH_MS,
  SubmitPanelPayload,
  TextPosition,
  VotingView,
} from '../shared/types';
import {
  captionKindForIndex,
  DEFAULT_SETTINGS,
  normalizeNickname,
  normalizePanelText,
  normalizeRoomCode,
  normalizeSettings,
  normalizeTextPosition,
  renderPanelCaption,
} from '../shared/settings';
import { ImageStore } from './images';
import { matchChains } from './assignment';

type Ack = (response: ActionResponse) => void;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

interface Player {
  id: string;
  nickname: string;
  token: string;
  socketId: string | null;
  connected: boolean;
  left: boolean;
  ready: boolean;
  joinedAt: number;
}

interface Panel {
  id: string;
  round: number;
  imageId: string | null;
  text: string | null;
  textPosition: TextPosition | null;
  caption: string;
  captionKind: PanelView['captionKind'];
  authorId: string;
  authorName: string;
  auto: boolean;
}

interface Chain {
  id: string;
  index: number;
  ownerId: string;
  ownerName: string;
  panels: Panel[];
}

interface VotingState {
  votes: Map<string, string>;
  deadline: number | null;
  timer: NodeJS.Timeout | null;
  suddenDeath: boolean;
  tiedChainIds: string[];
  resolved: boolean;
}

interface Room {
  code: string;
  createdAt: number;
  updatedAt: number;
  rev: number;
  players: Player[];
  hostId: string;
  settings: RoomSettings;
  phase: RoomState['phase'];
  round: number;
  totalRounds: number;
  chains: Map<string, Chain>;
  chainOrder: string[];
  assignments: Map<string, string>;
  submissions: Set<string>;
  roundPanels: Map<string, Panel>;
  roundDeadline: number | null;
  roundTimeExpired: boolean;
  roundTimer: NodeJS.Timeout | null;
  transitionTimer: NodeJS.Timeout | null;
  hostTimer: NodeJS.Timeout | null;
  voting: VotingState | null;
  result: ResultsView | null;
  paused: boolean;
  notice: string | null;
}

function reply(ack: unknown, response: ActionResponse): void {
  if (typeof ack === 'function') (ack as Ack)(response);
}

function clearTimer(timer: NodeJS.Timeout | null): null {
  if (timer) clearTimeout(timer);
  return null;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly io: Server,
    private readonly images: ImageStore,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  attach(socket: Socket): void {
    socket.on('create_room', (payload: unknown, ack?: unknown) => {
      this.handleCreate(socket, payload, ack);
    });
    socket.on('join_room', (payload: unknown, ack?: unknown) => {
      this.handleJoin(socket, payload, ack);
    });
    socket.on('reconnect_room', (payload: unknown, ack?: unknown) => {
      this.handleReconnect(socket, payload, ack);
    });
    socket.on('update_settings', (payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.updateSettings(room, player, payload));
    });
    socket.on('toggle_ready', (payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.toggleReady(room, player, payload));
    });
    socket.on('start_game', (_payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.startGame(room, player));
    });
    socket.on('submit_panel', (payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.submitPanel(room, player, payload));
    });
    // Legacy event name kept so older open tabs keep working during a deploy.
    socket.on('submit_image', (payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.submitPanel(room, player, payload));
    });
    socket.on('start_voting', (_payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.startVoting(room, player));
    });
    socket.on('vote', (payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.castVote(room, player, payload));
    });
    socket.on('tie_break', (payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.tieBreak(room, player, payload));
    });
    socket.on('play_again', (_payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.playAgain(room, player));
    });
    socket.on('leave_room', (_payload: unknown, ack?: unknown) => {
      this.withSession(socket, ack, (room, player) => this.leaveRoom(socket, room, player));
    });
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  stop(): void {
    clearInterval(this.cleanupTimer);
    for (const room of [...this.rooms.values()]) this.destroyRoom(room, 'Server shutting down.');
  }

  private withSession(
    socket: Socket,
    ack: unknown,
    action: (room: Room, player: Player) => ActionResponse,
  ): void {
    const session = this.sessionFor(socket);
    if (!session) {
      reply(ack, { ok: false, error: 'Your game session was not found. Rejoin the room.' });
      return;
    }
    const { room, player } = session;
    if (player.left) {
      reply(ack, { ok: false, error: 'You have left this room.' });
      return;
    }
    let response: ActionResponse;
    try {
      response = action(room, player);
    } catch (error) {
      console.error('Room action failed', error);
      response = { ok: false, error: 'Something went wrong on the server. Please try again.' };
    }
    reply(ack, response);
  }

  private sessionFor(socket: Socket): { room: Room; player: Player } | null {
    const roomCode = socket.data.roomCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!roomCode || !playerId) return null;
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) return null;
    return { room, player };
  }

  private handleCreate(socket: Socket, payload: unknown, ack: unknown): void {
    if (this.sessionFor(socket)) {
      reply(ack, { ok: false, error: 'You are already in a room. Leave it first.' });
      return;
    }
    const nickname = normalizeNickname((payload as Partial<CreateRoomPayload> | null)?.nickname);
    if (!nickname) {
      reply(ack, { ok: false, error: 'Pick a nickname between 2 and 20 characters.' });
      return;
    }
    const code = this.generateCode();
    const player = this.makePlayer(nickname, true);
    const now = Date.now();
    const room: Room = {
      code,
      createdAt: now,
      updatedAt: now,
      rev: 0,
      players: [player],
      hostId: player.id,
      settings: { ...DEFAULT_SETTINGS },
      phase: 'lobby',
      round: 0,
      totalRounds: DEFAULT_SETTINGS.totalRounds,
      chains: new Map(),
      chainOrder: [],
      assignments: new Map(),
      submissions: new Set(),
      roundPanels: new Map(),
      roundDeadline: null,
      roundTimeExpired: false,
      roundTimer: null,
      transitionTimer: null,
      hostTimer: null,
      voting: null,
      result: null,
      paused: false,
      notice: null,
    };
    this.rooms.set(code, room);
    this.bindSocket(socket, room, player);
    room.rev++;
    reply(ack, { ok: true, session: this.sessionForPlayer(room, player) });
    this.broadcast(room);
  }

  private handleJoin(socket: Socket, payload: unknown, ack: unknown): void {
    if (this.sessionFor(socket)) {
      reply(ack, { ok: false, error: 'You are already in a room. Leave it first.' });
      return;
    }
    const data = (payload ?? {}) as Partial<JoinRoomPayload>;
    const nickname = normalizeNickname(data.nickname);
    const code = normalizeRoomCode(data.roomCode);
    if (!nickname) {
      reply(ack, { ok: false, error: 'Pick a nickname between 2 and 20 characters.' });
      return;
    }
    const room = this.rooms.get(code);
    if (!room) {
      reply(ack, { ok: false, error: 'Room not found. Check the code and try again.' });
      return;
    }
    if (room.phase !== 'lobby') {
      reply(ack, { ok: false, error: 'That game is already in progress. Ask the host for a new room.' });
      return;
    }
    const activePlayers = room.players.filter((player) => !player.left);
    if (activePlayers.length >= MAX_PLAYERS) {
      reply(ack, { ok: false, error: `This room is full (${MAX_PLAYERS} players max).` });
      return;
    }
    const uniqueNickname = this.uniqueNickname(room, nickname);
    const player = this.makePlayer(uniqueNickname, false);
    room.players.push(player);
    this.bindSocket(socket, room, player);
    this.bump(room);
    reply(ack, { ok: true, session: this.sessionForPlayer(room, player) });
    this.broadcast(room);
  }

  private handleReconnect(socket: Socket, payload: unknown, ack: unknown): void {
    const data = (payload ?? {}) as Partial<ReconnectPayload>;
    const room = this.rooms.get(normalizeRoomCode(data.roomCode));
    if (!room) {
      reply(ack, { ok: false, error: 'This room no longer exists.' });
      return;
    }
    const player = room.players.find((candidate) => candidate.id === data.playerId);
    if (!player || !player.token || player.token !== data.token || player.left) {
      reply(ack, { ok: false, error: 'That session is no longer valid. You can join a new game.' });
      return;
    }

    if (player.socketId && player.socketId !== socket.id) {
      const oldSocket = this.io.sockets.sockets.get(player.socketId);
      if (oldSocket) {
        oldSocket.data.roomCode = undefined;
        oldSocket.data.playerId = undefined;
        oldSocket.leave(room.code);
        oldSocket.disconnect(true);
      }
    }

    player.connected = true;
    player.socketId = socket.id;
    room.hostTimer = clearTimer(room.hostTimer);
    this.bindSocket(socket, room, player);

    if (!this.hasConnectedHost(room)) {
      const candidate = this.pickNextHost(room, room.hostId, true);
      if (candidate) {
        room.hostId = candidate.id;
        room.notice = `${candidate.nickname} is now the host.`;
      }
    }

    if (room.phase === 'round_submit') this.maybeResolveRound(room);
    if (room.phase === 'final_voting') this.maybeFinishVoting(room);
    this.bump(room);
    reply(ack, { ok: true, session: this.sessionForPlayer(room, player) });
    this.broadcast(room);
  }

  private handleDisconnect(socket: Socket): void {
    const session = this.sessionFor(socket);
    if (!session) return;
    const { room, player } = session;
    if (player.socketId !== socket.id || player.left) return;

    player.connected = false;
    player.socketId = null;

    if (room.hostId === player.id) {
      room.hostTimer = clearTimer(room.hostTimer);
      room.hostTimer = setTimeout(() => {
        room.hostTimer = null;
        const host = room.players.find((candidate) => candidate.id === room.hostId);
        if (!host || host.connected || host.left) return;
        const candidate = this.pickNextHost(room, host.id, false);
        if (!candidate) return;
        room.hostId = candidate.id;
        room.notice = `${candidate.nickname} is now the host.`;
        this.bump(room);
        this.broadcast(room);
      }, HOST_GRACE_MS);
      room.hostTimer.unref();
    }

    if (room.phase === 'round_submit') this.maybeResolveRound(room);
    if (room.phase === 'final_voting') this.maybeFinishVoting(room);
    this.bump(room);
    this.broadcast(room);
  }

  private updateSettings(room: Room, player: Player, payload: unknown): ActionResponse {
    if (room.hostId !== player.id) return { ok: false, error: 'Only the host can change settings.' };
    if (room.phase !== 'lobby') return { ok: false, error: 'Settings are locked once the game starts.' };
    const incoming = (payload as { settings?: unknown } | null)?.settings;
    const normalized = normalizeSettings(incoming);
    const changed = JSON.stringify(normalized) !== JSON.stringify(room.settings);
    if (changed) {
      room.settings = normalized;
      room.totalRounds = normalized.totalRounds;
      this.bump(room);
      this.broadcast(room);
    }
    return { ok: true };
  }

  private toggleReady(room: Room, player: Player, payload: unknown): ActionResponse {
    if (room.phase !== 'lobby') return { ok: false, error: 'The game is already running.' };
    player.ready = Boolean((payload as { ready?: unknown } | null)?.ready);
    this.bump(room);
    this.broadcast(room);
    return { ok: true };
  }

  private startGame(room: Room, player: Player): ActionResponse {
    if (room.hostId !== player.id) return { ok: false, error: 'Only the host can start the game.' };
    if (room.phase !== 'lobby') return { ok: false, error: 'The game has already started.' };
    const connected = room.players.filter((candidate) => candidate.connected && !candidate.left);
    if (connected.length < MIN_PLAYERS) {
      return { ok: false, error: `You need at least ${MIN_PLAYERS} connected players to start.` };
    }

    this.clearRoomTimers(room);
    room.round = 0;
    room.totalRounds = room.settings.totalRounds;
    room.chains = new Map();
    room.chainOrder = [];
    room.voting = null;
    room.result = null;
    room.notice = null;
    room.paused = false;

    let index = 0;
    for (const candidate of room.players.filter((entry) => !entry.left)) {
      index++;
      const chainId = randomUUID();
      room.chains.set(chainId, {
        id: chainId,
        index,
        ownerId: candidate.id,
        ownerName: candidate.nickname,
        panels: [],
      });
      room.chainOrder.push(chainId);
    }

    this.startRound(room, 1);
    this.bump(room);
    this.broadcast(room);
    return { ok: true };
  }

  private submitPanel(room: Room, player: Player, payload: unknown): ActionResponse {
    if (room.phase !== 'round_submit') return { ok: false, error: 'There is no round accepting panels right now.' };
    if (!player.connected) return { ok: false, error: 'Reconnect before submitting.' };
    if (room.submissions.has(player.id)) return { ok: false, error: 'You already submitted this round.' };
    const chainId = room.assignments.get(player.id);
    if (!chainId) return { ok: false, error: 'You have no chain assignment this round.' };
    if (room.roundTimeExpired) return { ok: false, error: 'Time is up for this round.' };

    const data = (payload ?? {}) as Partial<SubmitPanelPayload>;
    const textValue = typeof data.text === 'string' ? data.text.trim() : '';
    const imageValue = typeof data.dataUrl === 'string' ? data.dataUrl.trim() : '';
    if (!textValue && !imageValue) {
      return { ok: false, error: 'Add an image, a text panel, or both.' };
    }

    let imageId: string | null = null;
    let text: string | null = null;

    if (textValue) {
      text = normalizePanelText(data.text);
      if (!text) {
        return { ok: false, error: 'Write a text panel between 1 and 280 characters.' };
      }
    }

    // A text panel may also carry a background image. A plain image panel
    // leaves text null, and a plain text panel leaves imageId null.
    if (imageValue) {
      const added = this.images.addFromDataUrl(imageValue, room.code);
      if (!added.ok) return { ok: false, error: added.error };
      imageId = added.id;
    }

    const appended = this.appendPanel(
      room,
      player,
      chainId,
      imageId,
      text,
      text ? normalizeTextPosition(data.textPosition) : null,
      false,
    );
    if (!appended.ok) return { ok: false, error: appended.error };

    this.maybeResolveRound(room);
    this.bump(room);
    this.broadcast(room);
    return { ok: true };
  }

  private startVoting(room: Room, player: Player): ActionResponse {
    if (room.hostId !== player.id) return { ok: false, error: 'Only the host can start voting.' };
    if (room.phase !== 'reveal') return { ok: false, error: 'Voting cannot start right now.' };
    room.phase = 'final_voting';
    room.notice = null;
    room.voting = {
      votes: new Map(),
      deadline: null,
      timer: null,
      suddenDeath: false,
      tiedChainIds: [],
      resolved: false,
    };
    this.armVotingTimer(room, room.settings.votingTimerSec);
    this.bump(room);
    this.broadcast(room);
    return { ok: true };
  }

  private castVote(room: Room, player: Player, payload: unknown): ActionResponse {
    if (room.phase !== 'final_voting' || !room.voting) {
      return { ok: false, error: 'Voting is not open right now.' };
    }
    if (!player.connected) return { ok: false, error: 'Reconnect before voting.' };
    if (room.voting.votes.has(player.id)) return { ok: false, error: 'Your vote is already locked in.' };
    const chainId = (payload as { chainId?: unknown } | null)?.chainId;
    if (typeof chainId !== 'string') return { ok: false, error: 'Choose a chain to vote for.' };
    const eligible = this.eligibleChainsFor(room, player.id);
    if (!eligible.includes(chainId)) {
      return {
        ok: false,
        error: room.settings.allowSelfVote
          ? 'That chain is not in this vote.'
          : 'You cannot vote for your own chain (or that chain is not in this vote).',
      };
    }
    room.voting.votes.set(player.id, chainId);
    room.voting.resolved = false;
    this.maybeFinishVoting(room);
    this.bump(room);
    this.broadcast(room);
    return { ok: true };
  }

  private tieBreak(room: Room, player: Player, payload: unknown): ActionResponse {
    if (room.phase !== 'results' || !room.result) return { ok: false, error: 'There is no tie to break.' };
    if (room.hostId !== player.id) return { ok: false, error: 'Only the host can break a tie.' };
    if (!room.result.pendingHostTieBreak) return { ok: false, error: 'This result is already settled.' };
    const chainId = (payload as { chainId?: unknown } | null)?.chainId;
    if (typeof chainId !== 'string' || !room.result.tiedChainIds.includes(chainId)) {
      return { ok: false, error: 'Pick one of the tied chains.' };
    }
    room.result.winnerChainIds = [chainId];
    room.result.decidedBy = 'host';
    room.result.pendingHostTieBreak = false;
    room.result.tiedChainIds = [];
    room.notice = 'Tie broken by the host.';
    this.bump(room);
    this.broadcast(room);
    return { ok: true };
  }

  private playAgain(room: Room, player: Player): ActionResponse {
    if (room.hostId !== player.id) return { ok: false, error: 'Only the host can start a new game.' };
    if (room.phase !== 'results') return { ok: false, error: 'Finish this game before starting another.' };
    this.clearRoomTimers(room);
    room.players = room.players.filter((candidate) => !candidate.left);
    room.players.forEach((candidate) => {
      candidate.ready = false;
    });
    if (!room.players.some((candidate) => candidate.id === room.hostId)) {
      const nextHost = room.players.find((candidate) => candidate.connected) ?? room.players[0];
      if (nextHost) room.hostId = nextHost.id;
    }
    room.phase = 'lobby';
    room.round = 0;
    room.chains = new Map();
    room.chainOrder = [];
    room.assignments = new Map();
    room.submissions = new Set();
    room.roundPanels = new Map();
    room.voting = null;
    room.result = null;
    room.paused = false;
    room.notice = 'New game, same legends.';
    this.bump(room);
    this.broadcast(room);
    return { ok: true };
  }

  private leaveRoom(socket: Socket, room: Room, player: Player): ActionResponse {
    if (player.left) return { ok: false, error: 'You already left.' };

    if (room.phase === 'lobby') {
      room.players = room.players.filter((candidate) => candidate.id !== player.id);
    } else {
      player.left = true;
      player.connected = false;
      player.socketId = null;
    }

    socket.leave(room.code);
    socket.data.roomCode = undefined;
    socket.data.playerId = undefined;
    room.hostTimer = clearTimer(room.hostTimer);

    const remaining = room.players.filter((candidate) => !candidate.left);
    if (remaining.length === 0) {
      this.destroyRoom(room, 'The room is closed.');
      return { ok: true };
    }

    if (room.hostId === player.id) {
      const nextHost = this.pickNextHost(room, player.id, false);
      if (nextHost) {
        room.hostId = nextHost.id;
        room.notice = `The host left. ${nextHost.nickname} is now the host.`;
      }
    }

    if (room.phase === 'round_submit') this.maybeResolveRound(room);
    if (room.phase === 'final_voting') this.maybeFinishVoting(room);
    this.bump(room);
    this.broadcast(room);
    return { ok: true };
  }

  private startRound(room: Room, round: number): void {
    room.round = round;
    room.phase = 'round_submit';
    room.assignments = new Map();
    room.submissions = new Set();
    room.roundPanels = new Map();
    room.roundTimeExpired = false;
    room.paused = false;
    room.notice = null;
    room.result = null;
    room.voting = null;
    room.transitionTimer = clearTimer(room.transitionTimer);

    if (round === 1) {
      for (const player of room.players.filter((candidate) => !candidate.left)) {
        const chain = [...room.chains.values()].find((candidate) => candidate.ownerId === player.id);
        if (chain) room.assignments.set(player.id, chain.id);
      }
    } else {
      this.assignChains(room);
    }

    room.roundDeadline = null;
    if (room.settings.submissionTimerSec > 0) {
      room.roundDeadline = Date.now() + room.settings.submissionTimerSec * 1000;
      room.roundTimer = clearTimer(room.roundTimer);
      room.roundTimer = setTimeout(() => {
        room.roundTimer = null;
        if (room.phase !== 'round_submit') return;
        room.roundTimeExpired = true;
        room.notice = 'Time’s up. Missing panels are being filled automatically.';
        this.maybeResolveRound(room);
        this.bump(room);
        this.broadcast(room);
      }, room.settings.submissionTimerSec * 1000);
      room.roundTimer.unref();
    }
  }

  private assignChains(room: Room): void {
    const active = room.players.filter((player) => player.connected && !player.left);
    if (active.length === 0) return;
    const chains = room.chainOrder
      .map((id) => room.chains.get(id))
      .filter((chain): chain is Chain => Boolean(chain))
      .map((chain) => ({
        id: chain.id,
        ownerId: chain.ownerId,
        latestAuthorId: chain.panels[chain.panels.length - 1]?.authorId ?? null,
      }));
    if (chains.length === 0) return;

    // Deal completely at random, but never hand a player a chain whose latest
    // panel they made. That panel is the prompt they would see next, so it must
    // not be their own picture. Avoiding the chain they started is a soft
    // preference; it stays in place whenever a full deal is still possible.
    const chainToPlayer = matchChains(active, chains);

    for (const [chainId, playerId] of chainToPlayer) {
      room.assignments.set(playerId, chainId);
    }

    // Only possible when the remaining chains all belong to the benched player.
    // Benching is safer than exposing their own image.
    const assignedPlayers = new Set(chainToPlayer.values());
    for (const player of active) {
      if (!assignedPlayers.has(player.id)) {
        console.warn(`No safe chain assignment for ${player.nickname} in room ${room.code}.`);
      }
    }
  }

  private maybeResolveRound(room: Room): void {
    if (room.phase !== 'round_submit') return;
    const active = room.players.filter((player) => player.connected && !player.left);
    if (active.length < MIN_PLAYERS) {
      const wasPaused = room.paused;
      room.paused = true;
      if (!wasPaused) {
        room.notice = 'Game paused — waiting for at least two connected players.';
      }
      return;
    }
    room.paused = false;
    const allActiveSubmitted = active.every(
      (player) => !room.assignments.has(player.id) || room.submissions.has(player.id),
    );
    const deadlinePassed =
      room.roundDeadline !== null && Date.now() >= room.roundDeadline;
    const expired = room.roundTimeExpired || deadlinePassed;
    if (!allActiveSubmitted && !expired) return;

    for (const [playerId, chainId] of room.assignments) {
      if (room.submissions.has(playerId)) continue;
      const player = room.players.find((candidate) => candidate.id === playerId);
      if (!player) continue;
      this.appendPanel(room, player, chainId, this.images.placeholderId, null, null, true);
    }
    this.completeRound(room);
  }

  private completeRound(room: Room): void {
    room.roundTimer = clearTimer(room.roundTimer);
    room.roundDeadline = null;
    room.roundTimeExpired = false;
    room.phase = 'round_waiting';
    room.paused = false;
    room.notice = null;
    room.transitionTimer = clearTimer(room.transitionTimer);
    room.transitionTimer = setTimeout(() => {
      room.transitionTimer = null;
      if (room.phase !== 'round_waiting') return;
      if (room.round >= room.totalRounds) {
        room.phase = 'reveal';
        room.assignments = new Map();
        room.submissions = new Set();
        room.roundPanels = new Map();
        room.notice = 'Every chain is complete. Time to judge them.';
      } else {
        this.startRound(room, room.round + 1);
      }
      this.bump(room);
      this.broadcast(room);
    }, ROUND_WAIT_MS);
    room.transitionTimer.unref();
  }

  private appendPanel(
    room: Room,
    player: Player,
    chainId: string,
    imageId: string | null,
    text: string | null,
    textPosition: TextPosition | null,
    auto: boolean,
  ): { ok: true } | { ok: false; error: string } {
    const chain = room.chains.get(chainId);
    if (!chain) return { ok: false, error: 'That chain could not be found.' };
    if (room.submissions.has(player.id)) return { ok: false, error: 'You already submitted this round.' };
    const captionKind = captionKindForIndex(chain.panels.length);
    const panel: Panel = {
      id: randomUUID(),
      round: room.round,
      imageId,
      text,
      textPosition,
      caption: renderPanelCaption(captionKind, room.settings),
      captionKind,
      authorId: player.id,
      authorName: player.nickname,
      auto,
    };
    chain.panels.push(panel);
    room.submissions.add(player.id);
    room.roundPanels.set(player.id, panel);
    return { ok: true };
  }

  private armVotingTimer(room: Room, seconds: number): void {
    if (!room.voting) return;
    room.voting.timer = clearTimer(room.voting.timer);
    room.voting.timer = null;
    if (seconds <= 0) {
      room.voting.deadline = null;
      return;
    }
    room.voting.deadline = Date.now() + seconds * 1000;
    room.voting.timer = setTimeout(() => {
      if (room.phase !== 'final_voting' || !room.voting) return;
      room.voting.timer = null;
      room.voting.deadline = null;
      this.finalizeVoting(room);
      this.bump(room);
      this.broadcast(room);
    }, seconds * 1000);
    room.voting.timer.unref();
  }

  private maybeFinishVoting(room: Room): void {
    if (room.phase !== 'final_voting' || !room.voting || room.voting.resolved) return;
    const eligibleVoters = room.players.filter((player) => player.connected && !player.left);
    if (eligibleVoters.length === 0) return;
    const everyoneVoted = eligibleVoters.every((player) => room.voting?.votes.has(player.id));
    if (!everyoneVoted) return;
    this.finalizeVoting(room);
  }

  private finalizeVoting(room: Room): void {
    const voting = room.voting;
    if (!voting || room.phase !== 'final_voting') return;
    voting.timer = clearTimer(voting.timer);
    voting.deadline = null;

    const tallies: Record<string, number> = {};
    for (const chainId of room.chainOrder) tallies[chainId] = 0;
    for (const [, chainId] of voting.votes) {
      if (tallies[chainId] !== undefined) tallies[chainId] += 1;
    }
    const maxVotes = Math.max(0, ...Object.values(tallies));
    const candidates = voting.suddenDeath ? voting.tiedChainIds : room.chainOrder;
    const tied = candidates.filter((chainId) => tallies[chainId] === maxVotes);
    const isTie = tied.length > 1;
    const totalVotes = voting.votes.size;

    if (isTie && !voting.suddenDeath && room.settings.suddenDeathEnabled && totalVotes > 0) {
      voting.resolved = true;
      voting.tiedChainIds = tied;
      room.notice = 'Dead tie! A 30-second sudden-death vote is starting.';
      room.transitionTimer = clearTimer(room.transitionTimer);
      room.transitionTimer = setTimeout(() => {
        room.transitionTimer = null;
        if (room.phase !== 'final_voting' || !room.voting) return;
        this.beginSuddenDeath(room);
        this.bump(room);
        this.broadcast(room);
      }, 2000);
      room.transitionTimer.unref();
      return;
    }

    const decidedBy: ResultsView['decidedBy'] = isTie
      ? 'pending'
      : voting.suddenDeath
        ? 'sudden-death'
        : 'votes';
    room.result = {
      tallies,
      winnerChainIds: isTie ? [] : tied,
      tiedChainIds: isTie ? tied : [],
      decidedBy,
      pendingHostTieBreak: isTie,
      suddenDeath: voting.suddenDeath,
      totalVotes,
    };
    room.notice = isTie
      ? 'It’s a dead tie. The host must pick the winner.'
      : null;
    room.voting = null;
    room.phase = 'results';
  }

  private beginSuddenDeath(room: Room): void {
    if (!room.voting) return;
    const targets = room.voting.tiedChainIds;
    room.voting.votes = new Map();
    room.voting.suddenDeath = true;
    room.voting.resolved = false;
    room.voting.tiedChainIds = targets;
    room.notice = 'SUDDEN DEATH: one vote, tied chains only.';
    this.armVotingTimer(room, SUDDEN_DEATH_MS / 1000);
  }

  private eligibleChainsFor(room: Room, playerId: string): string[] {
    const voting = room.voting;
    if (!voting) return [];
    let base = voting.suddenDeath ? voting.tiedChainIds : room.chainOrder;
    if (!base.length) base = room.chainOrder;
    if (room.settings.allowSelfVote) return [...base];
    const ownChain = room.chainOrder.find((chainId) => room.chains.get(chainId)?.ownerId === playerId);
    const withoutOwn = base.filter((chainId) => chainId !== ownChain);
    return withoutOwn.length > 0 ? withoutOwn : [...base];
  }

  private buildSnapshot(room: Room, player: Player): RoomState {
    const voting = room.phase === 'final_voting' ? room.voting : null;
    const eligibleChainIds = voting ? this.eligibleChainsFor(room, player.id) : [];
    const chainViews = this.chainViews(room);
    const showChains =
      room.phase === 'reveal' || room.phase === 'final_voting' || room.phase === 'results';

    const assignment = this.buildAssignment(room, player);
    const myRoundPanel = room.roundPanels.get(player.id) ?? null;
    const yourChain = room.chainOrder.find(
      (chainId) => room.chains.get(chainId)?.ownerId === player.id,
    );

    const you: MyState = {
      id: player.id,
      nickname: player.nickname,
      isHost: room.hostId === player.id,
      hasSubmitted: room.submissions.has(player.id),
      assignment,
      myRoundPanel: myRoundPanel ? this.panelView(myRoundPanel) : null,
      hasVoted: Boolean(voting?.votes.has(player.id)),
      myVoteChainId: voting?.votes.get(player.id) ?? null,
      eligibleChainIds,
    };

    const activeIds = room.players
      .filter((candidate) => candidate.connected && !candidate.left)
      .map((candidate) => candidate.id);

    const votingView: VotingView | null = voting
      ? {
          deadline: voting.deadline,
          votedPlayerIds: [...voting.votes.keys()],
          eligibleVoterIds: activeIds,
          suddenDeath: voting.suddenDeath,
          tiedChainIds: voting.suddenDeath ? voting.tiedChainIds : [],
        }
      : null;

    const deadline =
      room.phase === 'round_submit'
        ? room.roundDeadline
        : room.phase === 'final_voting'
          ? (voting?.deadline ?? null)
          : null;

    return {
      rev: room.rev,
      roomCode: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players: room.players.map((candidate) => ({
        id: candidate.id,
        nickname: candidate.nickname,
        connected: candidate.connected,
        left: candidate.left,
        ready: candidate.ready,
        isHost: candidate.id === room.hostId,
        submitted: room.submissions.has(candidate.id),
        joinedAt: candidate.joinedAt,
      })),
      settings: { ...room.settings },
      round: room.round,
      totalRounds: room.totalRounds,
      deadline,
      roundInfo:
        room.phase === 'round_submit' || room.phase === 'round_waiting'
          ? {
              submittedPlayerIds: [...room.submissions],
              activePlayerIds: activeIds,
              assignedPlayerIds: [...room.assignments.keys()],
              deadline: room.roundDeadline,
            }
          : null,
      voting: votingView,
      chains: showChains ? chainViews : null,
      results: room.phase === 'results' ? room.result : null,
      yourChainId: yourChain ?? null,
      you,
      paused: room.paused,
      notice: room.notice,
      serverTime: Date.now(),
    };
  }

  private buildAssignment(room: Room, player: Player): RoundAssignment | null {
    if (room.phase !== 'round_submit' && room.phase !== 'round_waiting') return null;
    const chainId = room.assignments.get(player.id);
    if (!chainId) return null;
    const chain = room.chains.get(chainId);
    if (!chain) return null;
    const latest = chain.panels[chain.panels.length - 1] ?? null;
    const captionKind = captionKindForIndex(chain.panels.length);
    return {
      chainId,
      round: room.round,
      isFirstRound: room.round === 1,
      caption: renderPanelCaption(captionKind, room.settings),
      captionKind,
      latestPanel: latest ? this.panelView(latest) : null,
      deadline: room.roundDeadline,
    };
  }

  private chainViews(room: Room): ChainView[] {
    return room.chainOrder
      .map((chainId) => room.chains.get(chainId))
      .filter((chain): chain is Chain => Boolean(chain))
      .sort((a, b) => a.index - b.index)
      .map((chain) => ({
        id: chain.id,
        index: chain.index,
        ownerId: chain.ownerId,
        ownerName: chain.ownerName,
        panels: chain.panels.map((panel) => this.panelView(panel)),
      }));
  }

  private panelView(panel: Panel): PanelView {
    return {
      id: panel.id,
      round: panel.round,
      imageUrl: panel.imageId ? `/api/images/${panel.imageId}` : null,
      text: panel.text,
      textPosition: panel.textPosition,
      caption: panel.caption,
      captionKind: panel.captionKind,
      authorId: panel.authorId,
      authorName: panel.authorName,
      auto: panel.auto,
    };
  }

  private broadcast(room: Room): void {
    for (const player of room.players) {
      if (!player.connected || !player.socketId || player.left) continue;
      const socket = this.io.sockets.sockets.get(player.socketId);
      if (!socket) continue;
      socket.emit('room_state', this.buildSnapshot(room, player));
    }
  }

  private bump(room: Room): void {
    room.rev++;
    room.updatedAt = Date.now();
  }

  private bindSocket(socket: Socket, room: Room, player: Player): void {
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    player.connected = true;
    player.socketId = socket.id;
    socket.join(room.code);
  }

  private makePlayer(nickname: string, _isHost: boolean): Player {
    return {
      id: randomUUID(),
      nickname,
      token: randomBytes(24).toString('hex'),
      socketId: null,
      connected: false,
      left: false,
      ready: false,
      joinedAt: Date.now(),
    };
  }

  private uniqueNickname(room: Room, desired: string): string {
    const taken = new Set(room.players.map((player) => player.nickname.toLowerCase()));
    if (!taken.has(desired.toLowerCase())) return desired;
    let suffix = 2;
    while (taken.has(`${desired} (${suffix})`.toLowerCase())) suffix++;
    let base = desired;
    const suffixText = ` (${suffix})`;
    if (base.length + suffixText.length > 20) base = base.slice(0, 20 - suffixText.length).trim();
    return `${base}${suffixText}`;
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 5; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  private sessionForPlayer(room: Room, player: Player): SessionInfo {
    return {
      roomCode: room.code,
      playerId: player.id,
      token: player.token,
      nickname: player.nickname,
    };
  }

  private hasConnectedHost(room: Room): boolean {
    const host = room.players.find((player) => player.id === room.hostId);
    return Boolean(host && host.connected && !host.left);
  }

  private pickNextHost(room: Room, excludedId: string, connectedOnly: boolean): Player | null {
    const candidates = room.players
      .filter((player) => !player.left && player.id !== excludedId && (!connectedOnly || player.connected))
      .sort((a, b) => a.joinedAt - b.joinedAt);
    return candidates[0] ?? null;
  }

  private clearRoomTimers(room: Room): void {
    room.roundTimer = clearTimer(room.roundTimer);
    room.transitionTimer = clearTimer(room.transitionTimer);
    room.hostTimer = clearTimer(room.hostTimer);
    if (room.voting) room.voting.timer = clearTimer(room.voting.timer);
  }

  private destroyRoom(room: Room, message: string): void {
    this.clearRoomTimers(room);
    this.rooms.delete(room.code);
    this.images.removeRoom(room.code);
    this.io.to(room.code).emit('room_closed', { message });
    this.io.in(room.code).socketsLeave(room.code);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (now - room.updatedAt > ROOM_TTL_MS) {
        this.destroyRoom(room, 'This room expired after a long break. Start a fresh one!');
      }
    }
  }
}
