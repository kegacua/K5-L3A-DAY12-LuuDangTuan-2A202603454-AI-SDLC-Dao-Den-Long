import type {
  DrifterStateName,
  InputFrame,
  InputsFile,
  MoteKind,
  ScenarioConfig,
  ShadeStateName,
  Vec3Tuple,
} from './types.js';

export class ContractInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractInputError';
  }
}

const VALID_SHADE_STATES = new Set<ShadeStateName>([
  'spawning',
  'wander',
  'chase',
  'recoil',
  'stunned',
]);

const VALID_DRIFTER_STATES = new Set<DrifterStateName>([
  'idle',
  'chase',
  'flee',
  'removed',
]);

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

function assertNonNegInt(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ContractInputError(`${fieldName} must be a non-negative integer`);
  }
  return value;
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
    const tick = assertNonNegInt(item.tick, `inputs.frames[${i}].tick`);
    if (tick <= prevTick) {
      throw new ContractInputError(
        `inputs.frames[${i}].tick (${tick}) must be strictly greater than previous tick (${prevTick})`,
      );
    }
    prevTick = tick;

    const frame: InputFrame = { tick };

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

    for (const key of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) {
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
      scenario.player.carried = assertNonNegInt(raw.player.carried, 'scenario.player.carried');
    }
    if (raw.player.flames !== undefined) {
      scenario.player.flames = assertNonNegInt(raw.player.flames, 'scenario.player.flames');
    }
    if (raw.player.invuln_ticks !== undefined) {
      scenario.player.invuln_ticks = assertNonNegInt(
        raw.player.invuln_ticks,
        'scenario.player.invuln_ticks',
      );
    }
    if (raw.player.dash_cd_ticks !== undefined) {
      scenario.player.dash_cd_ticks = assertNonNegInt(
        raw.player.dash_cd_ticks,
        'scenario.player.dash_cd_ticks',
      );
    }
    if (raw.player.pulse_cd_ticks !== undefined) {
      scenario.player.pulse_cd_ticks = assertNonNegInt(
        raw.player.pulse_cd_ticks,
        'scenario.player.pulse_cd_ticks',
      );
    }
    if (raw.player.charm_ticks !== undefined) {
      scenario.player.charm_ticks = assertNonNegInt(
        raw.player.charm_ticks,
        'scenario.player.charm_ticks',
      );
    }
  }

  for (const flag of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled'] as const) {
    if (raw[flag] !== undefined) {
      if (typeof raw[flag] !== 'boolean') {
        throw new ContractInputError(`scenario.${flag} must be a boolean`);
      }
      scenario[flag] = raw[flag];
    }
  }

  if (raw.time_left_s !== undefined) {
    if (
      typeof raw.time_left_s !== 'number' ||
      !Number.isFinite(raw.time_left_s) ||
      raw.time_left_s < 0
    ) {
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
        let kind: MoteKind | undefined;
        if (item.kind !== undefined) {
          if (item.kind !== 'random' && item.kind !== 'dropped') {
            throw new ContractInputError(`scenario.motes[${idx}].kind must be "random" or "dropped"`);
          }
          kind = item.kind;
        }
        let ttlS: number | null | undefined;
        if (item.ttl_s !== undefined) {
          if (
            item.ttl_s !== null &&
            (typeof item.ttl_s !== 'number' || !Number.isFinite(item.ttl_s) || item.ttl_s < 0)
          ) {
            throw new ContractInputError(`scenario.motes[${idx}].ttl_s must be null or non-negative number`);
          }
          ttlS = item.ttl_s;
        }
        return {
          ...(item.id !== undefined ? { id: item.id } : {}),
          pos,
          ...(kind !== undefined ? { kind } : {}),
          ...(ttlS !== undefined ? { ttl_s: ttlS } : {}),
        };
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
      let state: ShadeStateName | undefined;
      if (item.state !== undefined) {
        if (typeof item.state !== 'string' || !VALID_SHADE_STATES.has(item.state as ShadeStateName)) {
          throw new ContractInputError(`scenario.shades[${idx}].state is invalid: ${String(item.state)}`);
        }
        state = item.state as ShadeStateName;
      }
      let stateTicksLeft: number | undefined;
      if (item.state_ticks_left !== undefined) {
        stateTicksLeft = assertNonNegInt(
          item.state_ticks_left,
          `scenario.shades[${idx}].state_ticks_left`,
        );
      }
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(state !== undefined ? { state } : {}),
        ...(stateTicksLeft !== undefined ? { state_ticks_left: stateTicksLeft } : {}),
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
        out.deposited = assertNonNegInt(item.deposited, `scenario.lanterns[${idx}].deposited`);
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

  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) {
      throw new ContractInputError('scenario.drifters must be an array');
    }
    scenario.drifters = raw.drifters.map((item, idx) => {
      if (!isPlainObject(item)) {
        throw new ContractInputError(`scenario.drifters[${idx}] must be an object`);
      }
      const pos = assertVec3(item.pos, `scenario.drifters[${idx}].pos`);
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractInputError(`scenario.drifters[${idx}].id must be a string`);
      }
      let state: DrifterStateName | undefined;
      if (item.state !== undefined) {
        if (
          typeof item.state !== 'string' ||
          !VALID_DRIFTER_STATES.has(item.state as DrifterStateName)
        ) {
          throw new ContractInputError(`scenario.drifters[${idx}].state is invalid`);
        }
        state = item.state as DrifterStateName;
      }
      let stolen: number | undefined;
      if (item.stolen !== undefined) {
        stolen = assertNonNegInt(item.stolen, `scenario.drifters[${idx}].stolen`);
      }
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(state !== undefined ? { state } : {}),
        ...(stolen !== undefined ? { stolen } : {}),
      };
    });
  }

  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) {
      throw new ContractInputError('scenario.charms must be an array');
    }
    scenario.charms = raw.charms.map((item, idx) => {
      if (!isPlainObject(item)) {
        throw new ContractInputError(`scenario.charms[${idx}] must be an object`);
      }
      const pos = assertVec3(item.pos, `scenario.charms[${idx}].pos`);
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractInputError(`scenario.charms[${idx}].id must be a string`);
      }
      let available: boolean | undefined;
      if (item.available !== undefined) {
        if (typeof item.available !== 'boolean') {
          throw new ContractInputError(`scenario.charms[${idx}].available must be a boolean`);
        }
        available = item.available;
      }
      let respawnS: number | undefined;
      if (item.respawn_s !== undefined) {
        if (typeof item.respawn_s !== 'number' || !Number.isFinite(item.respawn_s) || item.respawn_s < 0) {
          throw new ContractInputError(`scenario.charms[${idx}].respawn_s must be non-negative`);
        }
        respawnS = item.respawn_s;
      }
      return {
        ...(item.id !== undefined ? { id: item.id } : {}),
        pos,
        ...(available !== undefined ? { available } : {}),
        ...(respawnS !== undefined ? { respawn_s: respawnS } : {}),
      };
    });
  }

  return scenario;
}
