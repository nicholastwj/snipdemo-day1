import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const links = new Map();
const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const baseUrlValue =
  process.env.BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`);
const baseUrl = new URL(baseUrlValue);

if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
  throw new Error("BASE_URL must use http or https.");
}

const baseOrigin = baseUrl.origin;
const publicRoot = process.env.PUBLIC_DIR
  ? await realpath(resolve(process.env.PUBLIC_DIR))
  : null;

if (publicRoot && !(await stat(publicRoot)).isDirectory()) {
  throw new Error("PUBLIC_DIR must point to a directory.");
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data, status = 200) {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
}

function createCode() {
  let code = "";

  while (code.length < 6) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte < 248) {
        code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
        if (code.length === 6) break;
      }
    }
  }

  return code;
}

function isWithinRoot(root, candidate) {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

async function findStaticFile(pathname) {
  if (!publicRoot) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes("\0")) return null;

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const candidate = resolve(publicRoot, relativePath);
  if (!isWithinRoot(publicRoot, candidate)) return null;

  try {
    const actualPath = await realpath(candidate);
    if (!isWithinRoot(publicRoot, actualPath)) return null;
    if (!(await stat(actualPath)).isFile()) return null;
    return new Response(Bun.file(actualPath));
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

async function handleRequest(request) {
  const { pathname } = new URL(request.url);

  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  if (pathname === "/api/links") {
    if (request.method === "GET") return json([...links.values()]);
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ error: "Request body must be a JSON object" }, 400);
    }

    if (typeof payload.url !== "string" || payload.url.trim() === "") {
      return json({ error: "url must be a non-empty HTTP or HTTPS URL" }, 400);
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(payload.url.trim());
    } catch {
      return json({ error: "url must be a valid HTTP or HTTPS URL" }, 400);
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return json({ error: "url must use HTTP or HTTPS" }, 400);
    }

    let code = createCode();
    while (links.has(code)) code = createCode();

    const link = {
      code,
      url: parsedUrl.href,
      shortUrl: `${baseOrigin}/${code}`,
      hits: 0,
      createdAt: new Date().toISOString(),
    };
    links.set(code, link);
    return json(link, 201);
  }

  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const staticFile = await findStaticFile(pathname);
  if (staticFile) return withCors(staticFile);

  const code = pathname.slice(1);
  if (code && !code.includes("/")) {
    const link = links.get(code);
    if (link) {
      link.hits += 1;
      return withCors(Response.redirect(link.url, 302));
    }
  }

  return json({ error: "Link not found" }, 404);
}

Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: handleRequest,
});

console.log(`Snip backend listening on port ${port}`);
