# BoomBoxCar.com

BoomBoxCar is a bilingual static website with a dependency-free Node API for Square availability, booking creation, and hosted payment checkout.

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
GET  /api/packages
GET  /api/modifiers?durationHours=1
POST /api/availability
POST /api/coupons/validate
POST /api/reservations
POST /api/reservations/apple-pay
GET  /api/confirmations/:reservationId?token=...
POST /api/webhooks/square
```

The package and modifier endpoints read the configured Square Catalog services. On startup, the booking page refreshes every duration card with its current Square price; selecting a duration then loads that package's current price, modifiers, selection rules, and Catalog IDs before recalculating the estimate. The server repeats the same Catalog calculation when the reservation is submitted, so browser-supplied prices are never authoritative. The booking form requires a duration before enabling date and arrival-time selection. If the duration changes later, an already selected arrival time remains selected when Square reports that the same time is still available for the new duration. The form collects structured street, unit, city, state, and ZIP fields. Contact information, address, duration, event date, arrival time, event type, setting, attendance, and special requests are saved locally in the visitor's browser for one hour after the most recent edit. The draft is restored after refreshes and Square checkout returns for quick repeat checkouts. A restored arrival time is accepted only after Square confirms that the slot is still available. Catalog modifiers, reservation IDs, confirmation tokens, and payment information are never stored in this browser draft. The backend validates required components, supported characters, US ZIP format, and the DC, Maryland, and Virginia service area before contacting Square. This validation checks structure and service-area eligibility, not whether a postal address exists.

Eligible Safari and Apple devices see a native Apple Pay button on `boomboxcar.com`. The Square Web Payments SDK tokenizes the wallet payment in the browser, then the backend rechecks the live Catalog total and availability before creating the customer-location appointment, itemized Square order, and completed payment. A stale browser total is rejected before the appointment or charge is created. The existing Square-hosted Checkout button remains available as the universal fallback. Its checkout prepopulates the customer first name, last name, email, and normalized phone number. If the email already belongs to a Square customer, the backend first updates that profile with the normalized contact name and phone so stale directory data cannot override checkout prefill. Only the contact names are placed in checkout's `buyer_address` object, so shipping-address collection remains disabled and the event address stays on the appointment. Customer names are normalized so the first word is the given name and all remaining words form the family name. Both payment routes keep the contact name, phone, event address, booking ID, package, and Catalog modifiers on the Square order. Hosted checkout reservations remain `PENDING` for up to 30 minutes. If Square accepts a booking but payment setup fails, the backend cancels the booking so the customer can safely retry. A cancellation failure is persisted and returned as a manual-review error.

The booking summary includes a collapsed coupon-code field. Coupon definitions stay private on the server in `BOOMBOXCAR_COUPONS`, using comma-separated `CODE:TYPE:VALUE` entries. `TYPE` is `PERCENT` or `FIXED`, where fixed values are US dollars. For example, `WELCOME10:PERCENT:10,BOOM50:FIXED:50` creates a 10 percent code and a $50 code. For payment-flow testing, a code configured as `TEST_SALE:PERCENT:100` dynamically discounts any booking to a one-cent balance instead of zero. Do not use a 100 percent code as a public promotion. Codes are normalized to uppercase and may contain letters, digits, underscores, and hyphens. The backend validates the code, selected package, and modifiers, calculates the discount in cents, and adds the discount to the Square order for both Apple Pay and hosted checkout. A fixed coupon that equals or exceeds the current subtotal is rejected before booking creation because the payment routes require at least $0.01 due. Do not configure the same promotion again as a Square Marketing coupon because that could create two independently redeemable versions of the discount.

After successful payment, Square redirects to `/confirmation/` with the reservation ID and a private, randomly generated confirmation token. The confirmation API returns booking details only when that token matches and the Square order has been recorded or reconciled as paid. The read-only confirmation page shows the customer, schedule, service address, package, modifiers, total, included scope, requests, Square references, and receipt link. Its download button opens the browser print dialog, and its print stylesheet forces a white, letter-sized layout for reliable Save as PDF output even when the site or operating system is using dark mode.

The Square access token must permit Catalog reads, booking/customer operations, checkout order creation, and payments. For OAuth applications, this means the applicable `ITEMS_READ`, `APPOINTMENTS_WRITE`, `CUSTOMERS_READ`, `CUSTOMERS_WRITE`, `ORDERS_READ`, `ORDERS_WRITE`, and `PAYMENTS_WRITE` permissions. Seller-level booking writes also require Square Appointments Plus or Premium.

Square Checkout creates its order and payment link together, while direct Apple Pay intentionally uses the Orders and Payments APIs. The two order paths must remain separate because Square cannot attach a hosted payment link to an existing order. For direct Apple Pay, register `boomboxcar.com` in the production Square application and keep Square's association file available at `https://boomboxcar.com/.well-known/apple-developer-merchantid-domain-association`. Apple Pay requires HTTPS and a supported Safari/Apple Wallet device. Sandbox testing still requires a real card in Apple Wallet, but Square does not charge it in the sandbox environment.

Reservation records are appended to `data/reservations.jsonl` with owner-only permissions. The directory is ignored by Git and must remain outside `public_html` in production.

## Square payment webhooks

In the Square Developer Console, create a production webhook subscription using this exact notification URL:

```text
https://boomboxcar.com/api/webhooks/square
```

Subscribe to `payment.created` and `payment.updated`, then copy the subscription signature key into `SQUARE_WEBHOOK_SIGNATURE_KEY`. Keep `SQUARE_WEBHOOK_NOTIFICATION_URL` identical to the URL entered in Square because it is part of signature verification. Payment events are verified against the raw request body and appended to the private reservation log. A `COMPLETED` event is the authoritative payment result; the browser redirect alone is not treated as proof of payment.

## Unpaid reservation expiration

The Node process checks pending reservations at startup and once per minute. After 30 minutes it retrieves the Square order before taking action. A completed order is preserved and reconciled as paid. An unpaid order has its payment link deleted, which cancels the checkout order, and its Square appointment is then canceled to release the arrival time. Expiration results and retryable errors are appended to `data/reservations.jsonl`, so the process is restart-safe.

For a reliable 30-minute TTL even when cPanel Passenger stops an idle application, add a cPanel Cron Job that runs every minute using the Node executable from the application environment:

```text
cd /home/boomwowp/dist/app && npm run expire:reservations
```

If `npm` is not on the Cron Job PATH, use the full Node executable path shown by cPanel and run `/home/boomwowp/dist/app/expire-reservations.js` directly. The in-process worker remains as a fallback, but the cron job provides wall-clock enforcement while the website is idle.

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
