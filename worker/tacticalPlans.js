const MAX_PLAN_BYTES = 256 * 1024;
const MAX_REQUEST_BYTES = MAX_PLAN_BYTES + 4096;
const MAX_DRAWINGS = 250;
const MAX_POINTS_PER_DRAWING = 800;
const MAX_TOTAL_POINTS = 50_000;
const FORMATIONS = Object.freeze({
  '5v5': new Set(['1-2-1', '1-1-2', '2-1-1', '3-1', '2-2']),
  '7v7': new Set(['2-3-1', '3-2-1', '2-2-2', '3-1-2', '4-1-1', '2-1-3']),
});
const STYLE_BY_KIND = Object.freeze({
  pass: 'pass-solid-white',
  run: 'run-dash-yellow',
  press: 'press-dot-pink',
  curve: 'curve-solid-violet',
  multiCurve: 'multi-curve-dash-cyan',
  zone: 'zone-fill-amber',
});
const DRAWING_KINDS = new Set(Object.keys(STYLE_BY_KIND));
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const PLAN_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const EXPECTED_HEADER = 'x-taamen-requested';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
};

class PlanHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function noContentResponse(status = 204) {
  return new Response(null, { status, headers: JSON_HEADERS });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasUnsafeKeys(value, depth = 0) {
  if (depth > 20) return true;
  if (Array.isArray(value)) return value.some((item) => hasUnsafeKeys(item, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.has(key) || hasUnsafeKeys(child, depth + 1));
}

function boundedText(value, max, { allowEmpty = true } = {}) {
  return typeof value === 'string'
    && value.length <= max
    && (allowEmpty || value.trim().length > 0)
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validDate(value) {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function validatePoint(value) {
  return isRecord(value) && inRange(value.x, 0, 1) && inRange(value.y, 0, 1);
}

function validatePlanDocument(input, { id, title, now, createdAt } = {}) {
  if (!isRecord(input) || hasUnsafeKeys(input)) {
    throw new PlanHttpError(400, 'invalid_plan', 'The tactical plan document is invalid.');
  }
  if (input.format !== 'taamen-tactical-plan' || input.schemaVersion !== 1) {
    throw new PlanHttpError(400, 'unsupported_schema', 'Only TAAMEN Tactical Plan Schema v1 is supported.');
  }
  if (!boundedText(input.id, 120, { allowEmpty: false }) || !isRecord(input.metadata) || !isRecord(input.pitch)) {
    throw new PlanHttpError(400, 'invalid_plan', 'The tactical plan metadata is invalid.');
  }

  const sourceMetadata = input.metadata;
  const format = sourceMetadata.gameFormat;
  if (format !== '5v5' && format !== '7v7') {
    throw new PlanHttpError(400, 'invalid_format', 'Plan format must be 5v5 or 7v7.');
  }
  const rawTitle = title === undefined ? sourceMetadata.title : title;
  const cleanTitle = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (!boundedText(cleanTitle, 70, { allowEmpty: false })) {
    throw new PlanHttpError(400, 'invalid_title', 'Plan title must contain 1–70 characters.');
  }
  if (!boundedText(sourceMetadata.notes, 1000)) {
    throw new PlanHttpError(400, 'invalid_plan', 'Plan notes exceed the supported limit.');
  }
  if (!boundedText(sourceMetadata.formation, 20, { allowEmpty: false }) || !FORMATIONS[format].has(sourceMetadata.formation)) {
    throw new PlanHttpError(400, 'invalid_formation', 'The selected formation is not supported for this format.');
  }
  if (!validDate(sourceMetadata.createdAt) || !validDate(sourceMetadata.updatedAt)) {
    throw new PlanHttpError(400, 'invalid_plan', 'Plan timestamps must be valid ISO-compatible dates.');
  }

  const pitch = input.pitch;
  if (pitch.coordinateSystem !== 'normalized-0-1' || pitch.width !== 1 || pitch.height !== 1
    || pitch.orientation !== 'landscape' || pitch.attackDirection !== 'unspecified') {
    throw new PlanHttpError(400, 'invalid_pitch', 'The tactical pitch metadata is not supported.');
  }
  if (!Array.isArray(input.layerOrder) || input.layerOrder.length !== 2
    || input.layerOrder[0] !== 'drawings' || input.layerOrder[1] !== 'players') {
    throw new PlanHttpError(400, 'invalid_layer_order', 'The tactical layer order is invalid.');
  }

  const teamSize = format === '5v5' ? 5 : 7;
  if (!Array.isArray(input.players) || input.players.length !== teamSize * 2) {
    throw new PlanHttpError(400, 'invalid_players', `A ${format} plan must contain exactly ${teamSize} players per team.`);
  }
  const playerIds = new Set();
  const shirtNumbers = { home: new Set(), away: new Set() };
  const teamCounts = { home: 0, away: 0 };
  const players = input.players.map((player) => {
    if (!isRecord(player)
      || !boundedText(player.id, 120, { allowEmpty: false })
      || (player.team !== 'home' && player.team !== 'away')
      || !Number.isInteger(player.number) || !inRange(player.number, 1, 99)
      || !boundedText(player.name, 28)
      || !validatePoint(player.position)) {
      throw new PlanHttpError(400, 'invalid_players', 'One or more players contain invalid fields.');
    }
    if (playerIds.has(player.id) || shirtNumbers[player.team].has(player.number)) {
      throw new PlanHttpError(400, 'duplicate_player', 'Player IDs and shirt numbers must be unique within their scope.');
    }
    playerIds.add(player.id);
    shirtNumbers[player.team].add(player.number);
    teamCounts[player.team] += 1;
    return {
      id: player.id,
      team: player.team,
      number: player.number,
      name: player.name,
      position: { x: player.position.x, y: player.position.y },
    };
  });
  if (teamCounts.home !== teamSize || teamCounts.away !== teamSize) {
    throw new PlanHttpError(400, 'invalid_players', `A ${format} plan must contain ${teamSize} home and ${teamSize} away players.`);
  }

  if (!Array.isArray(input.drawings) || input.drawings.length > MAX_DRAWINGS) {
    throw new PlanHttpError(400, 'invalid_drawings', `A plan may contain at most ${MAX_DRAWINGS} drawings.`);
  }
  const drawingIds = new Set();
  let totalPoints = 0;
  const drawings = input.drawings.map((drawing) => {
    if (!isRecord(drawing)
      || !boundedText(drawing.id, 120, { allowEmpty: false })
      || !DRAWING_KINDS.has(drawing.kind)
      || drawing.styleToken !== STYLE_BY_KIND[drawing.kind]
      || !validatePoint(drawing.start)
      || !validatePoint(drawing.end)) {
      throw new PlanHttpError(400, 'invalid_drawings', 'One or more drawings contain invalid fields.');
    }
    if (drawingIds.has(drawing.id)) {
      throw new PlanHttpError(400, 'duplicate_drawing', 'Drawing IDs must be unique within a plan.');
    }
    drawingIds.add(drawing.id);
    let points;
    if (drawing.points !== undefined) {
      if (!Array.isArray(drawing.points) || drawing.points.length > MAX_POINTS_PER_DRAWING
        || !drawing.points.every(validatePoint)) {
        throw new PlanHttpError(400, 'invalid_geometry', 'Drawing geometry contains invalid or excessive points.');
      }
      totalPoints += drawing.points.length;
      if (totalPoints > MAX_TOTAL_POINTS) {
        throw new PlanHttpError(400, 'invalid_geometry', 'The plan contains too many drawing points.');
      }
      points = drawing.points.map((point) => ({ x: point.x, y: point.y }));
    }
    if (drawing.kind === 'curve' && (!points || points.length !== 3)) {
      throw new PlanHttpError(400, 'invalid_curve', 'A curve must contain exactly three control points.');
    }
    if (drawing.kind === 'multiCurve' && (!points || points.length < 2)) {
      throw new PlanHttpError(400, 'invalid_curve', 'A multi-curve must contain at least two points.');
    }
    return {
      id: drawing.id,
      kind: drawing.kind,
      styleToken: drawing.styleToken,
      start: { x: drawing.start.x, y: drawing.start.y },
      end: { x: drawing.end.x, y: drawing.end.y },
      ...(points ? { points } : {}),
    };
  });

  const document = {
    format: 'taamen-tactical-plan',
    schemaVersion: 1,
    id: id ?? input.id,
    metadata: {
      title: cleanTitle,
      notes: sourceMetadata.notes,
      gameFormat: format,
      formation: sourceMetadata.formation,
      createdAt: createdAt ?? sourceMetadata.createdAt,
      updatedAt: now ?? sourceMetadata.updatedAt,
    },
    pitch: {
      coordinateSystem: 'normalized-0-1',
      width: 1,
      height: 1,
      orientation: 'landscape',
      attackDirection: 'unspecified',
    },
    players,
    drawings,
    layerOrder: ['drawings', 'players'],
  };

  const serialized = JSON.stringify(document);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PLAN_BYTES) {
    throw new PlanHttpError(413, 'plan_too_large', 'A tactical plan may not exceed 256 KiB.');
  }
  return document;
}

function parseRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new PlanHttpError(400, 'invalid_revision', 'A valid expectedRevision is required.');
  }
  return value;
}

function validateFormat(value) {
  if (value !== '5v5' && value !== '7v7') {
    throw new PlanHttpError(400, 'invalid_format', 'Plan format must be 5v5 or 7v7.');
  }
  return value;
}

function validatePlanId(value) {
  if (typeof value !== 'string' || !PLAN_ID_PATTERN.test(value)) {
    throw new PlanHttpError(400, 'invalid_id', 'Plan ID is invalid.');
  }
  return value;
}

function assertOnlyKeys(body, allowed) {
  const keys = Object.keys(body);
  if (keys.some((key) => !allowed.has(key))) {
    throw new PlanHttpError(400, 'unexpected_fields', 'The request contains unsupported fields.');
  }
}

async function readJsonBody(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new PlanHttpError(413, 'request_too_large', 'The plan request exceeds the 260 KiB request limit.');
  }
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    throw new PlanHttpError(415, 'json_required', 'Content-Type must be application/json.');
  }
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new PlanHttpError(413, 'request_too_large', 'The plan request exceeds the 260 KiB request limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new PlanHttpError(400, 'invalid_json', 'The plan request must contain valid UTF-8 JSON.');
  }
  if (!isRecord(body) || hasUnsafeKeys(body)) {
    throw new PlanHttpError(400, 'invalid_body', 'The plan request must be a plain JSON object.');
  }
  return body;
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

