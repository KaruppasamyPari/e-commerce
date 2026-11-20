# Selvedge Clothing Studio

Selvedge is an Indian clothing storefront with a separate staff dashboard. Four independently runnable applications share one MySQL 8.4 database. The first release supports Cash on Delivery and manual fulfilment.

| Application | Local URL | npm workspace |
| --- | --- | --- |
| Customer storefront | http://localhost:3000 | `main-web` |
| Staff dashboard | http://localhost:3001 | `admin-web` |
| Customer API | http://localhost:8080/api/health | `main-api` |
| Staff API | http://localhost:8081/api/health | `admin-api` |

## Project layout

```text
main-website/frontend/    React, Vite, TypeScript, React Router, Tailwind and catalog WebPs
main-website/backend/     Express customer accounts, bag, addresses, quotes and checkout
admin-website/frontend/   React, Vite, TypeScript, React Router and Tailwind dashboard
admin-website/backend/    Express staff login, catalog writes, inventory and fulfilment
database/prisma/          Shared schema, migration history, seed, catalog and staff bootstrap
shared/                   Prisma connection, HTTP authentication, client types and API helpers
verification/             Repeatable API concurrency checks and Playwright browser scenarios
docker-compose.yml        MySQL, a single migration job and the four applications
```

## Start with Docker Compose

Install Docker Engine or Docker Desktop with Compose v2. Use a shell in `clothing-ecommerce`. On a fresh checkout, copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`). Preserve an existing working environment file.

Set `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` to distinct generated secrets. Use URL-safe characters for the Compose app password because it is interpolated into the database URL. Set the same app password in the host `DATABASE_URL`. Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters and at most 72 UTF-8 bytes. Keep the environment file private.

```sh
docker compose up --build -d
docker compose logs migrate
docker compose ps
docker compose run --rm bootstrap-admin
```

Bootstrap is a one-time operation. An existing staff email is rejected. Customers register from the storefront. The current workspace demo uses the staff credentials in its ignored root `.env`.

The `mysql` service binds to loopback on port 3306 and checks readiness by executing a query. Set `MYSQL_PORT` if another local service occupies that port. The migration service waits for MySQL, runs `prisma migrate deploy`, then seeds an empty store. Both APIs wait for that job to finish. Inside Compose their URL uses the `mysql` service hostname. The `mysql-data` and `uploads` named volumes persist across restarts. Use `docker compose down` to stop the stack while retaining its data.

## Run the four applications directly

Install Node.js 22.12+ or Node.js 24, npm and MySQL 8.4. You can start just the database with `docker compose up -d mysql`. Configure the root `.env` with a connection to the host database, for example `mysql://ecommerce_app:CHANGE_ME@localhost:3306/clothing_ecommerce`. For native MySQL create the database with `utf8mb4` and grant the app user schema privileges for migrations. Run commands from the project root.

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run admin:create
npm run build
```

Run each of the following in its own terminal. Each API reads the shared root environment. Each frontend proxies its local `/api` and `/media` paths to its corresponding backend.

```sh
npm run dev -w main-api
npm run dev -w admin-api
npm run dev -w main-web
npm run dev -w admin-web
```

The `start` script in each workspace runs its built application. For the frontends it serves a local Vite preview. For independent production deployments serve each frontend's `dist/` behind HTTPS, route unmatched browser paths to `index.html`, and reverse-proxy `/api` and `/media` to that site's backend. Run each built Node service from its workspace within the project layout. Supply the shared schema, seeded media directory and mounted upload volume to both APIs. Run migrations once as a release job before switching traffic.

## Configuration

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Shared Prisma MySQL connection, including database name and credentials |
| `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Compose database initialization |
| `PORT`, `WEB_ORIGIN` | Per-API port and allowed browser origin. Defaults correspond to the URLs above |
| `API_ORIGIN` | Vite development/preview proxy target, set separately for each frontend |
| `VITE_API_URL` | Optional build-time API origin for a separately hosted frontend. The default uses same-origin paths |
| `UPLOAD_DIR` | Shared persistent directory for uploaded WebPs; local default is `storage/uploads` |
| `COOKIE_SECURE` | Set to `true` for HTTPS. Local HTTP uses `false` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used only by the staff bootstrap command |

