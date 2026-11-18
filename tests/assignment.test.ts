import assert from 'node:assert/strict';
import test from 'node:test';
import { matchChains } from '../src/server/assignment';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

test('random chain matching assigns every player and never their own chain', () => {
  for (let size = 2; size <= 12; size++) {
    const participants = Array.from({ length: size }, (_, index) => ({ id: `player-${index}` }));
    const chains = participants.map((participant, index) => ({
      id: `chain-${index}`,
      ownerId: participant.id,
    }));
    const random = seededRandom(0xda_40_0f + size);

    for (let run = 0; run < 500; run++) {
      const matches = matchChains(participants, chains, random);
      assert.equal(matches.size, size, `${size} players should all get a chain`);
      const assignedPlayers = new Set(matches.values());
      assert.equal(assignedPlayers.size, size, 'no player should get two chains');
      for (const participant of participants) {
        assert.ok(assignedPlayers.has(participant.id), `${participant.id} should be assigned`);
      }
      for (const [chainId, playerId] of matches) {
        const chain = chains.find((candidate) => candidate.id === chainId);
        assert.ok(chain);
        assert.notEqual(chain.ownerId, playerId, 'a player must never receive their own chain');
      }
    }
  }
});

test('matching leaves a player unassigned instead of exposing their own chain', () => {
  const matches = matchChains([{ id: 'solo' }], [{ id: 'own-chain', ownerId: 'solo' }]);
  assert.equal(matches.size, 0);
});

test('matching tolerates more chains than players', () => {
  const participants = [{ id: 'a' }, { id: 'b' }];
  const chains = [
    { id: 'chain-a', ownerId: 'a' },
    { id: 'chain-b', ownerId: 'b' },
    { id: 'chain-c', ownerId: 'a' },
  ];

  for (let run = 0; run < 100; run++) {
    const matches = matchChains(participants, chains, seededRandom(run + 1));
    const assignedPlayers = new Set(matches.values());
    assert.equal(assignedPlayers.size, 2);
    for (const [chainId, playerId] of matches) {
      const chain = chains.find((candidate) => candidate.id === chainId);
      assert.notEqual(chain?.ownerId, playerId);
    }
  }
});

test('matching never hands a player the chain whose latest panel they made', () => {
  const participants = [{ id: 'a' }, { id: 'b' }];
  // Round 3 with two players: each chain now ends with the other player's
  // panel. Avoid-own-chain alone is impossible here, but the latest panel of
  // each chain is safe, so both players can still be dealt in.
  const chains = [
    { id: 'chain-a', ownerId: 'a', latestAuthorId: 'b' },
    { id: 'chain-b', ownerId: 'b', latestAuthorId: 'a' },
  ];

  for (let run = 0; run < 100; run++) {
    const matches = matchChains(participants, chains, seededRandom(run + 1));
    assert.equal(matches.size, 2, 'both players should still get a chain');
    for (const [chainId, playerId] of matches) {
      const chain = chains.find((candidate) => candidate.id === chainId);
      assert.notEqual(chain?.latestAuthorId, playerId, 'a player must never continue their own picture');
    }
  }
});

test('many rounds of dealing never show a player their own latest panel', () => {
  for (let size = 2; size <= 12; size++) {
    const participants = Array.from({ length: size }, (_, index) => ({ id: `player-${index}` }));
    const chains = participants.map((participant, index) => ({
      id: `chain-${index}`,
      ownerId: participant.id,
      latestAuthorId: participant.id as string | null,
    }));
    const random = seededRandom(0xbeef + size);

    for (let round = 0; round < 60; round++) {
      const matches = matchChains(participants, chains, random);
      assert.equal(matches.size, size, `${size} players should all get a chain in round ${round + 1}`);
      for (const [chainId, playerId] of matches) {
        const chain = chains.find((candidate) => candidate.id === chainId);
        assert.notEqual(
          chain?.latestAuthorId,
          playerId,
          `${playerId} was shown their own panel from chain ${chainId} in round ${round + 1}`,
        );
        // The player's submission becomes that chain's new latest panel.
        if (chain) chain.latestAuthorId = playerId;
      }
    }
  }
});
