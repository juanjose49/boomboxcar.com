import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const app = path.join(dist, 'app');
const publicDir = path.join(dist, 'public');

await rm(dist, { recursive: true, force: true });
await mkdir(app, { recursive: true });
await mkdir(publicDir, { recursive: true });

for (const entry of ['server.js', 'expire-reservations.js', 'package.json', 'server']) {
  await cp(path.join(root, entry), path.join(app, entry), { recursive: true });
}

for (const entry of ['index.html', 'index.css', 'index.js', 'booking.js', 'robots.txt', 'sitemap.xml', 'es', 'images']) {
  await cp(path.join(root, entry), path.join(publicDir, entry), { recursive: true });
}

console.log(`Built cPanel application: ${app}`);
console.log(`Built public website: ${publicDir}`);