async function selectOwnedPlan(db, id, userId, format) {
  return db.prepare(`
    SELECT id, user_id, format, slot_number, title, schema_version,
           payload_json, revision, created_at, updated_at, deleted_at
      FROM tactical_plans
     WHERE id = ? AND user_id = ? AND format = ? AND deleted_at IS NULL
     LIMIT 1
  `).bind(id, userId, format).first();
}

function rowToEntry(row) {
  if (!row) throw new PlanHttpError(500, 'storage_corrupt', 'A stored tactical plan could not be read.');
  let stored;
  try {
    stored = JSON.parse(row.payload_json);
  } catch {
    throw new PlanHttpError(500, 'storage_corrupt', 'A stored tactical plan contains invalid JSON.');
  }
  if (!isRecord(stored?.metadata)
    || stored.id !== row.id
    || stored.schemaVersion !== row.schema_version
    || stored.metadata.title !== row.title
    || stored.metadata.gameFormat !== row.format
    || stored.metadata.createdAt !== row.created_at
    || stored.metadata.updatedAt !== row.updated_at) {
    throw new PlanHttpError(500, 'storage_corrupt', 'Stored plan metadata does not match its indexed fields.');
  }
  const document = validatePlanDocument(stored);
  if (document.metadata.gameFormat !== row.format) {
    throw new PlanHttpError(500, 'storage_corrupt', 'Stored plan format does not match its indexed fields.');
  }
  if (!Number.isInteger(row.slot_number) || row.slot_number < 1 || row.slot_number > 5
    || !Number.isInteger(row.revision) || row.revision < 1) {
    throw new PlanHttpError(500, 'storage_corrupt', 'Stored plan revision or slot is invalid.');
  }
  return {
    id: row.id,
    gameFormat: row.format,
    slotNumber: row.slot_number,
    title: row.title,
    formation: document.metadata.formation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    document,
  };
}

