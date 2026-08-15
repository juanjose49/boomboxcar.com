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
GET  /api/modifiers?durationHours=1
POST /api/availability
POST /api/reservations
```

The modifier endpoint reads the modifier sets already attached to each configured Square service. The backend uses Square Catalog names, prices, selection rules, and IDs instead of duplicating them in environment variables. A completed reservation creates a Square Booking and then a linked Square Order. The readable modifier summary remains in the booking note, and the Order receives the actual Catalog modifier IDs. If Square accepts the booking but rejects the order, the reservation is preserved with an order warning for review instead of risking a duplicate appointment.

The Square access token must permit Catalog reads, booking/customer operations, and order creation. For OAuth applications, this means the applicable `ITEMS_READ`, `APPOINTMENTS_WRITE`, `CUSTOMERS_READ`, `CUSTOMERS_WRITE`, and `ORDERS_WRITE` permissions.

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
