# BoomBoxCar.com

BoomBoxCar is a bilingual static website with a dependency-free Node API for Square availability and booking creation.

## Local development

Use Node 24 LTS or Node 22. Copy `.env.example` values into your shell environment, then run:

```sh
npm start
```

In development, the Node server exposes the site and API together at `http://127.0.0.1:3100`. With placeholder Square credentials, the booking form automatically falls back to the hosted Square scheduler.

Useful routes:

```text
GET  /api/health
GET  /api/config
POST /api/availability
POST /api/reservations
```

Reservation records are appended to `data/reservations.jsonl` with owner-only permissions. The directory is ignored by Git and must remain outside `public_html` in production.

## cPanel application

Use these values in Setup Node.js App:

```text
Node.js version: 24.x LTS (22.x fallback)
Application mode: Production
Application root: /home/boomwowp/dist/app
Application URL: https://boomboxcar.com/api
Startup file: server.js
```

The application uses the environment variables listed in `.env.example`. Do not put the access token in Git or `public_html`.

## First server deployment

After the repository is cloned on the server, run this from the repository root:

```sh
npm run deploy:cpanel
```

The deploy script has explicit safety checks for `/home/boomwowp/dist/app` and `/home/boomwowp/public_html`. It replaces only BoomBoxCar-owned files and preserves unrelated cPanel files such as `.htaccess`, `.well-known`, and `cgi-bin`.

## Repeated deployment after a Git push

SSH to the server, enter the repository, pull, and run the same deployment command:

```sh
cd /path/to/boomboxcar.com
git pull --ff-only origin main
npm run deploy:cpanel
```

The final command builds clean artifacts, replaces the previous public/API files, and touches `tmp/restart.txt` so cPanel Passenger reloads `server.js`.
