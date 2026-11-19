'use strict';

/**
 * Minimal PostgreSQL client and connection pool – pure Node.js, no packages.
 *
 * Implements the PostgreSQL frontend/backend protocol v3:
 *   - authentication: trust, cleartext, MD5 and SCRAM-SHA-256
 *   - TLS that always checks the server's certificate (sslmode=require / verify-ca / verify-full,
 *     optional sslrootcert=/path/ca.pem); see checkTransport() for the production rule
 *   - time limits: connecting, each statement, and waiting for a free connection
 *   - parameterised queries ($1, $2 …) through the extended query protocol
 *   - multi-statement scripts (migrations) through the simple query protocol
 *   - transactions on a dedicated connection
 *
 * Usage:
 *   const db = createPool({ connectionString: 'postgres://user:pass@localhost:5432/bquee' });
 *   const { rows } = await db.query('SELECT * FROM salons WHERE id = $1', [id]);
 *   await db.transaction(async (tx) => { await tx.query(...); });
 */

const fs = require('fs');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

const PROTOCOL_VERSION = 196608; // 3.0
const SSL_REQUEST_CODE = 80877103;

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/*
 * sslmode:
 *   disable                 no TLS (only acceptable on a private network – see checkTransport)
 *   require / prefer / allow
 *   verify-full             TLS, certificate checked against trusted CAs AND the host name.
 *                           Unlike libpq, "require" is NOT allowed to skip the check.
 *   verify-ca               TLS, certificate checked against trusted CAs (host name not checked)
 *   no-verify               TLS without any check – refused in production (see checkTransport)
 * sslrootcert=/path/ca.pem  trust this CA (for databases with their own CA); otherwise the system CAs.
 */
const VERIFYING_MODES = ['require', 'prefer', 'allow', 'verify-full', 'verify-ca'];

function parseConnectionString(connectionString) {
  const url = new URL(connectionString);
  const params = url.searchParams;
  const sslmode = params.get('sslmode') || 'disable';
  if (sslmode !== 'disable' && sslmode !== 'no-verify' && !VERIFYING_MODES.includes(sslmode))
    throw new Error('Unknown sslmode "' + sslmode + '" in DATABASE_URL');
  let ssl = false;
  if (sslmode !== 'disable') {
    ssl = { rejectUnauthorized: sslmode !== 'no-verify' };
    const rootcert = params.get('sslrootcert');
    if (rootcert) ssl.ca = fs.readFileSync(rootcert);
    if (sslmode === 'verify-ca') ssl.checkServerIdentity = () => undefined;
  }
  return {
    host: decodeURIComponent(url.hostname || 'localhost').replace(/^\[|\]$/g, ''),
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || url.username || 'postgres'),
    sslmode,
    ssl,
  };
}

/** Hosts that are only reachable inside a private network (not across the internet). */
function isPrivateHost(host) {
  const h = String(host).toLowerCase();
  if (h === 'localhost' || h.startsWith('/')) return true; // local machine or Unix socket
  if (net.isIP(h) === 4) {
    const [a, b] = h.split('.').map(Number);
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  }
  if (net.isIP(h) === 6) return h === '::1' || /^f[cd]/.test(h);
  // A name without dots (e.g. Render's internal "dpg-abc123-a", or a Docker service "db") only
  // resolves inside that private network.
  return !h.includes('.');
}

/**
 * Is this database connection safe for production?
 *   public host  -> TLS with the certificate checked, otherwise refused
 *   private host -> allowed without TLS, with a warning (traffic never leaves the private network)
 * Returns { ok, message }.
 */
function checkTransport(connectionString) {
  const o = parseConnectionString(connectionString);
  const verified = !!o.ssl && o.ssl.rejectUnauthorized !== false;
  if (verified) return { ok: true, message: 'Database connection: TLS with certificate check (' + o.sslmode + ').' };
  if (isPrivateHost(o.host))
    return {
      ok: true,
      warning: true,
      message:
        'Database connection: private network host "' +
        o.host +
        '" without TLS – fine only inside a private network (e.g. Render internal URL).',
    };
  return {
    ok: false,
    message:
      'Refusing to start: the database "' +
      o.host +
      '" is reached over the internet without a checked TLS certificate. ' +
      'Add ?sslmode=verify-full to DATABASE_URL (and sslrootcert=/path/ca.pem if your provider uses its own CA).',
  };
}

