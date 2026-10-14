import { roomError } from './paths.mjs';

// Per-session caps; cost per task varies widely, so a runaway loop must stop and ask the owner.
export const DEFAULT_LIMITS = { minutes: 120, turns: 80, rounds: 3 };
const RANGES = { minutes: [5, 720], turns: [1, 500], rounds: [1, 10] };

export function cleanLimits(value, defaults = DEFAULT_LIMITS) {
  if (value === undefined || value === null) return { ...defaults };
  if (typeof value !== 'object' || Array.isArray(value)) throw roomError('LIMITS_INVALID');
  const limits = { ...defaults };
  for (const [name, [min, max]] of Object.entries(RANGES)) {
    if (value[name] === undefined) continue;
    const n = value[name];
    if (!Number.isInteger(n) || n < min || n > max) throw roomError('LIMITS_INVALID', `${name} must be a whole number from ${min} to ${max}.`);
    limits[name] = n;
  }
  return limits;
}

// The session-wide limit that stops the next turn, or null. Work time counts agent turns and checks, never waiting on the owner.
export function sessionLimitHit({ limits, turns = 0, workMs = 0 }) {
  if (!limits) return null;
  if (turns >= limits.turns) return { kind: 'turns', reason: `The session reached its ${limits.turns}-turn limit. Retry allows 10 more.` };
  const minutes = Math.floor(workMs / 60_000);
  if (minutes >= limits.minutes) return { kind: 'minutes', reason: `The session worked for ${minutes} minutes, its limit is ${limits.minutes}. Retry allows 15 more.` };
  return null;
}
