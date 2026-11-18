import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket } from 'socket.io-client';
import type { ActionResponse, RoomState, SessionInfo } from '../src/shared/types';
import { createServer } from '../src/server/createServer';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function emitAck(socket: Socket, event: string, payload: unknown): Promise<ActionResponse> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (error: Error | null, response: ActionResponse) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

class TestClient {
  readonly socket: Socket;
  session: SessionInfo;
  latest: RoomState | null = null;
  private waiters: Array<{
    predicate: (state: RoomState) => boolean;
    resolve: (state: RoomState) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  private constructor(socket: Socket, session: SessionInfo) {
    this.socket = socket;
    this.session = session;
    this.socket.on('room_state', (state: RoomState) => {
      this.latest = state;
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(state)) {
          clearTimeout(waiter.timer);
          this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
          waiter.resolve(state);
        }
      }
    });
  }

  static async connect(origin: string): Promise<Socket> {
    const socket = createClient(origin, { forceNew: true, transports: ['websocket'] });
    if (!socket.connected) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket connection timed out.')), 5000);
        socket.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once('connect_error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
    }
    return socket;
  }

  static async create(origin: string, nickname: string): Promise<TestClient> {
    const socket = await TestClient.connect(origin);
    const response = await emitAck(socket, 'create_room', { nickname });
    assert.equal(response.ok, true, response.ok ? '' : response.error);
    if (!response.ok || !response.session) throw new Error('Create did not return a session.');
    return new TestClient(socket, response.session);
  }

  static async join(origin: string, nickname: string, roomCode: string): Promise<TestClient> {
    const socket = await TestClient.connect(origin);
    const response = await emitAck(socket, 'join_room', { nickname, roomCode });
    assert.equal(response.ok, true, response.ok ? '' : response.error);
    if (!response.ok || !response.session) throw new Error('Join did not return a session.');
    return new TestClient(socket, response.session);
  }

  waitFor(predicate: (state: RoomState) => boolean, label: string, timeout = 12000): Promise<RoomState> {
    if (this.latest && predicate(this.latest)) return Promise.resolve(this.latest);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.timer !== timer);
        reject(new Error(`Timed out waiting for ${label}. Last phase: ${this.latest?.phase ?? 'none'}`));
      }, timeout);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  async action(event: string, payload: unknown = {}): Promise<ActionResponse> {
    return emitAck(this.socket, event, payload);
  }

  close(): void {
    this.socket.disconnect();
  }
}

async function startTestServer() {
  const server = createServer({ serveClient: false });
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function playInitialRounds(clients: TestClient[], rounds: number, pronoun = 'HE') {
  for (let round = 1; round <= rounds; round++) {
    const states = await Promise.all(
      clients.map((client) =>
        client.waitFor(
          (state) => state.phase === 'round_submit' && state.round === round,
          `round ${round} submission for ${client.session.nickname}`,
        ),
      ),
    );
    for (let index = 0; index < clients.length; index++) {
      const state = states[index];
      assert.ok(state.you.assignment, 'player should have an assignment');
      if (round > 1) {
        assert.ok(state.you.assignment.latestPanel, 'round 2+ should reveal the latest panel');
        assert.notEqual(
          state.you.assignment.latestPanel.authorId,
          clients[index].session.playerId,
          'a player should never be shown their own latest panel',
        );
        const expectedKind = round % 2 === 0 ? 'answer' : 'call';
        assert.equal(state.you.assignment.captionKind, expectedKind);
        assert.equal(
          state.you.assignment.caption,
          expectedKind === 'call' ? `AND THEN ${pronoun} WALKS IN` : 'AND WALKS OUT TF?',
        );
      }
      const response = await clients[index].action('submit_panel', { dataUrl: TINY_PNG });
      assert.equal(response.ok, true, response.ok ? '' : response.error);
    }
  }
}

test('full 4-round game with captions, reveal, voting, and a winner', { timeout: 40000 }, async (t) => {
  const { server, origin } = await startTestServer();
  const clients: TestClient[] = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    await server.close();
  });

  const host = await TestClient.create(origin, 'Host');
  clients.push(host);
  const bea = await TestClient.join(origin, 'Bea', host.session.roomCode);
  clients.push(bea);
  const cee = await TestClient.join(origin, 'Cee', host.session.roomCode);
  clients.push(cee);

  await host.waitFor((state) => state.players.length === 3, 'three players in lobby');
  const settingsResponse = await host.action('update_settings', {
    settings: {
      pronoun: 'HE',
      answerCaption: 'AND WALKS OUT TF?',
      totalRounds: 4,
      submissionTimerSec: 0,
      votingTimerSec: 0,
      allowSelfVote: false,
      suddenDeathEnabled: false,
      drawingMode: false,
    },
  });
  assert.equal(settingsResponse.ok, true);
  await host.waitFor((state) => state.settings.pronoun === 'HE' && state.totalRounds === 4, 'updated settings');

  const startResponse = await host.action('start_game');
  assert.equal(startResponse.ok, true, startResponse.ok ? '' : startResponse.error);

  await playInitialRounds(clients, 4);

  const revealState = await host.waitFor((state) => state.phase === 'reveal', 'reveal', 8000);
  assert.ok(revealState.chains);
  assert.equal(revealState.chains.length, 3);
  for (const chain of revealState.chains) {
    assert.equal(chain.panels.length, 4, `chain ${chain.index} should have 4 panels`);
    for (const [panelIndex, panel] of chain.panels.entries()) {
      const expectedKind = panelIndex % 2 === 0 ? 'call' : 'answer';
      assert.equal(panel.captionKind, expectedKind);
      assert.equal(
        panel.caption,
        expectedKind === 'call' ? 'AND THEN HE WALKS IN' : 'AND WALKS OUT TF?',
      );
      assert.ok(panel.imageUrl, 'image submissions should keep an image URL');
      assert.equal(panel.text, null);
    }
  }

  const votingStart = await host.action('start_voting');
  assert.equal(votingStart.ok, true);
  const votingStates = await Promise.all(
    clients.map((client) => client.waitFor((state) => state.phase === 'final_voting', 'voting')),
  );

  for (let index = 0; index < clients.length; index++) {
    const state = votingStates[index];
    assert.equal(state.you.eligibleChainIds.includes(state.yourChainId ?? ''), false);
    const target = state.you.eligibleChainIds[0];
    assert.ok(target);
    const voteResponse = await clients[index].action('vote', { chainId: target });
    assert.equal(voteResponse.ok, true, voteResponse.ok ? '' : voteResponse.error);
  }

  const results = await host.waitFor((state) => state.phase === 'results', 'results');
  assert.ok(results.results);
  assert.equal(results.results.pendingHostTieBreak, false);
  assert.equal(results.results.winnerChainIds.length, 1);
  assert.equal(results.results.totalVotes, 3);
  const winner = results.chains?.find((chain) => chain.id === results.results?.winnerChainIds[0]);
  assert.equal(winner?.ownerName, 'Host');
});

