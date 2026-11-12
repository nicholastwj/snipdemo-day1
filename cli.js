#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const USAGE = `Usage: snip <command>

  add <url>    Create a short link for an HTTP(S) URL
  ls           List codes, hit counts, and original URLs
  open <code>  Open the original URL in your default browser
  help         Show this help

SNIP_API sets the API origin (default http://localhost:3000).
Requests time out after 10 seconds.
`;

function httpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`);
  }
  return url;
}

function apiOrigin(value) {
  const url = httpUrl(value, 'SNIP_API');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('SNIP_API must be an HTTP(S) origin without credentials, path, query, or fragment.');
  }
  return url.origin;
}

function link(value) {
  if (!value || typeof value !== 'object' ||
      typeof value.code !== 'string' || !/^[a-zA-Z0-9]{6}$/.test(value.code) ||
      typeof value.url !== 'string' || typeof value.shortUrl !== 'string' ||
      !Number.isSafeInteger(value.hits) || value.hits < 0 ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new Error('API returned an invalid link.');
  }
  httpUrl(value.url, 'API URL');
  httpUrl(value.shortUrl, 'API short URL');
  return value;
}

async function request(origin, path, options, expected, fetchImpl, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(`${origin}${path}`, {
      ...options, redirect: 'manual', signal,
    });
    if (response.status !== expected) {
      let detail = '';
      if ((response.headers.get('content-type') || '').includes('application/json')) {
        const body = await response.json();
        if (typeof body?.error === 'string') detail = `: ${body.error}`;
      }
      throw new Error(`API returned HTTP ${response.status}${detail}`);
    }
    if (expected === 302) {
      const location = response.headers.get('location');
      if (!location) throw new Error('API redirect is missing Location.');
      return httpUrl(location, 'Redirect target').href;
    }
    return await response.json();
  } catch (error) {
    if (signal.aborted) throw new Error('API request timed out.');
    if (error instanceof SyntaxError) throw new Error('API returned invalid JSON.');
    if (error instanceof TypeError) throw new Error(`Cannot reach API at ${origin}: ${error.message}`);
    throw error;
  }
}

function launchBrowser(url, platform = process.platform, spawnImpl = spawn) {
  let command;
  let args;
  let env = process.env;
  if (platform === 'win32') {
    // Keep the untrusted URL out of shell syntax, including cmd.exe metacharacters.
    command = 'powershell.exe';
    args = ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:SNIP_OPEN_URL"];
    env = { ...process.env, SNIP_OPEN_URL: url };
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'linux') {
    command = 'xdg-open';
    args = [url];
  } else {
    return Promise.reject(new Error(`Browser launching is unsupported on ${platform}.`));
  }
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { stdio: 'ignore', windowsHide: true, env });
    child.once('error', error => reject(new Error(`Cannot open browser: ${error.message}`)));
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Browser launcher failed (${signal || code}).`));
    });
  });
}

function cell(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const stdout = dependencies.stdout || process.stdout;
  const stderr = dependencies.stderr || process.stderr;
  try {
    const [command, value, ...extra] = args;
    if (!command || ['help', '--help', '-h'].includes(command)) {
      if (args.length > 1) throw new Error('Help takes no arguments.');
      stdout.write(USAGE);
      return 0;
    }
    if (!['add', 'ls', 'open'].includes(command)) throw new Error(`Unknown command: ${cell(command)}. Run snip help.`);
    if (extra.length || (command === 'ls' ? value !== undefined : value === undefined)) {
      throw new Error(`Usage: snip ${command}${command === 'add' ? ' <url>' : command === 'open' ? ' <code>' : ''}`);
    }
    if (command === 'add') httpUrl(value, 'URL');
    if (command === 'open' && !/^[a-zA-Z0-9]{6}$/.test(value)) {
      throw new Error('Code must contain exactly six base62 characters.');
    }
    const origin = apiOrigin(dependencies.api ?? process.env.SNIP_API ?? 'http://localhost:3000');
    const send = (path, options, expected) => request(
      origin, path, options, expected, dependencies.fetch || fetch, dependencies.timeoutMs || 10000,
    );
    if (command === 'add') {
      const result = link(await send('/api/links', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: value }),
      }, 201));
      stdout.write(`${cell(result.shortUrl)}\n`);
    } else if (command === 'ls') {
      const result = await send('/api/links', {}, 200);
      if (!Array.isArray(result)) throw new Error('API returned an invalid link list.');
      const rows = result.map(link);
      if (!rows.length) stdout.write('No links yet.\n');
      else {
        const codeWidth = Math.max(4, ...rows.map(row => row.code.length));
        const hitsWidth = Math.max(4, ...rows.map(row => String(row.hits).length));
        stdout.write(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL\n`);
        for (const row of rows) {
          stdout.write(`${row.code.padEnd(codeWidth)}  ${String(row.hits).padStart(hitsWidth)}  ${cell(row.url)}\n`);
        }
      }
    } else {
      const target = await send(`/${value}`, {}, 302);
      await (dependencies.launchBrowser || launchBrowser)(target);
    }
    return 0;
  } catch (error) {
    stderr.write(`snip: ${cell(error.message)}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; });
}

module.exports = { main, launchBrowser };
