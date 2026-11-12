# Snip frontend

Angular 19 client for Snip. It creates short links and lists links from the Bun
backend at `http://localhost:3000`.

## Run locally

Start the backend in another terminal, then run:

```bash
npm install
npx ng serve
```

Open `http://localhost:4200`. The production build is written to
`dist/snip-frontend/browser`.

## Verify

```bash
npx ng build
npx ng test --watch=false --browsers=ChromeHeadless
```

The client uses `POST /api/links` and `GET /api/links` with the shared API
contract.
