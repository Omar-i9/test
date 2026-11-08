const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_OPERATIONS_PER_REQUEST = 25;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_PULL_LIMIT = 100;
const MAX_REVISION = 2_147_483_647;
const EXPECTED_HEADER = 'x-taamen-requested';
const ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MATCH_TYPES = new Set(['strong', 'normal', 'friendly', 'competitive', 'tournament']);
const MATCH_STATUSES = new Set([
  'UPCOMING', 'ACTIVE', 'COMPLETED_PENDING_RESULT', 'COMPLETED_WITH_RESULT', 'ARCHIVED',
]);
const MATCH_VISIBILITY = new Set(['LOCAL', 'PUBLIC', 'PRIVATE']);
const MATCH_FIELDS = new Set([
  'id', 'type', 'team1', 'team2', 'score1', 'score2', 'status', 'dateLabel', 'dateKey',
  'dateISO', 'story', 'title', 'stadium', 'city', 'time', 'timezone', 'durationMinutes',
  'timing', 'matchFormat', 'visibility', 'createdAt', 'updatedAt', 'completedAt',
  'resultRecordedAt', 'archivedAt', 'originId', 'source', 'details', 'playerContributions',
  'personalPerformance',
]);
const PROFILE_FIELDS = new Set(['id', 'firstName', 'lastName']);
const STAT_FIELDS = ['possession', 'shots', 'onTarget', 'saves', 'assists', 'passes', 'fouls', 'corners'];
const ASSESSMENT_FIELDS = ['defense', 'awareness', 'movement', 'passing', 'teamwork', 'effort'];
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

class SyncHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function noContentResponse() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertSafeTree(value, depth = 0) {
  if (depth > 16) throw new SyncHttpError(400, 'invalid_payload', 'The sync payload is nested too deeply.');
  if (Array.isArray(value)) {
    if (value.length > 500) throw new SyncHttpError(400, 'invalid_payload', 'The sync payload contains too many items.');
    for (const item of value) assertSafeTree(item, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new SyncHttpError(400, 'invalid_payload', 'The sync payload contains an unsafe property.');
    assertSafeTree(child, depth + 1);
  }
}

function exactKeys(value, allowed, code = 'unexpected_fields') {
  if (!isRecord(value) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new SyncHttpError(400, code, 'The request contains unsupported fields.');
  }
}

function boundedText(value, max, { allowEmpty = true } = {}) {
  return typeof value === 'string'
    && value.length <= max
    && (allowEmpty || value.trim().length > 0)
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function finiteInteger(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseRevision(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!finiteInteger(value, 1, MAX_REVISION)) {
    throw new SyncHttpError(400, 'invalid_revision', 'The expected revision is invalid.');
  }
  return value;
}

function validateStats(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !STAT_FIELDS.includes(key))) return null;
  const output = {};
  for (const key of STAT_FIELDS) {
    if (value[key] === undefined) continue;
    const max = key === 'possession' ? 100 : 999;
    if (!finiteInteger(value[key], 0, max)) return null;
    output[key] = value[key];
  }
  return output;
}

function validateDetails(value) {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'team1' && key !== 'team2')) return null;
  const team1 = validateStats(value.team1);
  const team2 = validateStats(value.team2);
  if (!team1 || !team2) return null;
  if (team1.onTarget !== undefined && team1.shots !== undefined && team1.onTarget > team1.shots) return null;
  if (team2.onTarget !== undefined && team2.shots !== undefined && team2.onTarget > team2.shots) return null;
  return { team1, team2 };
}

function validateContributions(value) {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'team1' && key !== 'team2')) return null;
  const normalizeTeam = (rows) => {
    if (!Array.isArray(rows) || rows.length > 14) return null;
    const result = [];
    for (const row of rows) {
      if (!isRecord(row) || Object.keys(row).some((key) => !['playerName', 'goals', 'assists'].includes(key))
        || !boundedText(row.playerName, 40, { allowEmpty: false })
        || !finiteInteger(row.goals, 0, 99) || !finiteInteger(row.assists, 0, 99)) return null;
      result.push({ playerName: row.playerName.trim(), goals: row.goals, assists: row.assists });
    }
    return result;
  };
  const team1 = normalizeTeam(value.team1);
  const team2 = normalizeTeam(value.team2);
  return team1 && team2 ? { team1, team2 } : null;
}

