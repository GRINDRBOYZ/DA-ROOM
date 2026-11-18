import { io } from 'socket.io-client';

const origin = process.argv[2] ?? 'http://localhost:3001';
const roomCode = process.argv[3];
const nicknames = (process.argv[4] ?? 'BotOne,BotTwo').split(',').filter(Boolean);
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

if (!roomCode) {
  console.error('usage: node bots.mjs ORIGIN ROOMCODE NICK1,NICK2');
  process.exit(1);
}

function action(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

for (const nickname of nicknames) {
  const socket = io(origin, { forceNew: true, transports: ['websocket'] });
  let inflight = false;
  socket.on('connect', async () => {
    const response = await action(socket, 'join_room', { nickname, roomCode });
    console.log(nickname, 'joined', JSON.stringify(response));
  });
  socket.on('room_state', async (state) => {
    if (inflight) return;
    if (state.phase === 'round_submit' && state.you.assignment && !state.you.hasSubmitted) {
      inflight = true;
      const useText = nickname === 'BotTwo' && state.round === 2;
      const payload = useText
        ? { text: 'BOT TWO SAYS: the plot thickens, suspiciously.' }
        : { dataUrl: TINY_PNG };
      const response = await action(socket, 'submit_panel', payload);
      console.log(nickname, `submitted round ${state.round}`, JSON.stringify(response));
      inflight = false;
    } else if (state.phase === 'final_voting' && !state.you.hasVoted && state.you.eligibleChainIds.length > 0) {
      inflight = true;
      const response = await action(socket, 'vote', { chainId: state.you.eligibleChainIds[0] });
      console.log(nickname, 'voted', JSON.stringify(response));
      inflight = false;
    }
  });
  socket.on('room_closed', (payload) => {
    console.log(nickname, 'room closed', JSON.stringify(payload));
    socket.disconnect();
  });
  socket.on('connect_error', (error) => console.error(nickname, 'connect error', error.message));
}
