import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const safeId = /^[a-f0-9]{24}$/;
const identity = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const events = new Set(['session-start', 'session-end', 'start', 'progress', 'complete', 'interrupt']);
const outcomes = new Set(['completed', 'interrupted', 'session-closed', 'abandoned']);

export class LocalStatusStore {
  constructor(path, instanceId, serviceId = 'codex-cli') {
    if (!identity.test(instanceId) || !identity.test(serviceId)) throw new Error('Invalid producer identity');
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=250; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1), service TEXT, instance TEXT);
      CREATE TABLE IF NOT EXISTS owners (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, closed_at INTEGER);
      CREATE TABLE IF NOT EXISTS operations (session TEXT, turn TEXT, started_at INTEGER NOT NULL,
        progress_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, PRIMARY KEY(session,turn));
      CREATE TABLE IF NOT EXISTS emitter (singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        state TEXT NOT NULL DEFAULT 'idle', state_since INTEGER NOT NULL DEFAULT 0, sequence INTEGER NOT NULL DEFAULT 0,
        lease_owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0, pending TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt INTEGER NOT NULL DEFAULT 0, last_prepared INTEGER, last_fingerprint TEXT,
        last_failure TEXT, last_heartbeat INTEGER);
      INSERT OR IGNORE INTO emitter(singleton) VALUES(1);
      CREATE TABLE IF NOT EXISTS write_budget (at INTEGER NOT NULL);`);
    try {
      this.tx(() => {
        this.db.prepare('INSERT OR IGNORE INTO identity VALUES(1,?,?)').run(serviceId, instanceId);
        const row = this.db.prepare('SELECT * FROM identity').get();
        if (row.service !== serviceId || row.instance !== instanceId) throw new Error('Store identity mismatch');
      });
    } catch (error) { this.db.close(); throw error; }
    this.serviceId = serviceId;
    this.instanceId = instanceId;
  }

  close() { this.db.close(); }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  registerOwner(owner, now = Date.now()) {
    if (!safeId.test(owner)) throw new Error('Invalid lifecycle owner');
    this.tx(() => {
      this.db.prepare('INSERT INTO owners VALUES(?,?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at').run(owner, now + 20_000);
      this.db.prepare('UPDATE emitter SET state_since=? WHERE sequence=0 AND state_since=0').run(now);
    });
  }

  renewOwner(owner, now = Date.now()) {
    this.db.prepare('UPDATE owners SET expires_at=? WHERE id=?').run(now + 20_000, owner);
  }

  releaseOwner(owner, now = Date.now()) {
    this.tx(() => this._release(owner, now));
  }

  _release(owner, now) {
    this.db.prepare("UPDATE operations SET ended_at=?,outcome='abandoned' WHERE ended_at IS NULL AND session IN (SELECT id FROM sessions WHERE owner=?)").run(now, owner);
    this.db.prepare('UPDATE sessions SET closed_at=COALESCE(closed_at,?) WHERE owner=?').run(now, owner);
    this.db.prepare('DELETE FROM owners WHERE id=?').run(owner);
  }

  expireOwners(now = Date.now()) {
    this.tx(() => {
      for (const row of this.db.prepare('SELECT id FROM owners WHERE expires_at<=?').all(now)) this._release(row.id, now);
      // Terminal tombstones reject delayed duplicate hooks, but are not indefinite heartbeat history.
      this.db.prepare('DELETE FROM operations WHERE ended_at<?').run(now - 86_400_000);
      this.db.prepare('DELETE FROM sessions WHERE closed_at<?').run(now - 86_400_000);
      this.db.prepare('DELETE FROM write_budget WHERE at<=?').run(now - 60_000);
    });
  }

  apply(record, owner, now = Date.now()) {
    if (!record || !events.has(record.event) || !safeId.test(record.sessionId)
      || (record.turnId !== undefined && !safeId.test(record.turnId))
      || Object.keys(record).some(key => !['event', 'sessionId', 'turnId'].includes(key))
      || (!record.event.startsWith('session-') && !record.turnId) || !safeId.test(owner)) {
      throw new Error('Invalid lifecycle metadata');
    }
    this.tx(() => {
      if (!this.db.prepare('SELECT id FROM owners WHERE id=? AND expires_at>?').get(owner, now)) return;
      this.db.prepare('INSERT OR IGNORE INTO sessions(id,owner) VALUES(?,?)').run(record.sessionId, owner);
      const session = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(record.sessionId);
      if (session.owner !== owner || session.closed_at !== null) return;
      if (record.event === 'session-end') {
        this.db.prepare("UPDATE operations SET ended_at=?,outcome='session-closed' WHERE session=? AND ended_at IS NULL").run(now, record.sessionId);
        this.db.prepare('UPDATE sessions SET closed_at=? WHERE id=?').run(now, record.sessionId);
      } else if (record.event === 'start') {
        this.db.prepare('INSERT OR IGNORE INTO operations(session,turn,started_at,progress_at) VALUES(?,?,?,?)').run(record.sessionId, record.turnId, now, now);
      } else if (record.event === 'progress') {
        this.db.prepare('UPDATE operations SET progress_at=MAX(progress_at,?) WHERE session=? AND turn=? AND ended_at IS NULL').run(now, record.sessionId, record.turnId);
      } else if (record.event === 'complete' || record.event === 'interrupt') {
        const outcome = record.event === 'interrupt' ? 'interrupted' : 'completed';
        this.db.prepare(`INSERT INTO operations VALUES(?,?,?,?,?,?) ON CONFLICT(session,turn) DO UPDATE SET
          ended_at=COALESCE(operations.ended_at,excluded.ended_at),
          outcome=CASE WHEN excluded.outcome='interrupted' THEN 'interrupted' ELSE COALESCE(operations.outcome,excluded.outcome) END`).run(record.sessionId, record.turnId, now, now, now, outcome);
      }
    });
  }

  _snapshot(now, healthy) {
    const active = this.db.prepare('SELECT COUNT(*) AS count, MIN(started_at) AS started, MIN(progress_at) AS progress FROM operations WHERE ended_at IS NULL').get();
    // Audited uncertainty timeout: reporter presence is NOT operation progress.
    const state = active.count === 0 ? 'idle' : healthy && now - active.progress >= 90_000 ? 'stuck' : 'working';
    let emitter = this.db.prepare('SELECT * FROM emitter').get();
    if (emitter.state !== state) {
      this.db.prepare('UPDATE emitter SET state=?,state_since=? WHERE singleton=1').run(state, now);
      emitter = this.db.prepare('SELECT * FROM emitter').get();
    }
    const last = this.db.prepare('SELECT outcome FROM operations WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1').get();
    return { state, stateSince: emitter.state_since, activeCount: active.count, startedAt: active.started,
      online: this.db.prepare('SELECT COUNT(*) AS count FROM sessions JOIN owners ON sessions.owner=owners.id WHERE owners.expires_at>? AND sessions.closed_at IS NULL').get(now).count > 0,
      lastOutcome: outcomes.has(last?.outcome) ? last.outcome : null };
  }

  snapshot(now = Date.now(), healthy = false) {
    return this.tx(() => this._snapshot(now, healthy));
  }
}