function validatePerformance(value) {
  if (value === undefined) return undefined;
  const allowed = new Set(['teamSide', 'goals', 'assists', 'minutesPlayed', 'selfAssessment', 'source']);
  if (!isRecord(value) || Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (!['team1', 'team2'].includes(value.teamSide) || value.source !== 'user_reported') return null;
  const nullableScore = (v) => v === null || finiteInteger(v, 0, 99);
  if (!nullableScore(value.goals) || !nullableScore(value.assists)) return null;
  if (value.minutesPlayed !== undefined && value.minutesPlayed !== null && !finiteInteger(value.minutesPlayed, 0, 720)) return null;
  let selfAssessment;
  if (value.selfAssessment !== undefined) {
    if (!isRecord(value.selfAssessment) || Object.keys(value.selfAssessment).some((key) => !ASSESSMENT_FIELDS.includes(key))) return null;
    selfAssessment = {};
    for (const key of ASSESSMENT_FIELDS) {
      if (value.selfAssessment[key] === undefined) continue;
      const score = value.selfAssessment[key];
      if (score !== null && !finiteInteger(score, 1, 5)) return null;
      selfAssessment[key] = score;
    }
  }
  return {
    teamSide: value.teamSide,
    goals: value.goals,
    assists: value.assists,
    ...(value.minutesPlayed !== undefined ? { minutesPlayed: value.minutesPlayed } : {}),
    ...(selfAssessment ? { selfAssessment } : {}),
    source: 'user_reported',
  };
}

function validateTiming(value) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (value.mode === 'continuous') {
    if (Object.keys(value).some((key) => !['mode', 'durationMinutes'].includes(key))
      || !finiteInteger(value.durationMinutes, 1, 720)) return null;
    return { mode: 'continuous', durationMinutes: value.durationMinutes };
  }
  if (value.mode === 'periods') {
    if (Object.keys(value).some((key) => !['mode', 'periodCount', 'periodMinutes', 'breakMinutes'].includes(key))
      || !finiteInteger(value.periodCount, 1, 8)
      || !finiteInteger(value.periodMinutes, 1, 180)
      || !finiteInteger(value.breakMinutes, 0, 60)) return null;
    return { mode: 'periods', periodCount: value.periodCount, periodMinutes: value.periodMinutes, breakMinutes: value.breakMinutes };
  }
  return null;
}

function sanitizeProfile(entityId, value) {
  if (entityId !== 'current') throw new SyncHttpError(400, 'invalid_profile_id', 'The cloud profile identifier must be current.');
  exactKeys(value, PROFILE_FIELDS, 'invalid_profile');
  if (value.id !== 'current'
    || !boundedText(value.firstName, 60)
    || !boundedText(value.lastName, 60)) {
    throw new SyncHttpError(400, 'invalid_profile', 'Only a valid first and last name can be synchronized in the profile record.');
  }
  // Email, phone, verification data, and image data are intentionally not cloud-synced here.
  return { id: 'current', firstName: value.firstName.trim(), lastName: value.lastName.trim() };
}

