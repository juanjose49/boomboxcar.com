import { createServer } from 'node:http';
import { createApp } from './server/app.js';

const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '127.0.0.1';
const server = createServer(createApp());

server.listen(port, host, () => {
  console.log(`BoomBoxCar API listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, closing BoomBoxCar API.`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