/* -------------------------------------------------------------------------- */
/* Message encoding                                                           */
/* -------------------------------------------------------------------------- */

class Writer {
  constructor() {
    this.parts = [];
    this.size = 0;
  }

  int32(n) {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return this.push(b);
  }
  int16(n) {
    const b = Buffer.alloc(2);
    b.writeInt16BE(n);
    return this.push(b);
  }
  cstring(s) {
    return this.push(Buffer.from(String(s) + '\0', 'utf8'));
  }
  bytes(b) {
    return this.push(b);
  }

  push(buf) {
    this.parts.push(buf);
    this.size += buf.length;
    return this;
  }

  /** Builds a protocol message: 1-byte type + int32 length + body. */
  message(type) {
    const head = Buffer.alloc(type ? 5 : 4);
    if (type) {
      head.write(type, 0, 'ascii');
      head.writeInt32BE(this.size + 4, 1);
    } else head.writeInt32BE(this.size + 4, 0);
    return Buffer.concat([head, ...this.parts]);
  }
}

/* -------------------------------------------------------------------------- */
/* Type parsing (text format)                                                  */
/* -------------------------------------------------------------------------- */

const TYPE = {
  BOOL: 16,
  INT8: 20,
  INT2: 21,
  INT4: 23,
  OID: 26,
  FLOAT4: 700,
  FLOAT8: 701,
  NUMERIC: 1700,
  JSON: 114,
  JSONB: 3802,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  TEXT_ARRAY: 1009,
  VARCHAR_ARRAY: 1015,
};

function parseTimestamp(text) {
  // "2026-11-15 03:10:00.123+00" → ISO 8601
  let iso = text.replace(' ', 'T');
  if (/[+-]\d\d$/.test(iso)) iso += ':00';
  return new Date(iso);
}

/** One-dimensional text array literal → JS array: {a,"b c",NULL} → ['a', 'b c', null]. */
function parseTextArray(text) {
  const result = [];
  if (text === '{}') return result;
  let i = 1;
  while (i < text.length - 1) {
    let value = '';
    if (text[i] === '"') {
      i += 1;
      while (text[i] !== '"') {
        if (text[i] === '\\') i += 1;
        value += text[i];
        i += 1;
      }
      i += 1;
      result.push(value);
    } else {
      while (text[i] !== ',' && i < text.length - 1) {
        value += text[i];
        i += 1;
      }
      result.push(value === 'NULL' ? null : value);
    }
    i += 1; // skip the comma
  }
  return result;
}

function parseValue(text, typeOid) {
  switch (typeOid) {
    case TYPE.BOOL:
      return text === 't';
    case TYPE.INT2:
    case TYPE.INT4:
    case TYPE.OID:
      return Number(text);
    case TYPE.INT8: {
      const n = Number(text);
      return Number.isSafeInteger(n) ? n : text;
    }
    case TYPE.FLOAT4:
    case TYPE.FLOAT8:
    case TYPE.NUMERIC:
      return Number(text);
    case TYPE.JSON:
    case TYPE.JSONB:
      return JSON.parse(text);
    case TYPE.TIMESTAMP:
    case TYPE.TIMESTAMPTZ:
      return parseTimestamp(text);
    case TYPE.TEXT_ARRAY:
    case TYPE.VARCHAR_ARRAY:
      return parseTextArray(text);
    default:
      return text; // text, varchar, date ("YYYY-MM-DD"), uuid …
  }
}

/** JS array → PostgreSQL array literal, e.g. ['a', 'b"c'] → {"a","b\"c"} (use with $1::text[]). */
function arrayLiteral(values) {
  const items = values.map((v) => {
    if (v === null || v === undefined) return 'NULL';
    return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  });
  return '{' + items.join(',') + '}';
}