async function requireD1(env) {
  const db = env?.TAAMEN_DB;
  if (!db || typeof db.prepare !== 'function') {
    throw new PlanHttpError(503, 'd1_unavailable', 'The tactical plan database is not configured for this environment.');
  }
  return db;
}

async function listPlans(db, userId, format) {
  const result = await db.prepare(`
    SELECT id, user_id, format, slot_number, title, schema_version,
           payload_json, revision, created_at, updated_at, deleted_at
      FROM tactical_plans
     WHERE user_id = ? AND format = ? AND deleted_at IS NULL
     ORDER BY slot_number ASC
     LIMIT 5
  `).bind(userId, format).all();
  return rowsOf(result).map(rowToEntry);
}

async function createPlan(db, userId, body, now, createId) {
  assertOnlyKeys(body, new Set(['title', 'document', 'slotNumber']));
  const hasRequestedSlot = Object.hasOwn(body, 'slotNumber');
  const requestedSlot = hasRequestedSlot ? body.slotNumber : null;
  if (hasRequestedSlot && (!Number.isInteger(requestedSlot) || requestedSlot < 1 || requestedSlot > 5)) {
    throw new PlanHttpError(400, 'invalid_slot', 'The selected plan slot must be an integer from 1 to 5.');
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const createdAt = now.toISOString();
  const id = createId();
  validatePlanId(id);
  const document = validatePlanDocument(body.document, { id, title, now: createdAt, createdAt });
  const format = document.metadata.gameFormat;
  const sql = `
    INSERT INTO tactical_plans (
      id, user_id, format, slot_number, title, schema_version,
      payload_json, revision, created_at, updated_at
    )
    SELECT ?, ?, ?, candidate.slot_number, ?, 1, ?, 1, ?, ?
      FROM (
        SELECT 1 AS slot_number UNION ALL SELECT 2 UNION ALL SELECT 3
        UNION ALL SELECT 4 UNION ALL SELECT 5
      ) AS candidate
     WHERE (? IS NULL OR candidate.slot_number = ?)
       AND NOT EXISTS (
       SELECT 1 FROM tactical_plans existing
        WHERE existing.user_id = ? AND existing.format = ?
          AND existing.slot_number = candidate.slot_number AND existing.deleted_at IS NULL
     )
     ORDER BY candidate.slot_number ASC
     LIMIT 1
    RETURNING id, user_id, format, slot_number, title, schema_version,
              payload_json, revision, created_at, updated_at, deleted_at
  `;
  let result;
  try {
    result = await db.prepare(sql).bind(
      id, userId, format, title, JSON.stringify(document), createdAt, createdAt, requestedSlot, requestedSlot, userId, format,
    ).all();
  } catch (error) {
    // The partial unique index is the final concurrency guard if two writes race
    // for the same free slot. Convert that constraint race into a retryable 409.
    if (/unique constraint failed: tactical_plans\.user_id, tactical_plans\.format, tactical_plans\.slot_number/i.test(error?.message || '')) {
      throw new PlanHttpError(409, 'capacity_race', `A ${format} slot was claimed by another request. Refresh the library and retry.`);
    }
    throw error;
  }
  const row = rowsOf(result)[0];
  if (!row) {
    if (requestedSlot !== null) throw new PlanHttpError(409, 'slot_occupied', `The selected ${format} slot is already occupied.`);
    throw new PlanHttpError(409, 'capacity_reached', `All five ${format} plan slots are occupied.`);
  }
  return rowToEntry(row);
}

async function updatePlan(db, userId, id, format, expectedRevision, documentInput, now) {
  const current = await selectOwnedPlan(db, id, userId, format);
  if (!current) throw new PlanHttpError(404, 'plan_not_found', 'The requested tactical plan was not found.');
  if (current.revision !== expectedRevision) {
    throw new PlanHttpError(409, 'revision_conflict', 'This plan changed elsewhere. Reload it before saving again.');
  }
  const document = validatePlanDocument(documentInput, {
    id,
    title: documentInput?.metadata?.title,
    now: now.toISOString(),
    createdAt: current.created_at,
  });
  if (document.metadata.gameFormat !== format) {
    throw new PlanHttpError(409, 'format_immutable', 'A saved plan cannot be moved between 5v5 and 7v7 slots.');
  }
  const result = await db.prepare(`
    UPDATE tactical_plans
       SET title = ?, payload_json = ?, revision = revision + 1, updated_at = ?
     WHERE id = ? AND user_id = ? AND format = ? AND revision = ? AND deleted_at IS NULL
    RETURNING id, user_id, format, slot_number, title, schema_version,
              payload_json, revision, created_at, updated_at, deleted_at
  `).bind(
    document.metadata.title, JSON.stringify(document), now.toISOString(),
    id, userId, format, expectedRevision,
  ).all();
  const row = rowsOf(result)[0];
  if (!row) throw new PlanHttpError(409, 'revision_conflict', 'This plan changed elsewhere. Reload it before saving again.');
  return rowToEntry(row);
}

async function renamePlan(db, userId, id, format, expectedRevision, title, now) {
  const current = await selectOwnedPlan(db, id, userId, format);
  if (!current) throw new PlanHttpError(404, 'plan_not_found', 'The requested tactical plan was not found.');
  if (current.revision !== expectedRevision) {
    throw new PlanHttpError(409, 'revision_conflict', 'This plan changed elsewhere. Reload it before renaming.');
  }
  const document = validatePlanDocument(JSON.parse(current.payload_json), {
    id,
    title,
    now: now.toISOString(),
    createdAt: current.created_at,
  });
  const result = await db.prepare(`
    UPDATE tactical_plans
       SET title = ?, payload_json = ?, revision = revision + 1, updated_at = ?
     WHERE id = ? AND user_id = ? AND format = ? AND revision = ? AND deleted_at IS NULL
    RETURNING id, user_id, format, slot_number, title, schema_version,
              payload_json, revision, created_at, updated_at, deleted_at
  `).bind(
    title.trim(), JSON.stringify(document), now.toISOString(),
    id, userId, format, expectedRevision,
  ).all();
  const row = rowsOf(result)[0];
  if (!row) throw new PlanHttpError(409, 'revision_conflict', 'This plan changed elsewhere. Reload it before renaming.');
  return rowToEntry(row);
}

async function deletePlan(db, userId, id, format, expectedRevision, now) {
  const current = await selectOwnedPlan(db, id, userId, format);
  if (!current) throw new PlanHttpError(404, 'plan_not_found', 'The requested tactical plan was not found.');
  if (current.revision !== expectedRevision) {
    throw new PlanHttpError(409, 'revision_conflict', 'This plan changed elsewhere. Reload it before deleting.');
  }
  const result = await db.prepare(`
    UPDATE tactical_plans
       SET deleted_at = ?, updated_at = ?, revision = revision + 1
     WHERE id = ? AND user_id = ? AND format = ? AND revision = ? AND deleted_at IS NULL
    RETURNING id, revision, deleted_at
  `).bind(now.toISOString(), now.toISOString(), id, userId, format, expectedRevision).all();
  if (!rowsOf(result)[0]) {
    throw new PlanHttpError(409, 'revision_conflict', 'This plan changed elsewhere. Reload it before deleting.');
  }
  return { ok: true, id, deletedAt: now.toISOString() };
}

function defaultClock() { return new Date(); }
function defaultId() {
  if (!globalThis.crypto?.randomUUID) throw new PlanHttpError(503, 'id_generation_unavailable', 'Secure plan ID generation is unavailable.');
  return globalThis.crypto.randomUUID();
}

/**
 * Handler factory makes session identity injectable in tests, while the deployed handler
 * uses the fail-closed V19 session seam. No request-body owner field is ever consulted.
 */
export function createTacticalPlansHandler({
  resolveUser = async () => null,
  clock = defaultClock,
  createId = defaultId,
} = {}) {
  return async function handleTacticalPlans(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (!['/api/plans', /^\/api\/plans\/[^/]+$/].some((matcher) => typeof matcher === 'string' ? matcher === url.pathname : matcher.test(url.pathname))) {
      return jsonResponse(404, { error: 'Not found.', code: 'not_found' });
    }
    if (method === 'OPTIONS') return noContentResponse(204);
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return jsonResponse(405, { error: 'Method not allowed.', code: 'method_not_allowed' });
    }

    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) {
      return jsonResponse(403, { error: 'Cross-origin requests are not allowed.', code: 'origin_rejected' });
    }
    if (method !== 'GET' && request.headers.get(EXPECTED_HEADER) !== '1') {
      return jsonResponse(403, { error: 'Missing required request header.', code: 'csrf_header_required' });
    }

    try {
      // This resolver must be backed by a verified server-side session in production.
      const user = await resolveUser(request, env);
      if (!user || typeof user.id !== 'string' || !user.id.trim() || user.id.length > 120) {
        throw new PlanHttpError(401, 'not_authenticated', 'A verified cloud account is required for the tactical plan library.');
      }
      if (user.status !== 'active') {
        throw new PlanHttpError(403, 'account_disabled', 'This cloud account is not active.');
      }
      const db = await requireD1(env);
      const now = clock();

      if (url.pathname === '/api/plans' && method === 'GET') {
        const params = [...url.searchParams.keys()];
        if (params.some((key) => key !== 'format') || url.searchParams.getAll('format').length !== 1) {
          throw new PlanHttpError(400, 'invalid_query', 'Exactly one format query parameter is required.');
        }
        return jsonResponse(200, { plans: await listPlans(db, user.id, validateFormat(url.searchParams.get('format'))) });
      }

      if (url.pathname === '/api/plans' && method === 'POST') {
        const body = await readJsonBody(request);
        return jsonResponse(201, { plan: await createPlan(db, user.id, body, now, createId) });
      }

      let decodedId;
      try {
        decodedId = decodeURIComponent(url.pathname.slice('/api/plans/'.length));
      } catch {
        throw new PlanHttpError(400, 'invalid_id', 'Plan ID encoding is invalid.');
      }
      const id = validatePlanId(decodedId);
      if (method === 'GET') {
        const row = await db.prepare(`
          SELECT id, user_id, format, slot_number, title, schema_version,
                 payload_json, revision, created_at, updated_at, deleted_at
            FROM tactical_plans
           WHERE id = ? AND user_id = ? AND deleted_at IS NULL
           LIMIT 1
        `).bind(id, user.id).first();
        if (!row) throw new PlanHttpError(404, 'plan_not_found', 'The requested tactical plan was not found.');
        return jsonResponse(200, { plan: rowToEntry(row) });
      }

      const body = await readJsonBody(request);
      const format = validateFormat(body.format);
      const expectedRevision = parseRevision(body.expectedRevision);
      if (method === 'PUT') {
        assertOnlyKeys(body, new Set(['format', 'expectedRevision', 'document']));
        return jsonResponse(200, { plan: await updatePlan(db, user.id, id, format, expectedRevision, body.document, now) });
      }
      if (method === 'PATCH') {
        assertOnlyKeys(body, new Set(['format', 'expectedRevision', 'title']));
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!boundedText(title, 70, { allowEmpty: false })) {
          throw new PlanHttpError(400, 'invalid_title', 'Plan title must contain 1–70 characters.');
        }
        return jsonResponse(200, { plan: await renamePlan(db, user.id, id, format, expectedRevision, title, now) });
      }
      if (method === 'DELETE') {
        assertOnlyKeys(body, new Set(['format', 'expectedRevision']));
        return jsonResponse(200, await deletePlan(db, user.id, id, format, expectedRevision, now));
      }
      return jsonResponse(405, { error: 'Method not allowed.', code: 'method_not_allowed' });
    } catch (error) {
      if (error instanceof PlanHttpError) {
        return jsonResponse(error.status, { error: error.message, code: error.code });
      }
      console.error('[taamen] tactical plans request failed:', error?.message || 'unknown error');
      return jsonResponse(500, { error: 'The tactical plan request could not be completed.', code: 'internal_error' });
    }
  };
}

import { resolveAuthenticatedCloudUser } from './planIdentity.js';
export const handleTacticalPlans = createTacticalPlansHandler({ resolveUser: resolveAuthenticatedCloudUser });

export const TACTICAL_PLAN_LIMITS = Object.freeze({
  maxPlansPerFormat: 5,
  maxPlanBytes: MAX_PLAN_BYTES,
  maxDrawings: MAX_DRAWINGS,
  maxPointsPerDrawing: MAX_POINTS_PER_DRAWING,
  maxTotalPoints: MAX_TOTAL_POINTS,
});