test('two-player long game never shows a player their own picture', { timeout: 45000 }, async (t) => {
  const { server, origin } = await startTestServer();
  const clients: TestClient[] = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    await server.close();
  });

  const host = await TestClient.create(origin, 'Host');
  clients.push(host);
  const guest = await TestClient.join(origin, 'Guest', host.session.roomCode);
  clients.push(guest);

  await host.waitFor((state) => state.players.length === 2, 'two players in lobby');
  const settingsResponse = await host.action('update_settings', {
    settings: {
      pronoun: 'SHE',
      answerCaption: 'AND WALKS OUT TF?',
      totalRounds: 6,
      submissionTimerSec: 0,
      votingTimerSec: 0,
      allowSelfVote: false,
      suddenDeathEnabled: false,
      drawingMode: false,
    },
  });
  assert.equal(settingsResponse.ok, true);
  await host.waitFor((state) => state.totalRounds === 6, 'updated settings');

  const startResponse = await host.action('start_game');
  assert.equal(startResponse.ok, true, startResponse.ok ? '' : startResponse.error);

  // Six rounds forces the assignment past the point where the two players
  // have each written into both chains, which is where the old owner-only
  // rule handed players their own latest picture back.
  await playInitialRounds(clients, 6, 'SHE');

  const revealState = await host.waitFor((state) => state.phase === 'reveal', 'reveal', 8000);
  assert.ok(revealState.chains);
  assert.equal(revealState.chains.length, 2);
  for (const chain of revealState.chains) {
    assert.equal(chain.panels.length, 6);
  }
});

test('tie is handed to the host and the host can crown a winner', { timeout: 30000 }, async (t) => {
  const { server, origin } = await startTestServer();
  const clients: TestClient[] = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    await server.close();
  });

  const host = await TestClient.create(origin, 'Boss');
  clients.push(host);
  const guest = await TestClient.join(origin, 'Guest', host.session.roomCode);
  clients.push(guest);

  await host.action('update_settings', {
    settings: {
      pronoun: 'THEY',
      answerCaption: 'AND WALKS OUT TF?',
      totalRounds: 2,
      submissionTimerSec: 0,
      votingTimerSec: 0,
      allowSelfVote: false,
      suddenDeathEnabled: false,
      drawingMode: false,
    },
  });
  await host.waitFor((state) => state.totalRounds === 2 && state.settings.pronoun === 'THEY', 'settings');
  assert.equal((await host.action('start_game')).ok, true);

  await playInitialRounds(clients, 2, 'THEY');
  await host.waitFor((state) => state.phase === 'reveal', 'reveal');
  assert.equal((await host.action('start_voting')).ok, true);

  const hostVoting = await host.waitFor((state) => state.phase === 'final_voting', 'host voting');
  const guestVoting = await guest.waitFor((state) => state.phase === 'final_voting', 'guest voting');
  assert.equal((await host.action('vote', { chainId: hostVoting.you.eligibleChainIds[0] })).ok, true);
  assert.equal((await guest.action('vote', { chainId: guestVoting.you.eligibleChainIds[0] })).ok, true);

  const tied = await host.waitFor((state) => state.phase === 'results', 'tied results');
  assert.equal(tied.results?.pendingHostTieBreak, true);
  assert.equal(tied.results?.winnerChainIds.length, 0);
  assert.equal(tied.results?.tiedChainIds.length, 2);

  const chosen = tied.results?.tiedChainIds[0];
  assert.ok(chosen);
  assert.equal((await host.action('tie_break', { chainId: chosen })).ok, true);
  const resolved = await host.waitFor(
    (state) => state.phase === 'results' && state.results?.pendingHostTieBreak === false,
    'host tiebreak',
  );
  assert.deepEqual(resolved.results?.winnerChainIds, [chosen]);
  assert.equal(resolved.results?.decidedBy, 'host');
});

