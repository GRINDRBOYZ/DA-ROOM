import { createServer } from './createServer';

const port = Number(process.env.PORT) || 3001;
const server = createServer();

server.httpServer.listen(port, () => {
  console.log(`\n  DA ROOM server listening on http://localhost:${port}\n`);
});

const shutdown = () => {
  console.log('\n  Closing DA ROOM…');
  server
    .close()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
