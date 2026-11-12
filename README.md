# Snip CLI

Zero-dependency Node 20+ CommonJS client for the shared Snip API.

```sh
node cli.js help
node cli.js add https://example.com
node cli.js ls
node cli.js open Ab12Cd
```

Set `SNIP_API` to the backend HTTP(S) origin (default
`http://localhost:3000`). Requests time out after 10 seconds.
`add` prints only the returned short URL. `ls` prints an aligned code/hits/URL
table, or `No links yet.`. No arguments, `help`, `-h`, and `--help` show usage.
Invalid arguments, API failures, missing codes, timeouts, and browser-launch
failures print to stderr and return exit code 1; success returns 0.

Use `./snip`, `.\snip.cmd`, or `.\snip.ps1` to forward arguments to `cli.js`.
The package also declares a `snip` bin entry for npm installation.
Windows uses PowerShell `Start-Process`, macOS uses `open`, and Linux uses
`xdg-open`. The redirect is requested once with manual redirect handling;
the browser opens its HTTP(S) Location target, not the short code a second time.
Launching requires an interactive desktop and the platform launcher.

API: `add` sends `POST /api/links` with `{ "url": "https://..." }` and expects
201 with `{ code, url, shortUrl, hits, createdAt }`; `ls` expects the same shape
as an array from `GET /api/links`; `open` expects 302 and Location from
`GET /:code` (404 if unknown). Links are in memory and disappear on restart.

Run `npm test` for mock-API, argument, output, exit-code, timeout, redirect,
and platform-launcher tests. Platform launch commands are mocked, so these
tests never open a real browser.

This branch keeps source at its root. `main` later mounts it as a submodule.
Commit and push CLI changes, then update the superproject's CLI pointer.
The release build copies `cli.js` unchanged into generated `bundle`; keep it
CommonJS and do not add `"type": "module"` to either package.