function sanitizeMatch(entityId, value) {
  exactKeys(value, MATCH_FIELDS, 'invalid_match');
  if (!ID_PATTERN.test(entityId) || value.id !== entityId) {
    throw new SyncHttpError(400, 'invalid_match_id', 'The match identifier is invalid.');
  }
  if (value.source !== undefined && value.source !== 'local') {
    throw new SyncHttpError(400, 'unsupported_match_source', 'Only user-owned local match records can be synchronized.');
  }
  const visibility = value.visibility ?? 'LOCAL';
  if (!MATCH_VISIBILITY.has(visibility)) {
    throw new SyncHttpError(400, 'invalid_match_visibility', 'The match visibility value is invalid.');
  }
  if (visibility === 'PRIVATE') {
    throw new SyncHttpError(403, 'private_match_not_syncable', 'Private matches stay on this device and cannot be synchronized to cloud storage.');
  }
  if (!MATCH_TYPES.has(value.type)
    || !boundedText(value.team1, 80, { allowEmpty: false })
    || !boundedText(value.team2, 80, { allowEmpty: false })
    || !finiteInteger(value.score1, 0, 99)
    || !finiteInteger(value.score2, 0, 99)
    || !MATCH_STATUSES.has(value.status)
    || !boundedText(value.dateLabel, 100, { allowEmpty: false })
    || !finiteInteger(value.dateKey, 1, 99_999_999)
    || !boundedText(value.story, 5000)
    || (value.dateISO !== undefined && !isValidIsoDate(value.dateISO))
    || (value.title !== undefined && !boundedText(value.title, 120))
    || (value.stadium !== undefined && !boundedText(value.stadium, 120))
    || (value.city !== undefined && !boundedText(value.city, 120))
    || (value.time !== undefined && !boundedText(value.time, 32))
    || (value.timezone !== undefined && !boundedText(value.timezone, 80, { allowEmpty: false }))
    || (value.durationMinutes !== undefined && !finiteInteger(value.durationMinutes, 1, 720))
    || (value.matchFormat !== undefined && value.matchFormat !== '5v5' && value.matchFormat !== '7v7')
    || (value.createdAt !== undefined && !finiteInteger(value.createdAt, 0, 9_999_999_999_999))
    || (value.updatedAt !== undefined && !finiteInteger(value.updatedAt, 0, 9_999_999_999_999))
    || (value.completedAt !== undefined && value.completedAt !== null && !finiteInteger(value.completedAt, 0, 9_999_999_999_999))
    || (value.resultRecordedAt !== undefined && value.resultRecordedAt !== null && !finiteInteger(value.resultRecordedAt, 0, 9_999_999_999_999))
    || (value.archivedAt !== undefined && value.archivedAt !== null && !finiteInteger(value.archivedAt, 0, 9_999_999_999_999))
    || (value.originId !== undefined && !boundedText(value.originId, 120, { allowEmpty: false }))) {
    throw new SyncHttpError(400, 'invalid_match', 'The match record contains invalid or unsupported fields.');
  }

  const details = validateDetails(value.details);
  const playerContributions = validateContributions(value.playerContributions);
  const personalPerformance = validatePerformance(value.personalPerformance);
  const timing = validateTiming(value.timing);
  if ((value.details !== undefined && !details)
    || (value.playerContributions !== undefined && !playerContributions)
    || (value.personalPerformance !== undefined && !personalPerformance)
    || (value.timing !== undefined && !timing)) {
    throw new SyncHttpError(400, 'invalid_match_details', 'The match statistics, timing, or player contribution data is invalid.');
  }
  if (personalPerformance) {
    const ownScore = personalPerformance.teamSide === 'team1' ? value.score1 : value.score2;
    if ((personalPerformance.goals !== null && personalPerformance.goals > ownScore)
      || (personalPerformance.assists !== null && personalPerformance.assists > ownScore)
      || (personalPerformance.goals !== null && personalPerformance.assists !== null
        && personalPerformance.goals + personalPerformance.assists > ownScore)) {
      throw new SyncHttpError(400, 'invalid_personal_performance', 'Personal goals and assists cannot exceed the recorded team score.');
    }
  }

  const output = {
    id: entityId,
    type: value.type,
    team1: value.team1.trim(),
    team2: value.team2.trim(),
    score1: value.score1,
    score2: value.score2,
    status: value.status,
    dateLabel: value.dateLabel,
    dateKey: value.dateKey,
    story: value.story,
    visibility,
    source: 'local',
    ...(value.dateISO !== undefined ? { dateISO: value.dateISO } : {}),
    ...(value.title !== undefined ? { title: value.title } : {}),
    ...(value.stadium !== undefined ? { stadium: value.stadium } : {}),
    ...(value.city !== undefined ? { city: value.city } : {}),
    ...(value.time !== undefined ? { time: value.time } : {}),
    ...(value.timezone !== undefined ? { timezone: value.timezone } : {}),
    ...(value.durationMinutes !== undefined ? { durationMinutes: value.durationMinutes } : {}),
    ...(timing ? { timing } : {}),
    ...(value.matchFormat !== undefined ? { matchFormat: value.matchFormat } : {}),
    ...(value.createdAt !== undefined ? { createdAt: value.createdAt } : {}),
    ...(value.updatedAt !== undefined ? { updatedAt: value.updatedAt } : {}),
    ...(value.completedAt !== undefined ? { completedAt: value.completedAt } : {}),
    ...(value.resultRecordedAt !== undefined ? { resultRecordedAt: value.resultRecordedAt } : {}),
    ...(value.archivedAt !== undefined ? { archivedAt: value.archivedAt } : {}),
    ...(value.originId !== undefined ? { originId: value.originId } : {}),
    ...(details ? { details } : {}),
    ...(playerContributions ? { playerContributions } : {}),
    ...(personalPerformance ? { personalPerformance } : {}),
  };
  if (new TextEncoder().encode(JSON.stringify(output)).byteLength > MAX_RECORD_BYTES) {
    throw new SyncHttpError(413, 'record_too_large', 'A synchronized record may not exceed 64 KiB.');
  }
  return output;
}