function serializeParam(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return arrayLiteral(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

const ERROR_FIELDS = {
  S: 'severity',
  V: 'severityRaw',
  C: 'code',
  M: 'message',
  D: 'detail',
  H: 'hint',
  P: 'position',
  s: 'schema',
  t: 'table',
  c: 'column',
  n: 'constraint',
  W: 'where',
};

function parseErrorFields(body) {
  const fields = {};
  let i = 0;
  while (i < body.length && body[i] !== 0) {
    const key = String.fromCharCode(body[i]);
    const end = body.indexOf(0, i + 1);
    fields[ERROR_FIELDS[key] || key] = body.toString('utf8', i + 1, end);
    i = end + 1;
  }
  return fields;
}

class DatabaseError extends Error {
  constructor(fields) {
    super(fields.message || 'Database error');
    this.name = 'DatabaseError';
    Object.assign(this, fields);
  }
}

/* -------------------------------------------------------------------------- */
/* Connection                                                                 */
/* -------------------------------------------------------------------------- */

class Connection {
  constructor(options) {
    this.options = options;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.queue = []; // pending operations, processed one at a time
    this.current = null; // the operation receiving server messages
    this.closed = false;
  }

  /** Opens the socket, TLS and signs in – all within connectTimeoutMs. */
  async connect() {
    const ms = this.options.connectTimeoutMs || 10000;
    let raw = null;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (raw) raw.destroy();
        if (this.socket) this.fail(new Error('Database did not answer within ' + ms / 1000 + ' s'));
        reject(new Error('Could not connect to the database within ' + ms / 1000 + ' s'));
      }, ms);
    });
    const opening = this.open((s) => (raw = s));
    opening.catch(() => {}); // after a timeout its own error is no longer needed
    try {
      await Promise.race([opening, timeout]);
    } finally {
      clearTimeout(timer);
    }
    return this;
  }

  async open(keep) {
    const { host, port, ssl } = this.options;
    let socket = await new Promise((resolve, reject) => {
      const s = net.connect({ host, port });
      keep(s);
      s.once('connect', () => resolve(s));
      s.once('error', reject);
    });
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000); // notices dead connections (e.g. after a network drop)
    if (ssl) socket = await this.upgradeToTls(socket);

    this.socket = socket;
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', (err) => this.fail(err));
    socket.on('close', () => this.fail(new Error('Database connection closed')));

    await this.run({ kind: 'startup', send: () => this.sendStartup() });
  }

  upgradeToTls(socket) {
    return new Promise((resolve, reject) => {
      socket.write(new Writer().int32(SSL_REQUEST_CODE).message(null));
      socket.once('data', (reply) => {
        if (reply[0] !== 0x53 /* 'S' */)
          return reject(new Error('The PostgreSQL server does not accept SSL connections'));
        // The certificate is checked (rejectUnauthorized) unless sslmode=no-verify.
        const servername = net.isIP(this.options.host) ? undefined : this.options.host;
        // host: the name the certificate must match (Node would otherwise assume "localhost").
        const secure = tls.connect({ socket, host: this.options.host, servername, ...this.options.ssl });
        secure.once('secureConnect', () => resolve(secure));
        secure.once('error', (err) => reject(new Error('Database TLS failed: ' + err.message)));
      });
    });
  }

  sendStartup() {
    const { user, database } = this.options;
    const w = new Writer().int32(PROTOCOL_VERSION);
    for (const [k, v] of Object.entries({
      user,
      database,
      client_encoding: 'UTF8',
      TimeZone: 'UTC',
      application_name: 'bquee',
      // The server stops any statement running longer than this (0 = no limit).
      statement_timeout: String(this.options.statementTimeoutMs == null ? 60000 : this.options.statementTimeoutMs),
    }))
      w.cstring(k).cstring(v);
    this.socket.write(w.bytes(Buffer.from([0])).message(null));
  }

  /** Simple query protocol – used for multi-statement scripts. */
  exec(sql) {
    return this.run({ kind: 'query', send: () => this.socket.write(new Writer().cstring(sql).message('Q')) });
  }

  /** Extended query protocol – safe parameter binding. */
  query(sql, params = []) {
    return this.run({
      kind: 'query',
      send: () => {
        const parse = new Writer().cstring('').cstring(sql).int16(0).message('P');
        const bind = new Writer().cstring('').cstring('').int16(0).int16(params.length);
        for (const p of params) {
          const v = serializeParam(p);
          if (v === null) bind.int32(-1);
          else {
            const b = Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8');
            bind.int32(b.length).bytes(b);
          }
        }
        bind.int16(0);
        const describe = new Writer().push(Buffer.from('P\0')).message('D');
        const execute = new Writer().cstring('').int32(0).message('E');
        const sync = new Writer().message('S');
        this.socket.write(Buffer.concat([parse, bind.message('B'), describe, execute, sync]));
      },
    });
  }

  run(op) {
    if (this.closed) return Promise.reject(new Error('Database connection is closed'));
    return new Promise((resolve, reject) => {
      Object.assign(op, { resolve, reject, fields: [], rows: [], rowCount: 0, error: null });
      this.queue.push(op);
      if (!this.current) this.next();
    });
  }

  next() {
    clearTimeout(this.opTimer);
    this.current = this.queue.shift() || null;
    if (!this.current) return;
    // Safety net if the network silently drops: the server's own statement_timeout normally answers
    // first. Scripts (migrations) have no limit.
    const limit =
      this.current.kind === 'query' && this.options.statementTimeoutMs !== 0
        ? (this.options.statementTimeoutMs || 60000) + 15000
        : 0;
    if (limit)
      this.opTimer = setTimeout(
        () => this.fail(new Error('Database did not answer within ' + limit / 1000 + ' s')),
        limit,
      );
    this.current.send();
  }

  onData(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    try {
      while (this.buffer.length >= 5) {
        const length = this.buffer.readInt32BE(1);
        if (length < 4 || length > 512 * 1024 * 1024) throw new Error('bad message length ' + length);
        if (this.buffer.length < length + 1) break;
        const type = String.fromCharCode(this.buffer[0]);
        const body = this.buffer.subarray(5, length + 1);
        this.buffer = this.buffer.subarray(length + 1);
        this.handleMessage(type, body);
      }
    } catch (err) {
      // A reply we can't read means the connection can't be trusted any more: drop it.
      this.fail(new Error('Unexpected reply from the database (' + err.message + ')'));
    }
  }

  handleMessage(type, body) {
    const op = this.current;
    switch (type) {
      case 'R':
        return this.handleAuth(body);
      case 'T': {
        // RowDescription
        if (!op) throw new Error('row description without a query');
        const count = body.readInt16BE(0);
        let i = 2;
        op.fields = [];
        for (let f = 0; f < count; f++) {
          const end = body.indexOf(0, i);
          const name = body.toString('utf8', i, end);
          i = end + 1;
          op.fields.push({ name, typeOid: body.readInt32BE(i + 6) });
          i += 18;
        }
        return;
      }
      case 'D': {
        // DataRow
        if (!op) throw new Error('row without a query');
        const count = body.readInt16BE(0);
        if (count !== op.fields.length) throw new Error('row has ' + count + ' columns, expected ' + op.fields.length);
        const row = {};
        let i = 2;
        for (let c = 0; c < count; c++) {
          const len = body.readInt32BE(i);
          i += 4;
          if (len < -1 || i + Math.max(len, 0) > body.length) throw new Error('column runs past the row');
          const field = op.fields[c];
          row[field.name] = len === -1 ? null : parseValue(body.toString('utf8', i, i + len), field.typeOid);
          if (len > 0) i += len;
        }
        op.rows.push(row);
        return;
      }
      case 'C': {
        // CommandComplete, e.g. "UPDATE 3"
        if (!op) throw new Error('completion without a query');
        const tag = body.toString('utf8', 0, body.length - 1);
        const n = Number(tag.split(' ').pop());
        if (!Number.isNaN(n)) op.rowCount = n;
        return;
      }
      case 'E': {
        // ErrorResponse
        const err = new DatabaseError(parseErrorFields(body));
        if (op && op.kind === 'startup') {
          op.reject(err);
          this.current = null;
          return this.close();
        }
        if (op) op.error = err;
        return;
      }
      case 'Z': {
        // ReadyForQuery
        if (op) {
          if (op.error) op.reject(op.error);
          else op.resolve({ rows: op.rows, rowCount: op.rowCount || op.rows.length, fields: op.fields });
        }
        return this.next();
      }
      default:
        return; // ParseComplete, BindComplete, NoData, ParameterStatus, BackendKeyData, Notice…
    }
  }

  /* ---- authentication ---------------------------------------------------- */

  handleAuth(body) {
    const code = body.readInt32BE(0);
    const { user, password } = this.options;
    const send = (buf) => this.socket.write(buf);

    if (code === 0) return; // AuthenticationOk – wait for ReadyForQuery
    if (code === 3) return send(new Writer().cstring(password).message('p'));
    if (code === 5) {
      const salt = body.subarray(4, 8);
      const inner = md5(password + user);
      return send(new Writer().cstring('md5' + md5(Buffer.concat([Buffer.from(inner), salt]))).message('p'));
    }
    if (code === 10) {
      // SASL – choose SCRAM-SHA-256
      const mechanisms = body.toString('utf8', 4).split('\0');
      if (!mechanisms.includes('SCRAM-SHA-256'))
        return this.fail(new Error('Unsupported SASL mechanism: ' + mechanisms.join(', ')));
      this.scram = { nonce: crypto.randomBytes(18).toString('base64') };
      this.scram.clientFirstBare = 'n=,r=' + this.scram.nonce;
      const first = Buffer.from('n,,' + this.scram.clientFirstBare);
      return send(new Writer().cstring('SCRAM-SHA-256').int32(first.length).bytes(first).message('p'));
    }
    if (code === 11) {
      // SASLContinue
      const serverFirst = body.toString('utf8', 4);
      const attrs = Object.fromEntries(serverFirst.split(',').map((kv) => [kv[0], kv.slice(2)]));
      if (!attrs.r || !attrs.r.startsWith(this.scram.nonce)) return this.fail(new Error('SCRAM: invalid server nonce'));
      const salted = crypto.pbkdf2Sync(
        password.normalize('NFKC'),
        Buffer.from(attrs.s, 'base64'),
        Number(attrs.i),
        32,
        'sha256',
      );
      const clientKey = hmac(salted, 'Client Key');
      const storedKey = crypto.createHash('sha256').update(clientKey).digest();
      const clientFinalBare = 'c=biws,r=' + attrs.r;
      const authMessage = this.scram.clientFirstBare + ',' + serverFirst + ',' + clientFinalBare;
      const signature = hmac(storedKey, authMessage);
      const proof = Buffer.from(clientKey.map((b, i) => b ^ signature[i]));
      this.scram.expectedServerSignature = hmac(hmac(salted, 'Server Key'), authMessage).toString('base64');
      return send(new Writer().bytes(Buffer.from(clientFinalBare + ',p=' + proof.toString('base64'))).message('p'));
    }
    if (code === 12) {
      // SASLFinal – verify the server knows the password too
      const v = body
        .toString('utf8', 4)
        .split(',')
        .find((x) => x.startsWith('v='));
      if (!v || v.slice(2) !== this.scram.expectedServerSignature)
        return this.fail(new Error('SCRAM: server signature mismatch'));
      return;
    }
    return this.fail(new Error('Unsupported PostgreSQL authentication method (' + code + ')'));
  }

  /* ---- shutdown ---------------------------------------------------------- */

  fail(err) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.opTimer);
    const pending = [this.current, ...this.queue].filter(Boolean);
    this.current = null;
    this.queue = [];
    pending.forEach((op) => op.reject(err));
    if (this.socket) this.socket.destroy();
    if (this.onClose) this.onClose();
  }

  close() {
    if (this.closed) return;
    try {
      this.socket.write(new Writer().message('X'));
    } catch (e) {
      /* already gone */
    }
    this.fail(new Error('Connection closed by client'));
  }
}

