'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once, EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { main, launchBrowser } = require('./cli');

async function run(args, dependencies = {}) {
  let out = '';
  let err = '';
  const code = await main(args, {
    api: 'http://localhost:3000',
    stdout: { write: text => { out += text; } },
    stderr: { write: text => { err += text; } },
    ...dependencies,
  });
  return { code, out, err };
}

async function processRun(args, env = {}, executable = process.execPath, prefix = ['cli.js']) {
  const child = spawn(executable, [...prefix, ...args], {
    cwd: __dirname, env: { ...process.env, ...env }, windowsHide: true,
  });
  let out = '';
  let err = '';
  child.stdout.on('data', data => { out += data; });
  child.stderr.on('data', data => { err += data; });
  const [code] = await once(child, 'close');
  return { code, out, err };
}

test('help and invalid arguments never send requests', async () => {
  const fetch = () => { throw new Error('Unexpected request'); };
  for (const args of [[], ['help'], ['-h'], ['--help']]) {
    const result = await run(args, { fetch });
    assert.equal(result.code, 0);
    assert.match(result.out, /Usage: snip/);
    assert.equal(result.err, '');
  }
  for (const args of [
    ['wat'], ['add'], ['add', 'file:///tmp/x'], ['add', 'not-a-url'],
    ['add', 'https://example.com', 'extra'], ['ls', 'extra'],
    ['open'], ['open', '../api'], ['open', 'abc123', 'extra'], ['help', 'extra'],
  ]) {
    const result = await run(args, { fetch });
    assert.equal(result.code, 1, JSON.stringify(args));
    assert.equal(result.out, '');
    assert.match(result.err, /^snip: /);
    assert.doesNotMatch(result.err, /Unexpected request/);
  }
  for (const api of ['', 'ftp://example.com', 'http://user:pass@example.com', 'https://example.com/path']) {
    const result = await run(['ls'], { api, fetch });
    assert.equal(result.code, 1);
    assert.match(result.err, /SNIP_API/);
  }
});

test('mock API: subprocess output, status codes, errors and one manual redirect', async t => {
  const links = [];
  let mode = '';
  let redirects = 0;
  const target = 'https://example.com/path?a=1&b=2';
  const server = http.createServer(async (req, res) => {
    if (mode === 'bad-json') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{');
      return;
    }
    if (mode === 'error') {
      res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"Bad URL"}');
      return;
    }
    if (mode === 'shape') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('[{}]');
      return;
    }
    if (req.url === '/api/links') {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { url } = JSON.parse(body);
        links.push({
          code: 'Ab12Cd', url, shortUrl: `${api}/Ab12Cd`, hits: 0,
          createdAt: new Date().toISOString(),
        });
        res.writeHead(201).end(JSON.stringify(links[0]));
      } else res.end(JSON.stringify(links));
    } else if (req.url === '/Ab12Cd') {
      redirects++;
      links[0].hits++;
      if (mode === 'no-location') res.writeHead(302).end();
      else if (mode === 'unsafe-location') res.writeHead(302, { location: 'file:///etc/passwd' }).end();
      else res.writeHead(302, { location: target }).end();
    } else res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"Link not found"}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const api = `http://127.0.0.1:${server.address().port}`;
  const env = { SNIP_API: api };
  assert.deepEqual(await processRun(['ls'], env), { code: 0, out: 'No links yet.\n', err: '' });
  const added = await processRun(['add', target], env);
  assert.deepEqual(added, { code: 0, out: `${api}/Ab12Cd\n`, err: '' });
  const listed = await processRun(['ls'], env);
  assert.equal(listed.code, 0);
  assert.equal(listed.err, '');
  assert.equal(listed.out, `CODE    HITS  URL\nAb12Cd     0  ${target}\n`);
  let opened;
  const openedResult = await run(['open', 'Ab12Cd'], {
    api, launchBrowser: async url => { opened = url; },
  });
  assert.deepEqual(openedResult, { code: 0, out: '', err: '' });
  assert.equal(opened, target);
  assert.equal(redirects, 1);
  assert.equal(links[0].hits, 1);
  const missing = await processRun(['open', 'xxxxxx'], env);
  assert.equal(missing.code, 1);
  assert.equal(missing.out, '');
  assert.match(missing.err, /HTTP 404: Link not found/);
  for (const [next, pattern] of [
    ['error', /HTTP 400: Bad URL/], ['bad-json', /invalid JSON/], ['shape', /invalid link/],
  ]) {
    mode = next;
    const result = await processRun(['ls'], env);
    assert.equal(result.code, 1);
    assert.equal(result.out, '');
    assert.match(result.err, pattern);
  }
  for (const next of ['no-location', 'unsafe-location']) {
    mode = next;
    const result = await run(['open', 'Ab12Cd'], {
      api, launchBrowser: () => { throw new Error('Must not launch'); },
    });
    assert.equal(result.code, 1);
    assert.match(result.err, /Location|HTTP\(S\)/);
  }
  mode = '';
  if (process.platform === 'win32') {
    const ps = await processRun(['add', target], env, 'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'snip.ps1')]);
    assert.equal(ps.code, 0, JSON.stringify(ps));
    assert.equal(ps.out.trim(), `${api}/Ab12Cd`);
    const cmd = await processRun([], env, process.env.ComSpec,
      ['/d', '/c', '.\\snip.cmd', 'ls']);
    assert.equal(cmd.code, 0, JSON.stringify(cmd));
    assert.match(cmd.out, /Ab12Cd/);
    const failed = await processRun([], env, process.env.ComSpec,
      ['/d', '/c', '.\\snip.cmd', 'open', 'xxxxxx']);
    assert.equal(failed.code, 1);
    assert.match(failed.err, /404/);
  }
});

test('unreachable backend exits 1 and timeout includes slow response bodies', async t => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('[');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const api = `http://127.0.0.1:${server.address().port}`;
  const timeout = await run(['ls'], { api, timeoutMs: 30 });
  assert.equal(timeout.code, 1);
  assert.match(timeout.err, /timed out/);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  const dead = await processRun(['ls'], { SNIP_API: api });
  assert.equal(dead.code, 1);
  assert.equal(dead.out, '');
  assert.match(dead.err, /Cannot reach API/);
});

test('platform browser launchers keep URL out of shell syntax and report failures', async () => {
  const url = 'https://example.com/?a=1&b=%22%26test';
  for (const [platform, expected] of [['win32', 'powershell.exe'], ['darwin', 'open'], ['linux', 'xdg-open']]) {
    await launchBrowser(url, platform, (command, args, options) => {
      assert.equal(command, expected);
      assert.equal(options.shell, undefined);
      if (platform === 'win32') {
        assert.equal(options.env.SNIP_OPEN_URL, url);
        assert.ok(!args.join(' ').includes(url));
      } else assert.deepEqual(args, [url]);
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 0));
      return child;
    });
  }
  await assert.rejects(launchBrowser(url, 'other'), /unsupported/);
  for (const event of ['error', 'close']) {
    await assert.rejects(launchBrowser(url, 'linux', () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit(event, event === 'error' ? new Error('missing launcher') : 1));
      return child;
    }), /Cannot open browser|launcher failed/);
  }
  const result = await run(['open', 'Ab12Cd'], {
    fetch: async () => new Response(null, { status: 302, headers: { location: url } }),
    launchBrowser: async () => { throw new Error('Browser launcher failed'); },
  });
  assert.equal(result.code, 1);
  assert.match(result.err, /Browser launcher failed/);
});
