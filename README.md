# Snip

Snip is a URL shortener with one Bun backend and two clients: an Angular web app
and a Node CLI. Links live in memory and disappear when the server restarts.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| POST | `/api/links` | `{"url":"https://example.com"}` | 201 `{code,url,shortUrl,hits,createdAt}`; 400 on invalid input |
| GET | `/api/links` | | 200 array of links |
| GET | `/:code` | | 302 redirect and increment hits; 404 if unknown |

This repository uses separate orphan branches for `backend`, `frontend`, and
`cli`. The `main` branch pins each one as a Git submodule. Clone with:

```sh
git clone --recurse-submodules https://github.com/nicholastwj/snipdemo-day1.git
```

Run the backend with `cd backend` and `bun start`. In another terminal, run
`cd frontend`, `npm ci`, and `npm start`; open `http://localhost:4200`. From
`cli`, run `node cli.js help` or `node cli.js ls`. Angular 19 requires a
supported Node version; Node 22 works.

To update a component, commit and push changes within its submodule. From the
superproject run `git submodule update --remote <path>`, then stage the updated
path, commit, and push the new pinned commit.