Each application has an `.env.example`. Use independent site origins for deployment, with same-site API routing for cookie sessions. The bootstrap secrets can be removed from the runtime environment after account creation. Local single-instance authentication limits are per IP and per API process. A replicated deployment should coordinate throttling at its ingress.

## Catalog and operations

- The first seed inserts 20 published products, 80 size/colour variants and three ordered WebPs per product. Rerunning the seed preserves subsequent catalog edits. The seed script checks all 60 asset paths before modifying the database.
- The `front`, `back` and `detail` fields preserve gallery order. The pictured colour is explicit. Original assets and production prompts are documented in [the photography record](database/prisma/PHOTOGRAPHY.md).
- Staff can create an empty draft, upload front/back/detail photos, add price and stock, preview and publish. The upload endpoint decodes JPEG, PNG and WebP, limits file size to 5 MB and input size to 16 megapixels, and generates a fresh 4:5 WebP filename. Back up uploads with the database.
- Catalog reads query the shared database and return `Cache-Control: no-store`. Public lists and slug lookup both require the published state. Products become visible on the next load. Media URLs are immutable.
- Inventory, orders, customers and dashboard metrics use database data. Confirmed sales sum confirmed and later orders, independent of cash collection. Low stock means three units or fewer for an active variant.
- Store settings control the brand name, accent colour, shipping fee, free-shipping threshold and COD availability. This release uses Indian rupees, with integer paise throughout the database.
- Customer and staff sessions use separate HTTP-only cookies and roles. Session tokens are hashed in the database. Passwords use bcrypt. Mutation requests require a custom header. Customer address and order queries are scoped to the signed-in account.

## Inventory and fulfilment

Checkout locks the customer's account and applicable catalog rows inside an InnoDB transaction. The server checks the reviewed price, shipping total, COD setting and current quantities. A conditional decrement requires enough stock for each variant. A failure rolls back the entire purchase. A unique customer/request-key pair makes retrying the same submission safe. Order items and the shipping address are snapshots.

Staff advance orders through Placed, Confirmed, Packed, Shipped and Delivered. Cancellation is available through Packed. The cancellation transaction locks the order and restores stock only on its first transition to Cancelled. Courier and tracking details are editable in Admin. COD payment starts Pending. Staff record cash collection separately after delivery.

The customer checkout boundary is in `main-website/backend/src/checkout.ts`. Future Razorpay order creation and signature-verified webhook handling can use a separate payment service keyed to the internal order. The staff shipment boundary is in `admin-website/backend/src/fulfilment.ts`. Future Shiprocket creation and authenticated tracking updates can update shipment fields independently. Neither provider is required for this release.

## Verification

With all four services running, use a local verification database initialized with the seed. The suites create temporary staff, shoppers, products, addresses and orders, exercise the live services and remove their fixtures. Run one suite at a time. The browser suite uses installed Google Chrome.

```sh
npm run verify
npx tsx verification/browser.ts
```

`STORE_API_URL`, `ADMIN_API_URL`, `STORE_WEB_URL`, `ADMIN_WEB_URL` and `BROWSER_CHANNEL` override the test targets. Supply the same database connection and upload volume to the verification process as the running APIs.

The API checks cover seed imagery, upload validation, publication, editing, hiding products, COD order values, role and customer isolation, simultaneous last-unit purchases, repeated requests, cancellation and payment collection. Browser checks exercise storefront navigation, filtering, gallery controls, guest-cart registration, checkout and order history on desktop and mobile.

Local verification used native MySQL 8.4.7 on port 33306 because Docker is unavailable on the verification host. The Compose stack is supplied for reproduction; container startup requires verification on a Docker host.

### Customer mobile and Google sign-in

Set the following in the root environment and restart the customer API.

- For SMS, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` for a Twilio Verify service enabled for delivery to India. Customers enter a 10-digit Indian mobile number and confirm the SMS code. The first verification creates a customer account.
- For Google, create a Web application OAuth client, register the exact storefront origin (for example `http://localhost:3000`) under Authorized JavaScript origins and set `GOOGLE_CLIENT_ID`. Returning users are identified by their verified Google subject. Customers with an existing password account for that email use their original sign-in method.
