# Snip backend

A zero-dependency Bun URL shortener API. Links are held in memory and are cleared
when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Configure `PORT` to change it,
`BASE_URL` to set the short-link origin, or `RAILWAY_PUBLIC_DOMAIN` as a fallback
for `BASE_URL`. When `PUBLIC_DIR` is set, the server also serves static files from
that directory, using `index.html` for `/`.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link and
  returns `201` with `{code,url,shortUrl,hits,createdAt}`. Invalid JSON or a
  non-HTTP(S) URL returns `400` with an `error` field.
- `GET /api/links` returns the created links.
- `GET /:code` redirects to the original URL with `302` and increments its hit
  count, or returns `404` when the code is unknown.

The API allows cross-origin browser requests.
