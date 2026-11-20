import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runHeadlessSimulation } from '../core/simulation.js';
import type { InputsFile, ScenarioConfig } from '../core/types.js';
import {
  ContractInputError,
  validateInputsFile,
  validateScenarioConfig,
} from '../core/validation.js';

interface CliArgs {
  seed: number;
  night: number;
  ticks: number;
  out: string;
  snapshotEvery: number;
  scenarioPath?: string;
  inputsPath?: string;
}

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

function parseIntStrict(raw: string | undefined, flag: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new CliUsageError(`${flag} must be an integer, got: ${raw ?? '(missing)'}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) {
    throw new CliUsageError(`${flag} is out of safe integer range: ${raw}`);
  }
  return n;
}

function parseArgs(argv: string[]): CliArgs {
  let seed: number | undefined;
  let night: number | undefined;
  let ticks: number | undefined;
  let out: string | undefined;
  let snapshotEvery = 10;
  let scenarioPath: string | undefined;
  let inputsPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      process.stdout.write(
        'Usage: node dist/headless.mjs --seed <int> --night 1 [--scenario <file.json>] [--inputs <file.json>] --ticks <int> --out <file.jsonl> [--snapshot-every <int>]\n',
      );
      process.exit(0);
    } else if (flag === '--seed') {
      seed = parseIntStrict(argv[++i], '--seed');
    } else if (flag === '--night') {
      night = parseIntStrict(argv[++i], '--night');
    } else if (flag === '--ticks') {
      ticks = parseIntStrict(argv[++i], '--ticks');
    } else if (flag === '--out') {
      const val = argv[++i];
      if (!val) throw new CliUsageError('--out requires a file path');
      out = val;
    } else if (flag === '--snapshot-every') {
      snapshotEvery = parseIntStrict(argv[++i], '--snapshot-every');
    } else if (flag === '--scenario') {
      const val = argv[++i];
      if (!val) throw new CliUsageError('--scenario requires a file path');
      scenarioPath = val;
    } else if (flag === '--inputs') {
      const val = argv[++i];
      if (!val) throw new CliUsageError('--inputs requires a file path');
      inputsPath = val;
    } else {
      throw new CliUsageError(`Unknown argument: ${flag}`);
    }
  }

  if (seed === undefined) throw new CliUsageError('Missing required argument: --seed');
  if (night === undefined) throw new CliUsageError('Missing required argument: --night');
  if (night !== 1) throw new CliUsageError(`Unsupported --night ${night} (Phase 1 supports --night 1)`);
  if (ticks === undefined || ticks < 0) {
    throw new CliUsageError('Missing or negative required argument: --ticks');
  }
  if (!out) throw new CliUsageError('Missing required argument: --out');
  if (snapshotEvery <= 0) {
    throw new CliUsageError('--snapshot-every must be a positive integer');
  }

  return {
    seed,
    night,
    ticks,
    out,
    snapshotEvery,
    ...(scenarioPath !== undefined ? { scenarioPath } : {}),
    ...(inputsPath !== undefined ? { inputsPath } : {}),
  };
}

function readJsonContractFile(filePath: string, label: string): unknown {
  let content: string;
  try {
    content = readFileSync(resolve(filePath), 'utf8');
  } catch (err) {
    throw new CliUsageError(
      `Failed to read ${label} file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new ContractInputError(
      `Malformed JSON in ${label} file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));

    let scenario: ScenarioConfig | undefined;
    if (args.scenarioPath !== undefined) {
      const rawScenario = readJsonContractFile(args.scenarioPath, 'scenario');
      scenario = validateScenarioConfig(rawScenario);
    }

    let inputs: InputsFile | undefined;
    if (args.inputsPath !== undefined) {
      const rawInputs = readJsonContractFile(args.inputsPath, 'inputs');
      inputs = validateInputsFile(rawInputs);
    }

    const { records } = runHeadlessSimulation({
      seed: args.seed,
      night: args.night,
      ticks: args.ticks,
      snapshotEvery: args.snapshotEvery,
      ...(scenario !== undefined ? { scenario } : {}),
      ...(inputs !== undefined ? { inputs } : {}),
    });

    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(outPath, lines, 'utf8');
  } catch (err) {
    if (err instanceof ContractInputError) {
      process.stderr.write(`Contract input error: ${err.message}\n`);
      process.exit(2);
    }
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}

main();
