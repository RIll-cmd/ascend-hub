import { LocalStatusStore } from './local-store.mjs';
import { hashLifecycleId } from './antigravity-lifecycle.mjs';

const safeId = /^[a-f0-9]{24}$/;
const eventNames = new Set(['start', 'progress', 'tool-progress', 'stop']);
const safeOutcomes = new Set(['completed', 'interrupted-or-abandoned']);
const counter = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;

export class AntigravityStatusStore extends LocalStatusStore {
  constructor(path, instanceId) {
    super(path, instanceId, 'antigravity-cli');
    this.db.exec(`CREATE TABLE IF NOT EXISTS agy_conversations (
      owner TEXT, conversation TEXT, session TEXT NOT NULL, generation INTEGER NOT NULL,
      last_invocation INTEGER NOT NULL DEFAULT -1, closed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(owner,conversation));`);
  }

  startWrapper(owner, now = Date.now()) {
    // CLI has no SessionStart callback. Supervision owns this presence session.
    super.apply({ event: 'session-start', sessionId: hashLifecycleId(`wrapper:${owner}`) }, owner, now);
  }

  _release(owner, now) {
    this.db.prepare(`UPDATE operations SET ended_at=?,outcome='interrupted-or-abandoned'
      WHERE ended_at IS NULL AND session IN (SELECT id FROM sessions WHERE owner=?)`).run(now, owner);
    this.db.prepare('UPDATE sessions SET closed_at=COALESCE(closed_at,?) WHERE owner=?').run(now, owner);
    this.db.prepare('UPDATE agy_conversations SET closed=1 WHERE owner=?').run(owner);
    this.db.prepare('DELETE FROM owners WHERE id=?').run(owner);
  }

  expireOwners(now = Date.now()) {
    super.expireOwners(now);
    this.db.prepare(`DELETE FROM agy_conversations WHERE owner NOT IN (SELECT id FROM owners)
      AND session NOT IN (SELECT id FROM sessions)`).run();
  }

  apply(record, owner, now = Date.now()) {
    if (!record || !eventNames.has(record.event) || !safeId.test(owner) || !safeId.test(record.sessionId)
      || Object.keys(record).some(key => !['event', 'sessionId', 'turnId', 'invocation', 'execution', 'fullyIdle'].includes(key))
      || (['start', 'progress'].includes(record.event) && (!safeId.test(record.turnId) || !counter(record.invocation)))
      || (record.event === 'stop' && (!counter(record.execution) || typeof record.fullyIdle !== 'boolean'))) {
      throw new Error('Invalid lifecycle metadata');
    }
    this.tx(() => {
      if (!this.db.prepare('SELECT id FROM owners WHERE id=? AND expires_at>?').get(owner, now)) return;
      let scope = this.db.prepare('SELECT * FROM agy_conversations WHERE owner=? AND conversation=?').get(owner, record.sessionId);
      if (record.event === 'start') {
        // A bounded store drops excess observation without affecting the CLI.
        if (this.db.prepare('SELECT COUNT(*) n FROM operations').get().n >= 4096
          || this.db.prepare('SELECT COUNT(*) n FROM sessions').get().n >= 4096) return;
        if (!scope) {
          const session = hashLifecycleId(`${owner}:${record.sessionId}:0`);
          this.db.prepare('INSERT INTO agy_conversations(owner,conversation,session,generation) VALUES(?,?,?,0)').run(owner, record.sessionId, session);
          scope = this.db.prepare('SELECT * FROM agy_conversations WHERE owner=? AND conversation=?').get(owner, record.sessionId);
        } else if (scope.closed) {
          // Live CLI resets invocation numbering at the next user turn.
          // Only zero may open a fresh generation; other delayed starts are ignored.
          if (record.invocation !== 0) return;
          const generation = scope.generation + 1;
          const session = hashLifecycleId(`${owner}:${record.sessionId}:${generation}`);
          this.db.prepare('UPDATE agy_conversations SET session=?,generation=?,last_invocation=-1,closed=0 WHERE owner=? AND conversation=?')
            .run(session, generation, owner, record.sessionId);
          scope = { ...scope, session, generation, last_invocation: -1, closed: 0 };
        }
        if (record.invocation <= scope.last_invocation) return;
        this.db.prepare('INSERT OR IGNORE INTO sessions(id,owner) VALUES(?,?)').run(scope.session, owner);
        this.db.prepare('INSERT OR IGNORE INTO operations(session,turn,started_at,progress_at) VALUES(?,?,?,?)')
          .run(scope.session, record.turnId, now, now);
        // An observed next invocation is progress for the same conversation's loop.
        this.db.prepare('UPDATE operations SET progress_at=MAX(progress_at,?) WHERE session=? AND ended_at IS NULL').run(now, scope.session);
        this.db.prepare('UPDATE agy_conversations SET last_invocation=? WHERE owner=? AND conversation=?').run(record.invocation, owner, record.sessionId);
      } else if (scope && !scope.closed) {
        if (record.event === 'progress') {
          this.db.prepare('UPDATE operations SET progress_at=MAX(progress_at,?) WHERE session=? AND turn=? AND ended_at IS NULL')
            .run(now, scope.session, record.turnId);
        } else if (record.event === 'tool-progress') {
          // Observed tool hooks lack an invocation counter: scope only to this conversation.
          this.db.prepare('UPDATE operations SET progress_at=MAX(progress_at,?) WHERE session=? AND ended_at IS NULL').run(now, scope.session);
        } else if (record.event === 'stop' && record.fullyIdle) {
          this.db.prepare("UPDATE operations SET ended_at=?,outcome='completed' WHERE session=? AND ended_at IS NULL").run(now, scope.session);
          this.db.prepare('UPDATE sessions SET closed_at=COALESCE(closed_at,?) WHERE id=?').run(now, scope.session);
          this.db.prepare('UPDATE agy_conversations SET closed=1 WHERE owner=? AND conversation=?').run(owner, record.sessionId);
        }
      }
    });
  }

  _snapshot(now, healthy) {
    const snapshot = super._snapshot(now, healthy);
    const last = this.db.prepare('SELECT outcome FROM operations WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1').get();
    return { ...snapshot, lastOutcome: safeOutcomes.has(last?.outcome) ? last.outcome : null };
  }
}