function normalizeOperation(input) {
  exactKeys(input, new Set(['operationId', 'entityType', 'entityId', 'operation', 'expectedRevision', 'payload']), 'invalid_operation');
  if (typeof input.operationId !== 'string' || !OPERATION_ID_PATTERN.test(input.operationId)) {
    throw new SyncHttpError(400, 'invalid_operation_id', 'The sync operation identifier is invalid.');
  }
  if (input.entityType !== 'profile' && input.entityType !== 'match') {
    throw new SyncHttpError(400, 'invalid_entity_type', 'Only profile and match records are supported by this sync phase.');
  }
  if (typeof input.entityId !== 'string' || !ID_PATTERN.test(input.entityId)) {
    throw new SyncHttpError(400, 'invalid_entity_id', 'The synchronized entity identifier is invalid.');
  }
  if (input.operation !== 'upsert' && input.operation !== 'delete') {
    throw new SyncHttpError(400, 'invalid_operation', 'The sync operation must be upsert or delete.');
  }
  const expectedRevision = parseRevision(input.expectedRevision, { nullable: input.operation === 'upsert' });
  if (input.operation === 'delete' && expectedRevision === null) {
    throw new SyncHttpError(400, 'invalid_revision', 'Delete operations require an expected revision.');
  }
  if (input.operation === 'delete') {
    if (Object.prototype.hasOwnProperty.call(input, 'payload')) {
      throw new SyncHttpError(400, 'unexpected_fields', 'Delete operations must not include a payload.');
    }
    return {
      operationId: input.operationId,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: 'delete',
      expectedRevision,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(input, 'payload')) {
    throw new SyncHttpError(400, 'missing_payload', 'Upsert operations require a record payload.');
  }
  const payload = input.entityType === 'profile'
    ? sanitizeProfile(input.entityId, input.payload)
    : sanitizeMatch(input.entityId, input.payload);
  return {
    operationId: input.operationId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: 'upsert',
    expectedRevision,
    payload,
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new SyncHttpError(503, 'crypto_unavailable', 'Secure sync operation hashing is unavailable.');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readBoundedJson(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new SyncHttpError(415, 'json_required', 'Content-Type must be application/json.');
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new SyncHttpError(413, 'request_too_large', 'The sync request exceeds the 512 KiB limit.');
  }
  if (!request.body) throw new SyncHttpError(400, 'invalid_json', 'A JSON request body is required.');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new SyncHttpError(413, 'request_too_large', 'The sync request exceeds the 512 KiB limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    assertSafeTree(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof SyncHttpError) throw error;
    throw new SyncHttpError(400, 'invalid_json', 'The request body is not valid UTF-8 JSON.');
  }
}

function requireD1(env) {
  if (!env?.TAAMEN_DB || typeof env.TAAMEN_DB.prepare !== 'function' || typeof env.TAAMEN_DB.batch !== 'function') {
    throw new SyncHttpError(503, 'storage_unavailable', 'Cloud sync storage is not configured for this environment.');
  }
  return env.TAAMEN_DB;
}

function rowsOf(result) {
  if (Array.isArray(result?.results)) return result.results;
  if (Array.isArray(result)) return result;
  return [];
}

async function findOperation(db, userId, operationId) {
  return db.prepare(`
    SELECT request_hash, result_json
      FROM sync_operations
     WHERE user_id = ? AND operation_id = ?
     LIMIT 1
  `).bind(userId, operationId).first();
}

async function resultForOperation(db, userId, operationId, requestHash) {
  const row = await findOperation(db, userId, operationId);
  if (!row) return null;
  if (row.request_hash !== requestHash) {
    throw new SyncHttpError(409, 'idempotency_key_reused', 'This operation ID was already used for a different request.');
  }
  if (typeof row.result_json !== 'string') {
    throw new SyncHttpError(409, 'operation_in_progress', 'This sync operation is still being processed. Retry with the same operation ID.');
  }
  let result;
  try { result = JSON.parse(row.result_json); }
  catch { throw new SyncHttpError(500, 'operation_result_corrupt', 'The stored sync operation result is invalid.'); }
  if (result.status === 'applied') {
    const change = await db.prepare(`
      SELECT cursor FROM sync_changes WHERE user_id = ? AND operation_id = ? LIMIT 1
    `).bind(userId, operationId).first();
    if (change && Number.isSafeInteger(change.cursor)) result.cursor = change.cursor;
  }
  return { ...result, replayed: true };
}

async function applyOperation(db, userId, operation, now) {
  const canonical = stableStringify(operation);
  const requestHash = await sha256(canonical);
  const prior = await resultForOperation(db, userId, operation.operationId, requestHash);
  if (prior) return prior;

  // Keep late retries safe even after the 30-day idempotency metadata window expires.
  const lastWrite = await db.prepare(`
    SELECT last_operation_hash, revision, deleted_at
      FROM sync_records
     WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND last_operation_id = ?
     LIMIT 1
  `).bind(userId, operation.entityType, operation.entityId, operation.operationId).first();
  if (lastWrite) {
    if (lastWrite.last_operation_hash !== requestHash) {
      throw new SyncHttpError(409, 'idempotency_key_reused', 'This operation ID was already used for a different request.');
    }
    const result = {
      status: 'applied', operationId: operation.operationId,
      entityType: operation.entityType, entityId: operation.entityId,
      revision: Number(lastWrite.revision), deletedAt: lastWrite.deleted_at ?? null, replayed: true,
    };
    const change = await db.prepare(`SELECT cursor FROM sync_changes WHERE user_id = ? AND entity_type = ? AND entity_id = ? LIMIT 1`)
      .bind(userId, operation.entityType, operation.entityId).first();
    if (change && Number.isSafeInteger(change.cursor)) result.cursor = change.cursor;
    return result;
  }

  const timestamp = now.toISOString();
  if (operation.expectedRevision === MAX_REVISION) {
    throw new SyncHttpError(409, 'revision_exhausted', 'The record revision has reached its supported maximum.');
  }
  const nextRevision = operation.expectedRevision !== null ? operation.expectedRevision + 1 : 1;
  const successResult = JSON.stringify({
    status: 'applied',
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    revision: nextRevision,
    deletedAt: operation.operation === 'delete' ? timestamp : null,
  });
  const conflictResult = JSON.stringify({
    status: 'conflict',
    code: 'revision_conflict',
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    expectedRevision: operation.expectedRevision,
  });

  const statements = [
    db.prepare(`
      INSERT INTO sync_operations (user_id, operation_id, request_hash, result_json, created_at)
      VALUES (?, ?, ?, NULL, ?)
      ON CONFLICT(user_id, operation_id) DO NOTHING
    `).bind(userId, operation.operationId, requestHash, timestamp),
  ];

  if (operation.operation === 'upsert' && operation.expectedRevision === null) {
    statements.push(db.prepare(`
      INSERT INTO sync_records (
        user_id, entity_type, entity_id, payload_json, revision, last_operation_id, last_operation_hash, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, NULL)
      ON CONFLICT(user_id, entity_type, entity_id) DO NOTHING
    `).bind(userId, operation.entityType, operation.entityId, JSON.stringify(operation.payload), operation.operationId, requestHash, timestamp, timestamp));
  } else if (operation.operation === 'upsert') {
    statements.push(db.prepare(`
      UPDATE sync_records
         SET payload_json = ?, revision = revision + 1, updated_at = ?, deleted_at = NULL, last_operation_id = ?, last_operation_hash = ?
       WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND revision = ?
         AND EXISTS (SELECT 1 FROM sync_operations WHERE user_id = ? AND operation_id = ? AND request_hash = ? AND result_json IS NULL)
    `).bind(JSON.stringify(operation.payload), timestamp, operation.operationId, requestHash, userId, operation.entityType, operation.entityId, operation.expectedRevision, userId, operation.operationId, requestHash));
  } else {
    statements.push(db.prepare(`
      UPDATE sync_records
         SET payload_json = ?, revision = revision + 1, updated_at = ?, deleted_at = ?, last_operation_id = ?, last_operation_hash = ?
       WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND revision = ? AND deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM sync_operations WHERE user_id = ? AND operation_id = ? AND request_hash = ? AND result_json IS NULL)
    `).bind(JSON.stringify({ id: operation.entityId }), timestamp, timestamp, operation.operationId, requestHash, userId, operation.entityType, operation.entityId, operation.expectedRevision, userId, operation.operationId, requestHash));
  }

  // Advance the per-account cursor only if the revision write actually succeeded.
  statements.push(db.prepare(`
    INSERT INTO sync_cursor_state (user_id, last_cursor)
    SELECT ?, 1
     WHERE EXISTS (
       SELECT 1 FROM sync_records
        WHERE user_id = ? AND entity_type = ? AND entity_id = ?
          AND revision = ? AND updated_at = ? AND last_operation_id = ? AND last_operation_hash = ?
          AND ${operation.operation === 'delete' ? 'deleted_at = ?' : 'deleted_at IS NULL'}
     )
       AND EXISTS (
         SELECT 1 FROM sync_operations
          WHERE user_id = ? AND operation_id = ? AND request_hash = ? AND result_json IS NULL
       )
    ON CONFLICT(user_id) DO UPDATE SET last_cursor = sync_cursor_state.last_cursor + 1
  `).bind(
    userId, userId, operation.entityType, operation.entityId, nextRevision, timestamp,
    operation.operationId, requestHash,
    ...(operation.operation === 'delete' ? [timestamp] : []),
    userId, operation.operationId, requestHash,
  ));

  statements.push(db.prepare(`
    INSERT INTO sync_changes (
      user_id, cursor, operation_id, entity_type, entity_id, revision, operation, changed_at
    )
    SELECT ?, last_cursor, ?, ?, ?, ?, ?, ?
      FROM sync_cursor_state
     WHERE user_id = ?
       AND EXISTS (
         SELECT 1 FROM sync_records
          WHERE user_id = ? AND entity_type = ? AND entity_id = ?
            AND revision = ? AND updated_at = ? AND last_operation_id = ? AND last_operation_hash = ?
            AND ${operation.operation === 'delete' ? 'deleted_at = ?' : 'deleted_at IS NULL'}
       )
       AND EXISTS (
         SELECT 1 FROM sync_operations
          WHERE user_id = ? AND operation_id = ? AND request_hash = ? AND result_json IS NULL
       )
    ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
      cursor = excluded.cursor,
      operation_id = excluded.operation_id,
      revision = excluded.revision,
      operation = excluded.operation,
      changed_at = excluded.changed_at
  `).bind(
    userId, operation.operationId, operation.entityType, operation.entityId, nextRevision, operation.operation, timestamp,
    userId, userId, operation.entityType, operation.entityId, nextRevision, timestamp, operation.operationId, requestHash,
    ...(operation.operation === 'delete' ? [timestamp] : []),
    userId, operation.operationId, requestHash,
  ));

  statements.push(db.prepare(`
    UPDATE sync_operations
       SET result_json = CASE
         WHEN EXISTS (SELECT 1 FROM sync_changes WHERE user_id = ? AND operation_id = ?) THEN ?
         ELSE ?
       END
     WHERE user_id = ? AND operation_id = ? AND result_json IS NULL
  `).bind(userId, operation.operationId, successResult, conflictResult, userId, operation.operationId));

  try {
    await db.batch(statements);
  } catch (error) {
    // Concurrent retries may race on the idempotency key. Resolve the committed result if present.
    const raced = await resultForOperation(db, userId, operation.operationId, requestHash);
    if (raced) return raced;
    throw error;
  }

  const result = await resultForOperation(db, userId, operation.operationId, requestHash);
  if (!result) throw new SyncHttpError(503, 'operation_unconfirmed', 'The sync operation could not be confirmed. Retry with the same operation ID.');
  return { ...result, replayed: false };
}

function validatePullQuery(url) {
  const allowed = new Set(['cursor', 'limit']);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))
    || url.searchParams.getAll('cursor').length > 1 || url.searchParams.getAll('limit').length > 1) {
    throw new SyncHttpError(400, 'invalid_query', 'The sync pull query contains unsupported parameters.');
  }
  const rawCursor = url.searchParams.get('cursor') ?? '0';
  const rawLimit = url.searchParams.get('limit') ?? '100';
  if (!/^\d{1,16}$/.test(rawCursor) || !/^\d{1,3}$/.test(rawLimit)) {
    throw new SyncHttpError(400, 'invalid_query', 'The sync cursor or page limit is invalid.');
  }
  const cursor = Number(rawCursor);
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_PULL_LIMIT) {
    throw new SyncHttpError(400, 'invalid_query', 'The sync cursor or page limit is outside the supported range.');
  }
  return { cursor, limit };
}

