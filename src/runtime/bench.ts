import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface BenchArgs {
  seed: number;
  duration: number;
  out: string;
  headed: boolean;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function parseIntStrict(raw: string | undefined, flag: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`${flag} must be an integer, got: ${raw ?? '(missing)'}`);
  }
  return Number(raw);
}

function parseArgs(argv: string[]): BenchArgs {
  let seed = 42;
  let duration = 30;
  let out = 'bench.json';
  let headed = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      process.stdout.write(
        'Usage: node dist/bench.mjs --seed <int> --duration <sec> --out <bench.json> [--headed]\n',
      );
      process.exit(0);
    } else if (flag === '--seed') {
      seed = parseIntStrict(argv[++i], '--seed');
    } else if (flag === '--duration') {
      duration = parseIntStrict(argv[++i], '--duration');
    } else if (flag === '--out') {
      const val = argv[++i];
      if (!val) throw new Error('--out requires a file path');
      out = val;
    } else if (flag === '--headed') {
      headed = true;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (duration <= 0) throw new Error('--duration must be positive');
  return { seed, duration, out, headed };
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
  throw new Error('dist/web/index.html not found. Run `npm run build` first.');
}

function findBrowserExecutable(): string {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }

  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    );
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Fallback PATH lookup on Unix
  for (const bin of ['google-chrome', 'chromium', 'chromium-browser']) {
    try {
      const resolved = execFileSync('which', [bin], { encoding: 'utf8' }).trim();
      if (resolved) return resolved;
    } catch {
      // continue
    }
  }

  throw new Error('No Chromium/Chrome/Edge executable found. Set CHROME_BIN to browser path.');
}

function sampleProcessTreeRssMb(rootPid: number): number | null {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `$p=Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -eq ${rootPid} -or $_.ParentProcessId -eq ${rootPid}}; ($p | Measure-Object -Property WorkingSetSize -Sum).Sum`,
        ],
        { encoding: 'utf8', timeout: 2500 },
      ).trim();
      const bytes = Number(out);
      if (Number.isFinite(bytes) && bytes > 0) {
        return Math.round(bytes / (1024 * 1024));
      }
    } else {
      const out = execFileSync('ps', ['-o', 'rss=', '-p', String(rootPid)], {
        encoding: 'utf8',
        timeout: 1500,
      }).trim();
      const kb = Number(out);
      if (Number.isFinite(kb) && kb > 0) {
        return Math.round(kb / 1024);
      }
    }
  } catch {
    // ignore transient ps errors
  }
  return null;
}

async function main(): Promise<void> {
  const procStartMs = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const webDir = findWebDir();
  const browserBin = findBrowserExecutable();
  const userDataDir = mkdtempSync(join(os.tmpdir(), 'ddl-bench-chrome-'));

  let resolveReport!: (payload: Record<string, unknown>) => void;
  let rejectReport!: (err: Error) => void;
  const reportPromise = new Promise<Record<string, unknown>>((res, rej) => {
    resolveReport = res;
    rejectReport = rej;
  });

  let measuredLoadMs: number | null = null;

  const server = createServer((req, res) => {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (reqUrl.pathname === '/__bench_ready' && req.method === 'POST') {
      if (measuredLoadMs === null) {
        measuredLoadMs = Date.now() - procStartMs;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    if (reqUrl.pathname === '/__bench_done' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
          resolveReport(parsed);
        } catch (err) {
          res.writeHead(400);
          res.end('bad payload');
          rejectReport(err instanceof Error ? err : new Error(String(err)));
        }
      });
      return;
    }

    const relPath = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.replace(/^\/+/, '');
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

  await new Promise<void>((resolveListen) => {
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 4174;
  const benchUrl = `http://127.0.0.1:${port}/?bench=1&seed=${args.seed}&duration=${args.duration}`;

  const chromeArgs = [
    ...(args.headed ? [`--app=${benchUrl}`] : ['--headless=new']),
    '--window-size=1280,720',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    ...(args.headed ? [] : [benchUrl]),
  ];

  const child = spawn(browserBin, chromeArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderrBuf = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8');
  });

  let peakMemMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  // Sample once during warmup so PowerShell never stalls measured frames
  const warmupMemTimer = setTimeout(() => {
    if (child.pid) {
      const sample = sampleProcessTreeRssMb(child.pid);
      if (sample !== null) peakMemMb = Math.max(peakMemMb, sample);
    }
  }, 1800);

  const timeoutMs = (args.duration + 25) * 1000;
  const timeoutTimer = setTimeout(() => {
    rejectReport(
      new Error(
        `Benchmark timed out after ${timeoutMs}ms (ready=${measuredLoadMs !== null})`,
      ),
    );
  }, timeoutMs);

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      rejectReport(new Error(`Browser exited prematurely with code ${code}`));
    }
  });

  try {
    const telemetry = await reportPromise;
    if (child.pid) {
      const endSample = sampleProcessTreeRssMb(child.pid);
      if (endSample !== null) peakMemMb = Math.max(peakMemMb, endSample);
    }
    const result = {
      contract_version: '1.3',
      avg_fps: telemetry.avg_fps,
      p1_low_fps: telemetry.p1_low_fps,
      frame_ms_p95: telemetry.frame_ms_p95,
      frames: telemetry.frames,
      load_ms: measuredLoadMs ?? telemetry.load_ms ?? Date.now() - procStartMs,
      peak_mem_mb: peakMemMb,
      vsync_off: true,
      renderer: String(telemetry.renderer ?? 'Three.js WebGL2'),
      os: `${os.platform()} ${os.release()} (${os.arch()}, ${os.cpus()[0]?.model ?? 'CPU'})`,
    };

    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    clearTimeout(warmupMemTimer);
    clearTimeout(timeoutTimer);
    child.kill('SIGTERM');
    server.close();
    setTimeout(() => {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup lock on Windows
      }
    }, 300);
  }
}

main().catch((err) => {
  process.stderr.write(`Bench error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
