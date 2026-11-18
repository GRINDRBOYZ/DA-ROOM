export interface AssignmentParticipant {
  id: string;
}

export interface AssignmentChain {
  id: string;
  ownerId: string;
  /**
   * Author of the chain's latest panel. The assigned player is shown that
   * panel, so it must never belong to them.
   */
  latestAuthorId?: string | null;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function safeEdge(chain: AssignmentChain, playerId: string, avoidOwnChain: boolean): boolean {
  // Hard rule: never hand a player a chain whose latest panel they made.
  // This is what the player actually sees as the prompt for their next panel.
  if (chain.latestAuthorId === playerId) return false;
  // An empty chain only contains the owner's starting image, so the owner
  // must never receive it.
  if (chain.latestAuthorId == null && chain.ownerId === playerId) return false;
  // Prefer avoiding the chain a player started even when it now ends with
  // someone else's panel. Some deals (for example two players in an odd
  // round) are only possible without this preference, so it is soft.
  if (avoidOwnChain && chain.ownerId === playerId) return false;
  return true;
}

function tryMatch(
  participants: AssignmentParticipant[],
  chains: AssignmentChain[],
  random: () => number,
  avoidOwnChain: boolean,
): Map<string, string> {
  const chainToPlayer = new Map<string, string>();
  const shuffledParticipants = shuffle(participants, random);
  const shuffledChains = shuffle(chains, random);

  const tryAssign = (playerId: string, visited: Set<string>): boolean => {
    for (const chain of shuffledChains) {
      if (visited.has(chain.id)) continue;
      if (!safeEdge(chain, playerId, avoidOwnChain)) continue;
      visited.add(chain.id);
      const current = chainToPlayer.get(chain.id);
      if (!current || tryAssign(current, visited)) {
        chainToPlayer.set(chain.id, playerId);
        return true;
      }
    }
    return false;
  };

  for (const participant of shuffledParticipants) {
    tryAssign(participant.id, new Set());
  }

  return chainToPlayer;
}

/**
 * Randomly match players to chains.
 *
 * The hard rule is that a player never receives a chain whose latest panel
 * they authored: that panel is the image or text they are asked to continue,
 * so seeing it would be seeing their own work. Avoiding the chain a player
 * started is also applied whenever a full deal is still possible.
 *
 * This is a randomized bipartite matching. Unmatched players stay unmatched
 * (and are benched by the caller) rather than ever being shown their own
 * picture.
 */
export function matchChains(
  participants: AssignmentParticipant[],
  chains: AssignmentChain[],
  random: () => number = Math.random,
): Map<string, string> {
  if (participants.length === 0 || chains.length === 0) return new Map();

  const preferred = tryMatch(participants, chains, random, true);
  const perfectSize = Math.min(participants.length, chains.length);
  if (preferred.size >= perfectSize) return preferred;

  const relaxed = tryMatch(participants, chains, random, false);
  return relaxed.size > preferred.size ? relaxed : preferred;
}
