import { createServer as createHttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { ImageStore } from './images';
import { RoomManager } from './roomManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface DaRoomServer {
  httpServer: ReturnType<typeof createHttpServer>;
  io: SocketServer;
  manager: RoomManager;
  images: ImageStore;
  close: () => Promise<void>;
}

export function createServer(options: { serveClient?: boolean } = {}): DaRoomServer {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  const images = new ImageStore();
  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, {
    maxHttpBufferSize: 4 * 1024 * 1024,
    cors: { origin: true },
    serveClient: false,
  });
  const manager = new RoomManager(io, images);
  io.on('connection', (socket) => manager.attach(socket));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'da-room' });
  });

  app.get('/api/images/:id', (req, res) => {
    const image = images.get(req.params.id);
    if (!image) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }
    res.setHeader('Content-Type', image.mime);
    res.setHeader('Content-Length', String(image.bytes));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.send(image.buffer);
  });

  const shouldServeClient = options.serveClient ?? process.env.NODE_ENV !== 'test';
  if (shouldServeClient) {
    const distPath = path.resolve(__dirname, '../../dist');
    if (existsSync(path.join(distPath, 'index.html'))) {
      app.use(express.static(distPath, { index: false, maxAge: '1h' }));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) {
          next();
          return;
        }
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const close = async (): Promise<void> => {
    manager.stop();
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      if (!httpServer.listening) return resolve();
      httpServer.close(() => resolve());
    });
  };

  return { httpServer, io, manager, images, close };
}
