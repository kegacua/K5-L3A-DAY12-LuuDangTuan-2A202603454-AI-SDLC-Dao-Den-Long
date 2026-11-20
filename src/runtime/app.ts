import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addLeaderboardEntry,
  normalizeLeaderboardFile,
} from '../core/leaderboard.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getDataDir(): string {
  return process.env.DDL_DATA_DIR
    ? resolve(process.env.DDL_DATA_DIR)
    : join(os.homedir(), '.dao-den-long');
}

function getLeaderboardPath(): string {
  return join(getDataDir(), 'leaderboard.json');
}

function getSettingsPath(): string {
  return join(getDataDir(), 'settings.json');
}

function readLeaderboardFromDisk() {
  const path = getLeaderboardPath();
  if (!existsSync(path)) {
    return { entries: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return normalizeLeaderboardFile(raw);
  } catch {
    return { entries: [] };
  }
}

function writeLeaderboardToDisk(entries: ReturnType<typeof normalizeLeaderboardFile>['entries']): void {
  const path = getLeaderboardPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ entries }, null, 2)}\n`, 'utf8');
}

function readJsonFileOrDefault(path: string, fallback: unknown): unknown {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function findWebDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, 'web'),
    resolve(here, '../dist/web'),
    resolve(process.cwd(), 'dist/web'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'index.html'))) return c;
  }
  throw new Error('Built web directory (dist/web/index.html) not found. Run `npm run build` first.');
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Non-fatal if running in headless server without GUI
  }
}

function parseCliArgs(argv: string[]): {
  exportLeaderboardPath?: string;
  port: number;
  noOpen: boolean;
} {
  let exportLeaderboardPath: string | undefined;
  let port = 4173;
  let noOpen = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--export-leaderboard') {
      const val = argv[++i];
      if (!val) throw new Error('--export-leaderboard requires a file path');
      exportLeaderboardPath = val;
    } else if (arg === '--port') {
      port = Number(argv[++i]);
    } else if (arg === '--no-open') {
      noOpen = true;
    } else if (arg === '--help' || flagIsHelp(arg)) {
      process.stdout.write(
        'Usage: node dist/app.mjs [--port <int>] [--no-open] [--export-leaderboard <out.json>]\n',
      );
      process.exit(0);
    }
  }
  return {
    ...(exportLeaderboardPath !== undefined ? { exportLeaderboardPath } : {}),
    port,
    noOpen,
  };
}

function flagIsHelp(arg: string | undefined): boolean {
  return arg === '-h';
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectBody);
  });
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.exportLeaderboardPath !== undefined) {
    const data = readLeaderboardFromDisk();
    const outPath = resolve(args.exportLeaderboardPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    process.stdout.write(`Exported ${data.entries.length} leaderboard entries to ${outPath}\n`);
    return;
  }

  const webDir = findWebDir();
  const server = createServer(async (req, res) => {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    if (pathname === '/api/leaderboard') {
      if (req.method === 'GET') {
        const data = readLeaderboardFromDisk();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }
      if (req.method === 'POST') {
        try {
          const raw = JSON.parse(await readBody(req));
          const current = readLeaderboardFromDisk().entries;
          const updated = addLeaderboardEntry(current, raw);
          writeLeaderboardToDisk(updated);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ entries: updated }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
        return;
      }
    }

    if (pathname === '/api/settings') {
      const settingsPath = getSettingsPath();
      if (req.method === 'GET') {
        const saved = readJsonFileOrDefault(settingsPath, null);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(saved));
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = await readBody(req);
          JSON.parse(body);
          mkdirSync(dirname(settingsPath), { recursive: true });
          writeFileSync(settingsPath, body, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
        return;
      }
    }

    const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const safePath = resolve(webDir, relPath);
    if (!safePath.startsWith(webDir) || !existsSync(safePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = extname(safePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    res.end(readFileSync(safePath));
  });

  server.on('error', () => {
    server.listen(0, '127.0.0.1');
  });

  server.listen(args.port, '127.0.0.1', () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : args.port;
    const url = `http://127.0.0.1:${actualPort}`;
    process.stdout.write(`Đảo Đèn Lồng đang chạy tại: ${url}\n`);
    process.stdout.write(`Dữ liệu bảng xếp hạng lưu tại: ${getLeaderboardPath()}\n`);
    if (!args.noOpen) {
      openBrowser(url);
    }
  });
}

main();
