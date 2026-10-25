import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { roomError } from './paths.mjs';
import { readJson, writeJsonAtomic } from './store.mjs';

// Sessions waiting to start one after another, and schedules that add a session to that queue when they are due.
// Both live in the room's data folder, so they survive a restart.
const MAX_QUEUE = 20;
const MAX_SCHEDULES = 20;
export const REPEATS = ['once', 'daily', 'weekdays'];

const newId = () => `${Date.now()}-${randomBytes(3).toString('hex')}`;
const titleOf = body => String(body.task || body.question || (body.issue ? `Issue ${body.issue}` : body.pr ? `Review PR ${body.pr}` : 'Session')).split('\n')[0].slice(0, 80);

// A start body that may wait: any session the start form can make, but no attachments (they are for starting now).
function cleanBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw roomError('QUEUE_BODY_INVALID');
  if (body.attachments?.length) throw roomError('QUEUE_NO_ATTACHMENTS', 'Attachments are for starting now; queued and scheduled sessions cannot carry them.');
  return body;
}

// The next run after `after`: daily adds days, weekdays also skips Saturday and Sunday. Local time, like the owner's clock.
export function nextRun(schedule, after = Date.now()) {
  if (schedule.repeat === 'once') return null;
  const next = new Date(schedule.nextRun);
  do next.setDate(next.getDate() + 1);
  while (next.getTime() <= after || (schedule.repeat === 'weekdays' && (next.getDay() === 0 || next.getDay() === 6)));
  return next.toISOString();
}

export class RoomQueue {
  constructor(dataDir) {
    this.file = join(dataDir, 'queue.json');
    const saved = readJson(this.file, {});
    this.items = saved.items ?? [];
    this.failed = saved.failed ?? [];
    this.schedules = saved.schedules ?? [];
  }

  save() { writeJsonAtomic(this.file, { items: this.items, failed: this.failed, schedules: this.schedules }); }

  view() { return { items: this.items, failed: this.failed, schedules: this.schedules }; }

  get waiting() { return this.items.length > 0 || this.schedules.length > 0; }

  add(body, source = 'owner') {
    if (this.items.length >= MAX_QUEUE) throw roomError('QUEUE_FULL', `At most ${MAX_QUEUE} sessions can wait.`);
    const clean = cleanBody(body);
    const item = { id: newId(), title: titleOf(clean), source, addedAt: new Date().toISOString(), body: clean };
    this.items.push(item);
    this.save();
    return item;
  }

  remove(id) {
    const before = this.items.length + this.failed.length + this.schedules.length;
    this.items = this.items.filter(i => i.id !== id);
    this.failed = this.failed.filter(i => i.id !== id);
    this.schedules = this.schedules.filter(s => s.id !== id);
    if (before === this.items.length + this.failed.length + this.schedules.length) throw roomError('QUEUE_ITEM_UNKNOWN');
    this.save();
  }

  // at: the first run (an ISO time in the future); repeat: once, daily or weekdays (a weekend first run moves to Monday).
  schedule({ body, at, repeat = 'once' }, now = Date.now()) {
    if (this.schedules.length >= MAX_SCHEDULES) throw roomError('SCHEDULES_FULL', `At most ${MAX_SCHEDULES} schedules.`);
    if (!REPEATS.includes(repeat)) throw roomError('SCHEDULE_INVALID', `repeat must be one of ${REPEATS.join(', ')}.`);
    const first = Date.parse(at);
    if (!Number.isFinite(first) || first <= now) throw roomError('SCHEDULE_INVALID', 'Pick a time in the future.');
    const clean = cleanBody(body);
    let nextRunAt = new Date(first).toISOString();
    const day = new Date(first).getDay();
    if (repeat === 'weekdays' && (day === 0 || day === 6)) nextRunAt = nextRun({ repeat, nextRun: nextRunAt }, first);
    const item = { id: newId(), title: titleOf(clean), repeat, nextRun: nextRunAt, body: clean };
    this.schedules.push(item);
    this.save();
    return item;
  }

  // Moves every due schedule's session onto the queue; a once schedule then goes, a repeating one moves to its next run.
  // A run missed while the room was down is queued once, not once per missed day.
  due(now = Date.now()) {
    const due = this.schedules.filter(s => Date.parse(s.nextRun) <= now);
    if (!due.length) return [];
    for (const s of due) {
      this.items.push({ id: newId(), title: s.title, source: `schedule:${s.id}`, addedAt: new Date(now).toISOString(), body: s.body });
      s.nextRun = nextRun(s, now);
    }
    this.schedules = this.schedules.filter(s => s.nextRun);
    this.save();
    return due;
  }

  // The next item to start, taken off the queue.
  take() {
    const item = this.items.shift() ?? null;
    if (item) this.save();
    return item;
  }

  // An item that could not start (a bad body, a missing repo): kept with the reason until the owner dismisses it.
  fail(item, message) {
    this.failed = [{ ...item, error: message, failedAt: new Date().toISOString() }, ...this.failed].slice(0, 20);
    this.save();
  }
}