test('duplicate nicknames are suffixed and invalid settings fall back', async (t) => {
  const { server, origin } = await startTestServer();
  const clients: TestClient[] = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    await server.close();
  });

  const host = await TestClient.create(origin, 'Alex');
  clients.push(host);
  const duplicate = await TestClient.join(origin, 'alex', host.session.roomCode);
  clients.push(duplicate);
  assert.equal(duplicate.session.nickname, 'alex (2)');

  await host.action('update_settings', {
    settings: {
      pronoun: '',
      answerCaption: 'x'.repeat(200),
      totalRounds: 99,
      submissionTimerSec: 0,
      votingTimerSec: 0,
      allowSelfVote: false,
      suddenDeathEnabled: false,
      drawingMode: false,
    },
  });
  const state = await host.waitFor((next) => next.players.length === 2, 'lobby state');
  assert.equal(state.settings.pronoun, 'SHE');
  assert.equal(state.settings.answerCaption, 'AND WALKS OUT TF?');
  assert.equal(state.settings.totalRounds, 12);
});

test('text panels can be submitted instead of images', { timeout: 30000 }, async (t) => {
  const { server, origin } = await startTestServer();
  const clients: TestClient[] = [];
  t.after(async () => {
    clients.forEach((client) => client.close());
    await server.close();
  });

  const host = await TestClient.create(origin, 'Host');
  clients.push(host);
  const guest = await TestClient.join(origin, 'Guest', host.session.roomCode);
  clients.push(guest);

  await host.waitFor((state) => state.players.length === 2, 'two players');
  await host.action('update_settings', {
    settings: {
      ...{
        pronoun: 'SHE',
        answerCaption: 'AND WALKS OUT TF?',
        totalRounds: 2,
        submissionTimerSec: 0,
        votingTimerSec: 0,
        allowSelfVote: false,
        suddenDeathEnabled: false,
        drawingMode: false,
      },
    },
  });
  await host.waitFor((state) => state.totalRounds === 2, 'settings');
  assert.equal((await host.action('start_game')).ok, true);

  await host.waitFor((state) => state.phase === 'round_submit' && state.round === 1, 'round 1 host');
  await guest.waitFor((state) => state.phase === 'round_submit' && state.round === 1, 'round 1 guest');
  assert.equal((await host.action('submit_panel', { dataUrl: TINY_PNG })).ok, true);
  assert.equal((await guest.action('submit_panel', { dataUrl: TINY_PNG })).ok, true);

  await host.waitFor((state) => state.phase === 'round_submit' && state.round === 2, 'round 2 host');
  await guest.waitFor((state) => state.phase === 'round_submit' && state.round === 2, 'round 2 guest');
  const textResponse = await host.action('submit_panel', {
    text: '  a suspiciously  normal\n\ntext panel  ',
    dataUrl: TINY_PNG,
    textPosition: 'top-right',
  });
  assert.equal(textResponse.ok, true, textResponse.ok ? '' : textResponse.error);
  const plainTextResponse = await guest.action('submit_panel', { text: 'just a plain text panel' });
  assert.equal(plainTextResponse.ok, true, plainTextResponse.ok ? '' : plainTextResponse.error);

  const revealState = await host.waitFor((state) => state.phase === 'reveal', 'reveal');
  assert.ok(revealState.chains);
  const textPanels = revealState.chains
    .flatMap((chain) => chain.panels)
    .filter((panel) => panel.text);
  assert.equal(textPanels.length, 2);

  const backedTextPanel = textPanels.find((panel) => panel.imageUrl);
  assert.ok(backedTextPanel, 'a text panel can carry a background image');
  assert.equal(backedTextPanel.text, 'a suspiciously normal\n\ntext panel');
  assert.equal(backedTextPanel.textPosition, 'top-right');
  assert.ok(backedTextPanel.imageUrl?.startsWith('/api/images/'));
  assert.ok(backedTextPanel.caption, 'text panels still carry a caption');

  const plainTextPanel = textPanels.find((panel) => !panel.imageUrl);
  assert.ok(plainTextPanel, 'a text panel can still have no background');
  assert.equal(plainTextPanel.text, 'just a plain text panel');
  assert.equal(plainTextPanel.imageUrl, null);
  assert.equal(plainTextPanel.textPosition, 'bottom-left', 'missing corners fall back to bottom-left');
});
