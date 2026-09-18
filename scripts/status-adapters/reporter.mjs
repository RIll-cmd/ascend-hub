import { randomUUID } from 'node:crypto';

export function validateEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/api/status/events'
    || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) {
    throw new Error('Invalid status producer endpoint');
  }
  return url.href;
}

export class StatusReporter {
  constructor(store, { endpoint, credential, emitterId, fetchImpl = fetch }) {
    this.store = store;
    this.endpoint = validateEndpoint(endpoint);
    if (typeof credential !== 'string' || !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,127}\.[a-zA-Z0-9_-]{8,256}$/.test(credential)) {
      throw new Error('Invalid status producer credential');
    }
    if (!/^[a-f0-9]{24}$/.test(emitterId)) throw new Error('Invalid emitter identity');
    this.credential = credential;
    this.emitterId = emitterId;
    this.fetchImpl = fetchImpl;
    this.busy = false;
  }

  _prepare(now) {
    return this.store.tx(() => {
      const db = this.store.db;
      let emitter = db.prepare('SELECT * FROM emitter').get();
      if (emitter.lease_owner !== this.emitterId && emitter.lease_until > now) return { result: 'leased' };
      db.prepare('UPDATE emitter SET lease_owner=?,lease_until=? WHERE singleton=1').run(this.emitterId, now + 15_000);
      const snapshot = this.store._snapshot(now, true);
      emitter = db.prepare('SELECT * FROM emitter').get();
      const fingerprint = JSON.stringify([snapshot.state, snapshot.activeCount, snapshot.lastOutcome, snapshot.online]);
      const changed = fingerprint !== emitter.last_fingerprint;
      const due = snapshot.online && (emitter.last_prepared === null || now - emitter.last_prepared >= 10_000);
      if ((changed || due) && (snapshot.online || emitter.last_prepared !== null)) {
        const payload = {
          schemaVersion: 1, eventId: randomUUID(), sequence: emitter.sequence + 1,
          serviceId: this.store.serviceId, instanceId: this.store.instanceId, serviceType: 'agent',
          state: snapshot.state, stateSince: new Date(snapshot.stateSince).toISOString(),
          reportedAt: new Date(now).toISOString(),
          metadata: { activeOperationCount: snapshot.activeCount },
        };
        if (snapshot.lastOutcome) payload.metadata.lastOutcome = snapshot.lastOutcome;
        if (snapshot.activeCount > 0) payload.activity = { kind: 'agent-turn', startedAt: new Date(snapshot.startedAt).toISOString() };
        if (snapshot.state === 'stuck') payload.issue = { code: 'lifecycle-timeout',
          message: 'No lifecycle progress observed for 90 seconds.', retryable: true };
        db.prepare(`UPDATE emitter SET pending=?,sequence=?,attempts=0,next_attempt=?,
          last_prepared=?,last_fingerprint=? WHERE singleton=1`).run(JSON.stringify(payload), payload.sequence, now, now, fingerprint);
        emitter = db.prepare('SELECT * FROM emitter').get();
      }
      if (!emitter.pending || emitter.attempts >= 3 || emitter.next_attempt > now) return { result: 'coalesced' };
      db.prepare('DELETE FROM write_budget WHERE at<=?').run(now - 60_000);
      if (db.prepare('SELECT COUNT(*) AS count FROM write_budget').get().count >= 55) return { result: 'rate-limited' };
      db.prepare('INSERT INTO write_budget VALUES(?)').run(now);
      db.prepare('UPDATE emitter SET attempts=attempts+1 WHERE singleton=1').run();
      return { payload: emitter.pending, attempt: emitter.attempts + 1 };
    });
  }

  releaseLease() {
    this.store.db.prepare('UPDATE emitter SET lease_owner=NULL,lease_until=0 WHERE singleton=1 AND lease_owner=?').run(this.emitterId);
  }

  async tick(now = Date.now()) {
    if (this.busy) return 'busy';
    this.busy = true;
    try {
      this.store.expireOwners(now);
      const prepared = this._prepare(now);
      if (!prepared.payload) return prepared.result;
      let success = false;
      let failure = 'authority-unavailable';
      let permanent = false;
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2000),
          headers: { 'Content-Type': 'application/json', 'X-Status-Credential': this.credential },
          body: prepared.payload,
        });
        success = response.status === 202;
        if ([400, 401, 403, 404, 422].includes(response.status)) {
          permanent = true;
          failure = [401, 403].includes(response.status) ? 'producer-auth-rejected' : 'producer-contract-rejected';
        }
        if (response.status === 429) failure = 'producer-rate-limited';
        // Never read response bodies, raw errors, or server logs as status data.
        await response.body?.cancel();
      } catch { /* Fixed safe codes only; no raw exception or credential logging. */ }
      this.store.tx(() => {
        if (success) {
          this.store.db.prepare(`UPDATE emitter SET pending=NULL,last_failure=NULL,last_heartbeat=?
            WHERE singleton=1 AND lease_owner=? AND pending=?`).run(now, this.emitterId, prepared.payload);
        } else {
          this.store.db.prepare(`UPDATE emitter SET last_failure=?,attempts=CASE WHEN ? THEN 3 ELSE attempts END,next_attempt=?
            WHERE singleton=1 AND lease_owner=? AND pending=?`).run(failure, permanent ? 1 : 0,
              now + (prepared.attempt === 1 ? 2000 : 4000), this.emitterId, prepared.payload);
        }
      });
      return success ? 'sent' : 'retry';
    } catch { return 'local-store-unavailable'; }
    finally { this.busy = false; }
  }
}
