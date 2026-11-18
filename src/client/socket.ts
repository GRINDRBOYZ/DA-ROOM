import { io } from 'socket.io-client';
import type { ActionResponse } from '../shared/types';

export const socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  timeout: 10000,
});

export function request(event: string, payload: unknown = {}): Promise<ActionResponse> {
  return new Promise((resolve) => {
    socket.timeout(15000).emit(event, payload, (error: Error | null, response: ActionResponse) => {
      if (error) {
        resolve({ ok: false, error: 'The server is taking too long to respond. Check your connection.' });
        return;
      }
      resolve(response);
    });
  });
}
