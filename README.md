# BoomBoxCar.com

BoomBoxCar is a bilingual static website with a dependency-free Node API for Square availability, booking creation, and embedded payment processing.

## Homepage party video

The homepage presents one theme-driven party video using responsive, self-hosted MP4 files. Light theme selects the daytime video, while dark theme selects the nighttime video. Two stacked playback layers make theme changes seamless: the destination video loads and begins playing underneath the current video, then the current layer fades away. A single continuous gallery follows the video: light theme streams daytime images 1–5 into nighttime images 1–5, while dark theme streams nighttime images 1–5 into daytime images 1–5.

```text
videos/boombox-party-day-s.mp4    Daytime mobile crop, under 640px
videos/boombox-party-day-m.mp4    Daytime tablet crop, 640px to 1199px
videos/boombox-party-day-l.mp4    Daytime desktop crop, 1200px and wider
videos/boombox-party-night-s.mp4  Nighttime mobile crop, under 640px
videos/boombox-party-night-m.mp4  Nighttime tablet crop, 640px to 1199px
videos/boombox-party-night-l.mp4  Nighttime desktop crop, 1200px and wider
```

Export each as a loopable H.264 MP4 containing the clip forward and then in reverse for continuous bounce playback, with the visual subject positioned for its target crop. Each video stays muted, autoplaying, looping, inline, and free of media controls. It loads as its section approaches the viewport. If the file is missing, playback is unavailable, or the visitor prefers reduced motion, the matching still in `images/wallpapers/` loads as a fallback. Wallpaper stills are not displayed as a separate content section.

The responsive gallery uses `images/day-1s.jpeg` through `images/day-5l.jpeg` and `images/night-1s.jpeg` through `images/night-5l.jpeg`. Each numbered frame has 320×400 small, 640×800 medium, and 1200×1500 large variants.

The production `public_html/videos` directory is manually managed. The cPanel deployment script intentionally does not delete, replace, or copy into it, so uploaded video files survive subsequent site deployments.

## Local development

Use Node 24 LTS or Node 22. Copy `.env.example` values into your shell environment, then run:

```sh
npm start
```

In development, the Node server exposes the site and API together at `http://127.0.0.1:3100`. With placeholder Square credentials, availability and payment remain disabled instead of sending customers to an external scheduler or checkout.

Useful routes:

```text
GET  /api/health
GET  /api/config
GET  /api/packages
GET  /api/modifiers?durationHours=1
POST /api/availability
POST /api/coupons/validate
POST /api/reservations/payment
GET  /api/confirmations/:reservationId?token=...
POST /api/webhooks/square
```

The package and modifier endpoints read the configured Square Catalog services. On startup, the booking page refreshes every duration card with its current Square price; selecting a duration then loads that package's current price, modifiers, selection rules, and Catalog IDs before recalculating the estimate. RGB Panels and the Bubble Machine are always returned in a locked, preselected "Included with every booking" group at $0. If either modifier exists in Square, its Catalog ID is preserved; otherwise the order uses an ad hoc $0 modifier. Other modifiers whose names describe newly included equipment are removed from the add-on list. The order explicitly overrides included modifier prices to $0, while the server repeats the full calculation when the reservation is submitted so browser-supplied prices are never authoritative. The booking form requires a duration before enabling date and arrival-time selection. If the duration changes later, an already selected arrival time remains selected when Square reports that the same time is still available for the new duration. The form collects structured street, unit, city, state, and ZIP fields. Contact information, address, duration, event date, arrival time, event type, setting, attendance, and special requests are saved locally in the visitor's browser for one hour after the most recent edit. The draft is restored after refreshes. A restored arrival time is accepted only after Square confirms that the slot is still available. Catalog modifiers, reservation IDs, confirmation tokens, and payment information are never stored in this browser draft. The backend validates required components, supported characters, US ZIP format, and the DC, Maryland, and Virginia service area before contacting Square. This validation checks structure and service-area eligibility, not whether a postal address exists.