const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/* -------------------------------------------------------------------------- */
/* Pool                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Pool of up to `max` connections. Options (all optional):
 *   connectTimeoutMs   10000   give up connecting after this
 *   statementTimeoutMs 60000   the server stops longer statements (0 = no limit)
 *   acquireTimeoutMs   15000   a request waiting this long for a free connection gets "server busy"
 */
function createPool({
  connectionString,
  max = 10,
  ssl,
  connectTimeoutMs,
  statementTimeoutMs,
  acquireTimeoutMs = 15000,
} = {}) {
  const options = parseConnectionString(connectionString);
  if (ssl !== undefined) options.ssl = ssl;
  Object.assign(options, { connectTimeoutMs, statementTimeoutMs });

  const idle = [];
  const waiting = [];
  let total = 0;
  let ending = false;

  async function acquire() {
    while (idle.length) {
      const conn = idle.pop();
      if (!conn.closed) return conn;
      total--;
    }
    if (total < max) {
      total++;
      try {
        return await newConnection().connect();
      } catch (err) {
        total--;
        throw err;
      }
    }
    // All connections are busy: wait for one, but not forever.
    return new Promise((resolve, reject) => {
      const waiter = (conn) => {
        clearTimeout(waiter.timer);
        resolve(conn);
      };
      waiter.timer = setTimeout(() => {
        const i = waiting.indexOf(waiter);
        if (i >= 0) waiting.splice(i, 1);
        const err = new Error('The server is busy – please try again in a moment.');
        err.status = 503;
        reject(err);
      }, acquireTimeoutMs);
      waiting.push(waiter);
    });
  }

  /** A connection that frees its place in the pool when the server or network closes it while idle. */
  function newConnection() {
    const conn = new Connection(options);
    conn.onClose = () => {
      const i = idle.indexOf(conn);
      if (i < 0) return; // in use: release() sees it is closed and frees the place
      idle.splice(i, 1);
      total--;
      wakeWaiter();
    };
    return conn;
  }

  function release(conn) {
    if (conn.closed) {
      total--;
      return wakeWaiter();
    }
    if (ending) {
      conn.close();
      total--;
      return;
    }
    const next = waiting.shift();
    if (next) next(conn);
    else idle.push(conn);
  }

  // A connection was lost: open a fresh one for the next waiter (it keeps its own time limit).
  function wakeWaiter() {
    if (!waiting.length || total >= max) return;
    const next = waiting.shift();
    total++;
    newConnection()
      .connect()
      .then(next, () => {
        total--;
        waiting.unshift(next);
      });
  }

  return {
    /** Runs one parameterised statement. */
    async query(sql, params) {
      const conn = await acquire();
      try {
        return await conn.query(sql, params);
      } finally {
        release(conn);
      }
    },

    /** Runs a multi-statement SQL script (no parameters). */
    async exec(sql) {
      const conn = await acquire();
      try {
        return await conn.exec(sql);
      } finally {
        release(conn);
      }
    },

    /** Runs `work(tx)` inside BEGIN … COMMIT; rolls back on any error. */
    async transaction(work) {
      const conn = await acquire();
      const tx = { query: (sql, params) => conn.query(sql, params), exec: (sql) => conn.exec(sql) };
      try {
        await conn.query('BEGIN');
        const result = await work(tx);
        await conn.query('COMMIT');
        return result;
      } catch (err) {
        if (!conn.closed) await conn.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        release(conn);
      }
    },

    async end() {
      ending = true;
      idle.splice(0).forEach((c) => c.close());
    },

    /** Numbers for monitoring: open connections, idle ones, requests waiting. */
    stats() {
      return { total, idle: idle.length, waiting: waiting.length, max };
    },
  };
}

module.exports = { createPool, checkTransport, parseConnectionString };