async function enforceAccountRateLimit(db, userId, now) {
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const row = await db.prepare(`
    INSERT INTO sync_rate_limits (user_id, window_start, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id) DO UPDATE SET
      request_count = CASE
        WHEN sync_rate_limits.window_start = excluded.window_start THEN sync_rate_limits.request_count + 1
        ELSE 1
      END,
      window_start = excluded.window_start
    WHERE sync_rate_limits.window_start <> excluded.window_start
       OR sync_rate_limits.request_count < 60
    RETURNING request_count
  `).bind(userId, minuteBucket).first();
  if (!row) throw new SyncHttpError(429, 'sync_rate_limited', 'Too many synchronization requests. Retry after the current minute.');
}

async function pullChanges(db, userId, cursor, limit, now) {
  const latest = await db.prepare('SELECT last_cursor FROM sync_cursor_state WHERE user_id = ? LIMIT 1').bind(userId).first();
  const latestCursor = Number(latest?.last_cursor ?? 0);
  if (cursor > latestCursor) {
    throw new SyncHttpError(409, 'cursor_ahead', 'The sync cursor is ahead of the latest server cursor. Reset the local cursor and perform a full pull.');
  }
  const result = await db.prepare(`
    SELECT c.cursor, c.entity_type, c.entity_id, c.revision AS event_revision,
           c.operation AS event_operation, c.changed_at,
           r.payload_json, r.revision AS current_revision, r.updated_at AS record_updated_at,
           r.deleted_at
      FROM sync_changes c
      JOIN sync_records r
        ON r.user_id = c.user_id AND r.entity_type = c.entity_type AND r.entity_id = c.entity_id
     WHERE c.user_id = ? AND c.cursor > ?
     ORDER BY c.cursor ASC
     LIMIT ?
  `).bind(userId, cursor, limit + 1).all();
  const rows = rowsOf(result);
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const nextCursor = pageRows.length ? Number(pageRows[pageRows.length - 1].cursor) : cursor;
  const latestByEntity = new Map();
  for (const row of pageRows) {
    const key = `${row.entity_type}:${row.entity_id}`;
    latestByEntity.set(key, row);
  }
  const changes = [...latestByEntity.values()]
    .sort((a, b) => Number(a.cursor) - Number(b.cursor))
    .map((row) => {
      const deleted = row.deleted_at !== null && row.deleted_at !== undefined;
      let payload;
      if (!deleted) {
        try { payload = JSON.parse(row.payload_json); }
        catch { throw new SyncHttpError(500, 'stored_record_corrupt', 'A synchronized record could not be decoded.'); }
      }
      return {
        cursor: Number(row.cursor),
        entityType: row.entity_type,
        entityId: row.entity_id,
        revision: Number(row.current_revision),
        operation: deleted ? 'delete' : 'upsert',
        changedAt: row.changed_at,
        updatedAt: row.record_updated_at,
        ...(deleted ? { deletedAt: row.deleted_at } : { payload }),
      };
    });
  return { changes, nextCursor, hasMore, serverTime: now.toISOString() };
}