The Square Web Payments SDK renders secure card fields directly in the BoomBoxCar booking summary and tokenizes card details in the browser. Eligible Safari and Apple devices see a native Apple Pay button by default. When Apple Pay is unavailable, the site attempts to render Square's Google Pay button instead. Only one wallet button is shown. A text link switches from the wallet to the embedded credit or debit card form and hides the wallet button. When neither wallet is available, the card form opens automatically. All methods use the same backend payment route, which rechecks the live Catalog total and availability before creating the customer-location appointment, itemized Square order, and completed payment. A stale browser total is rejected before the appointment or charge is created. Customer names are normalized so the first word is the given name and all remaining words form the family name. The contact name, phone, event address, booking ID, package, and Catalog modifiers remain on the Square order. If payment fails after Square accepts a booking, the backend cancels the booking so the customer can safely retry. A cancellation failure is persisted and returned as a manual-review error.

The booking summary includes a collapsed coupon-code field. Coupon definitions stay private on the server in `BOOMBOXCAR_COUPONS`, using comma-separated `CODE:TYPE:VALUE` entries. `TYPE` is `PERCENT` or `FIXED`, where fixed values are US dollars. For example, `WELCOME10:PERCENT:10,BOOM50:FIXED:50` creates a 10 percent code and a $50 code. For payment-flow testing, a code configured as `TEST_SALE:PERCENT:100` dynamically discounts any booking to a one-cent balance instead of zero. Do not use a 100 percent code as a public promotion. Codes are normalized to uppercase and may contain letters, digits, underscores, and hyphens. The backend validates the code, selected package, and modifiers, calculates the discount in cents, and adds the discount to the Square order for card and Apple Pay payments. A fixed coupon that equals or exceeds the current subtotal is rejected before booking creation because the payment route requires at least $0.01 due. Do not configure the same promotion again as a Square Marketing coupon because that could create two independently redeemable versions of the discount.

After successful payment, the site opens `/confirmation/` with the reservation ID and a private, randomly generated confirmation token. The confirmation API returns booking details only when that token matches and the Square order has been recorded or reconciled as paid. The completed Square payment or reconciled order total replaces the pre-payment estimate as the authoritative total paid. If Square reports an additional discount or adjustment, the confirmation pricing table shows the difference as a Square payment discount or adjustment. The read-only confirmation page shows the customer, schedule, service address, package, modifiers, total, included scope, requests, Square references, and receipt link. Its download button opens the browser print dialog, and its print stylesheet forces a white, letter-sized layout for reliable Save as PDF output even when the site or operating system is using dark mode.

Google Analytics records the recommended ecommerce funnel events `select_item`, `begin_checkout`, `add_payment_info`, and `purchase`, along with payment errors and confirmation actions. The homepage also records one-time `scroll_depth` milestones at 25, 50, 75, and 90 percent and one-time `section_view` events for the gallery, booking builder, pricing, and FAQ sections. The `purchase` event is emitted only after the confirmation API verifies completed payment and uses the final Square amount plus the unique Square order ID as its transaction ID. The confirmation page disables the automatic page view and sends a sanitized `/confirmation/` page location so its private confirmation token is never included in Analytics.

The Square access token must permit Catalog reads, booking/customer operations, order creation, and payments. For OAuth applications, this means the applicable `ITEMS_READ`, `APPOINTMENTS_WRITE`, `CUSTOMERS_READ`, `CUSTOMERS_WRITE`, `ORDERS_READ`, `ORDERS_WRITE`, and `PAYMENTS_WRITE` permissions. Seller-level booking writes also require Square Appointments Plus or Premium.

Card, Apple Pay, and Google Pay payments use the same Orders and Payments API path. Register `boomboxcar.com` in the production Square application and keep Square's association file available at `https://boomboxcar.com/.well-known/apple-developer-merchantid-domain-association`. The Web Payments SDK requires HTTPS and the payment-page Content Security Policy in `index.html` and `es/index.html`. Apple Pay additionally requires a supported Safari and Apple Wallet device. Google Pay is rendered only through Square's Web Payments SDK and requires a supported browser and wallet. Sandbox Apple Pay testing still requires a real card in Apple Wallet, but Square does not charge it in the sandbox environment.

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
