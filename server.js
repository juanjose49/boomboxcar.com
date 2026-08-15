import { createServer } from 'node:http';
import { createApp } from './server/app.js';
import { startReservationExpiry } from './server/expiry.js';

const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '127.0.0.1';
const server = createServer(createApp());
const reservationExpiry = startReservationExpiry();

server.listen(port, host, () => {
  console.log(`BoomBoxCar API listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, closing BoomBoxCar API.`);
  reservationExpiry.stop();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