function verifyRequestSecurity(request, url, method) {
  const origin = request.headers.get('origin');
  if (method !== 'GET' && !origin) {
    throw new SyncHttpError(403, 'origin_required', 'A same-origin Origin header is required for synchronization writes.');
  }
  if (origin && origin !== url.origin) {
    throw new SyncHttpError(403, 'origin_rejected', 'Cross-origin requests are not allowed.');
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
    throw new SyncHttpError(403, 'origin_rejected', 'Cross-site requests are not allowed.');
  }
  if (method !== 'GET' && request.headers.get(EXPECTED_HEADER) !== '1') {
    throw new SyncHttpError(403, 'csrf_header_required', 'The required same-origin request header is missing.');
  }
}

export function createSyncEngineHandler({
  resolveUser = async () => null,
  clock = () => new Date(),
  requireCloudSyncEnabled = false,
} = {}) {
  return async function handleSyncEngine(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/sync/push' && url.pathname !== '/api/sync/pull') {
      return jsonResponse(404, { error: 'Not found.', code: 'not_found' });
    }
    const method = request.method.toUpperCase();
    if (method === 'OPTIONS') return noContentResponse();
    if ((url.pathname.endsWith('/push') && method !== 'POST') || (url.pathname.endsWith('/pull') && method !== 'GET')) {
      return jsonResponse(405, { error: 'Method not allowed.', code: 'method_not_allowed' });
    }

    try {
      verifyRequestSecurity(request, url, method);
      const user = await resolveUser(request, env);
      if (!user || typeof user.id !== 'string' || !user.id.trim() || user.id.length > 120) {
        throw new SyncHttpError(401, 'not_authenticated', 'A verified cloud account is required for synchronization.');
      }
      if (user.status !== 'active') {
        throw new SyncHttpError(403, 'account_disabled', 'This cloud account is not active.');
      }
      if (requireCloudSyncEnabled && user.cloudSyncEnabled !== true) {
        throw new SyncHttpError(403, 'cloud_sync_not_enabled', 'Cloud match synchronization is not enabled for this account yet.');
      }
      const db = requireD1(env);
      const account = await db.prepare('SELECT id, status FROM users WHERE id = ? LIMIT 1').bind(user.id).first();
      if (!account || account.status !== 'active') {
        throw new SyncHttpError(403, 'account_not_ready', 'The verified cloud account is not provisioned for synchronization.');
      }
      const now = clock();
      await enforceAccountRateLimit(db, user.id, now);

      if (url.pathname === '/api/sync/pull') {
        const { cursor, limit } = validatePullQuery(url);
        return jsonResponse(200, await pullChanges(db, user.id, cursor, limit, now));
      }

      const body = await readBoundedJson(request);
      exactKeys(body, new Set(['operations']), 'invalid_request');
      if (!Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > MAX_OPERATIONS_PER_REQUEST) {
        throw new SyncHttpError(400, 'invalid_operations', `A sync push must contain between 1 and ${MAX_OPERATIONS_PER_REQUEST} operations.`);
      }
      const operations = body.operations.map(normalizeOperation);
      const retentionCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await db.prepare('DELETE FROM sync_operations WHERE user_id = ? AND created_at < ?')
        .bind(user.id, retentionCutoff).run();
      const seen = new Set();
      for (const operation of operations) {
        if (seen.has(operation.operationId)) throw new SyncHttpError(400, 'duplicate_operation_id', 'A push request cannot repeat an operation ID.');
        seen.add(operation.operationId);
      }
      const results = [];
      for (const operation of operations) results.push(await applyOperation(db, user.id, operation, now));
      return jsonResponse(200, { results, serverTime: now.toISOString() });
    } catch (error) {
      if (error instanceof SyncHttpError) {
        return jsonResponse(error.status, { error: error.message, code: error.code });
      }
      console.error('[taamen] cloud sync request failed:', error?.message || 'unknown error');
      return jsonResponse(500, { error: 'The synchronization request could not be completed.', code: 'internal_error' });
    }
  };
}

import { resolveAuthenticatedCloudUser } from './planIdentity.js';
// V19 records a future sync preference but keeps actual match/profile sync disabled until V20 migration UX is ready.
export const handleSyncEngine = createSyncEngineHandler({ resolveUser: resolveAuthenticatedCloudUser, requireCloudSyncEnabled: true });

export const CLOUD_SYNC_LIMITS = Object.freeze({
  maxRequestBytes: MAX_REQUEST_BYTES,
  maxOperationsPerRequest: MAX_OPERATIONS_PER_REQUEST,
  maxRecordBytes: MAX_RECORD_BYTES,
  maxPullLimit: MAX_PULL_LIMIT,
});
