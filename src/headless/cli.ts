import { runHelloSimulation } from '../core/hello.js';

interface CliOptions {
  ticks: number;
  dt: number;
}

function parseArgs(argv: string[]): CliOptions {
  let ticks = 60;
  let dt = 1 / 60;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ticks' && argv[i + 1] !== undefined) {
      ticks = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--dt' && argv[i + 1] !== undefined) {
      dt = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: node dist/headless.mjs [--ticks <int>] [--dt <seconds>]\n',
      );
      process.exit(0);
    }
  }

  return { ticks, dt };
}

function main(): void {
  const { ticks, dt } = parseArgs(process.argv.slice(2));
  const finalState = runHelloSimulation(ticks, dt);
  const payload = {
    mode: 'cp0-hello-headless',
    ticks,
    dt,
    state: finalState,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main();
