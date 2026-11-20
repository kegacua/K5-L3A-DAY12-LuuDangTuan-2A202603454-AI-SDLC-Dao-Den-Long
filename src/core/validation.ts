import type { InputFrame, InputsFile, ScenarioConfig, Vec3Tuple } from './types.js';

export class ContractInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractInputError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertVec3(value: unknown, fieldName: string): Vec3Tuple {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    throw new ContractInputError(`${fieldName} must be an array of 3 finite numbers`);
  }
  return [value[0], value[1], value[2]];
}

export function validateInputsFile(raw: unknown): InputsFile {
  if (!isPlainObject(raw)) {
    throw new ContractInputError('inputs file must be a JSON object');
  }
  if (!Array.isArray(raw.frames)) {
    throw new ContractInputError('inputs.frames must be an array');
  }

  const frames: InputFrame[] = [];
  let prevTick = -1;

  for (let i = 0; i < raw.frames.length; i += 1) {
    const item = raw.frames[i];
    if (!isPlainObject(item)) {
      throw new ContractInputError(`inputs.frames[${i}] must be an object`);
    }
    if (typeof item.tick !== 'number' || !Number.isInteger(item.tick) || item.tick < 0) {
      throw new ContractInputError(`inputs.frames[${i}].tick must be a non-negative integer`);
    }
    if (item.tick <= prevTick) {
      throw new ContractInputError(
        `inputs.frames[${i}].tick (${item.tick}) must be strictly greater than previous tick (${prevTick})`,
      );
    }
    prevTick = item.tick;

    const frame: InputFrame = { tick: item.tick };

    if (item.move !== undefined) {
      if (
        !Array.isArray(item.move) ||
        item.move.length !== 2 ||
        !item.move.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 1)
      ) {
        throw new ContractInputError(
          `inputs.frames[${i}].move must be [x, z] with numbers in [-1, 1]`,
        );
      }
      frame.move = [item.move[0], item.move[1]];
    }

    if (item.cam_yaw_deg !== undefined) {
      if (typeof item.cam_yaw_deg !== 'number' || !Number.isFinite(item.cam_yaw_deg)) {
        throw new ContractInputError(`inputs.frames[${i}].cam_yaw_deg must be a finite number`);
      }
      frame.cam_yaw_deg = item.cam_yaw_deg;
    }

    for (const key of ['jump', 'interact', 'pulse', 'dash'] as const) {
      if (item[key] !== undefined) {
        if (typeof item[key] !== 'boolean') {
          throw new ContractInputError(`inputs.frames[${i}].${key} must be a boolean`);
        }
        frame[key] = item[key];
      }
    }

    frames.push(frame);
  }

  return { frames };
}

export function validateScenarioConfig(raw: unknown): ScenarioConfig {
  if (!isPlainObject(raw)) {
    throw new ContractInputError('scenario file must be a JSON object');
  }

  const scenario: ScenarioConfig = {};

  if (raw.player !== undefined) {
    if (!isPlainObject(raw.player)) {
      throw new ContractInputError('scenario.player must be an object');
    }
    scenario.player = {};
    if (raw.player.pos !== undefined) {
      scenario.player.pos = assertVec3(raw.player.pos, 'scenario.player.pos');
    }
    if (raw.player.carried !== undefined) {
      if (
        typeof raw.player.carried !== 'number' ||
        !Number.isInteger(raw.player.carried) ||
        raw.player.carried < 0
      ) {
        throw new ContractInputError('scenario.player.carried must be a non-negative integer');
      }
      scenario.player.carried = raw.player.carried;
    }
    if (raw.player.flames !== undefined) {
      if (
        typeof raw.player.flames !== 'number' ||
        !Number.isInteger(raw.player.flames) ||
        raw.player.flames < 0
      ) {
        throw new ContractInputError('scenario.player.flames must be a non-negative integer');
      }
      scenario.player.flames = raw.player.flames;
    }
  }

  if (raw.random_motes !== undefined) {
    if (typeof raw.random_motes !== 'boolean') {
      throw new ContractInputError('scenario.random_motes must be a boolean');
    }
    scenario.random_motes = raw.random_motes;
  }

  if (raw.random_shades !== undefined) {
    if (typeof raw.random_shades !== 'boolean') {
      throw new ContractInputError('scenario.random_shades must be a boolean');
    }
    scenario.random_shades = raw.random_shades;
  }

  if (raw.time_left_s !== undefined) {
    if (typeof raw.time_left_s !== 'number' || !Number.isFinite(raw.time_left_s) || raw.time_left_s < 0) {
      throw new ContractInputError('scenario.time_left_s must be a non-negative finite number');
    }
    scenario.time_left_s = raw.time_left_s;
  }

  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) {
      throw new ContractInputError('scenario.motes must be an array');
    }
    scenario.motes = raw.motes.map((item, idx) => {
      if (Array.isArray(item)) {
        return assertVec3(item, `scenario.motes[${idx}]`);
      }
      if (isPlainObject(item)) {
        const pos = assertVec3(item.pos, `scenario.motes[${idx}].pos`);
        if (item.id !== undefined && typeof item.id !== 'string') {
          throw new ContractInputError(`scenario.motes[${idx}].id must be a string`);
        }
        return item.id !== undefined ? { id: item.id, pos } : { pos };
      }
      throw new ContractInputError(`scenario.motes[${idx}] must be [x,y,z] or {pos}`);
    });
  }

  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) {
      throw new ContractInputError('scenario.shades must be an array');
    }
    scenario.shades = raw.shades.map((item, idx) => {
      if (Array.isArray(item)) {
        return { pos: assertVec3(item, `scenario.shades[${idx}]`) };
      }
      if (!isPlainObject(item)) {
        throw new ContractInputError(`scenario.shades[${idx}] must be an object`);
      }
      const pos = assertVec3(item.pos, `scenario.shades[${idx}].pos`);
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractInputError(`scenario.shades[${idx}].id must be a string`);
      }
      if (item.state !== undefined && item.state !== 'chase' && item.state !== 'stunned') {
        throw new ContractInputError(`scenario.shades[${idx}].state must be "chase" or "stunned"`);
      }
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(item.state !== undefined ? { state: item.state } : {}),
      };
    });
  }

  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) {
      throw new ContractInputError('scenario.lanterns must be an array');
    }
    scenario.lanterns = raw.lanterns.map((item, idx) => {
      if (!isPlainObject(item)) {
        throw new ContractInputError(`scenario.lanterns[${idx}] must be an object`);
      }
      if (typeof item.id !== 'string' || item.id.length === 0) {
        throw new ContractInputError(`scenario.lanterns[${idx}].id must be a non-empty string`);
      }
      const out: { id: string; pos?: Vec3Tuple; deposited?: number; lit?: boolean } = {
        id: item.id,
      };
      if (item.pos !== undefined) {
        out.pos = assertVec3(item.pos, `scenario.lanterns[${idx}].pos`);
      }
      if (item.deposited !== undefined) {
        if (
          typeof item.deposited !== 'number' ||
          !Number.isInteger(item.deposited) ||
          item.deposited < 0
        ) {
          throw new ContractInputError(`scenario.lanterns[${idx}].deposited must be a non-negative integer`);
        }
        out.deposited = item.deposited;
      }
      if (item.lit !== undefined) {
        if (typeof item.lit !== 'boolean') {
          throw new ContractInputError(`scenario.lanterns[${idx}].lit must be a boolean`);
        }
        out.lit = item.lit;
      }
      return out;
    });
  }

  return scenario;
}
