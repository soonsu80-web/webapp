interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  ASSETS: AssetFetcher;
  TEACHER_PASSWORD?: string;
}

interface AppPlanRow {
  id: string;
  grade: string;
  class_room: string;
  student_name: string;
  discovery_source: string;
  problem_summary: string;
  urgency_reason: string;
  public_benefit_reason: string;
  inquiry_question: string;
  screen_composition: string;
  features_to_implement: string;
  data_to_store: string;
  constraints: string;
  programming_principles: string;
  safety_checked: number;
  rubric_level: string;
  teacher_note: string;
  created_at: string;
  updated_at: string;
}

interface GalleryRow {
  id: string;
  student_id: string;
  student_name: string;
  app_url: string;
  intro: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const SESSION_COOKIE_NAME = 'classroom_teacher_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

const VALID_SOURCES = new Set([
  '기사',
  '주변 지역사회 주민 인터뷰',
  '가족과의 대화',
  '친구와의 브레인스토밍',
  '수업 중 학교문제 토론',
  '기타 일상 관찰',
]);

const VALID_RUBRIC = new Set(['미확인', '상', '중', '하']);
const VALID_GALLERY_STATUS = new Set(['pending', 'approved', 'rejected']);

function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const map: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) map[key] = decodeURIComponent(val);
  }
  return map;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function timingSafePasswordMatch(provided: string, expected: string): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(provided)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected)),
  ]);
  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildCookieHeader(value: string, maxAgeSeconds: number, requestUrl: URL): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (requestUrl.protocol === 'https:') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function mapRowToPlan(row: AppPlanRow) {
  return {
    id: row.id,
    grade: row.grade,
    classRoom: row.class_room,
    studentName: row.student_name,
    discoverySource: row.discovery_source,
    problemSummary: row.problem_summary,
    urgencyReason: row.urgency_reason,
    publicBenefitReason: row.public_benefit_reason,
    inquiryQuestion: row.inquiry_question,
    screenComposition: row.screen_composition,
    featuresToImplement: row.features_to_implement,
    dataToStore: row.data_to_store,
    constraints: row.constraints,
    programmingPrinciples: row.programming_principles,
    safetyChecked: row.safety_checked === 1,
    rubricLevel: row.rubric_level,
    teacherNote: row.teacher_note,
    storageState: 'synced' as const,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToGalleryItem(row: GalleryRow) {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    appUrl: row.app_url,
    intro: row.intro,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getActiveTeacherSessionHash(request: Request, env: Env): Promise<string | null> {
  if (!env.DB) return null;
  const cookies = parseCookies(request.headers.get('Cookie'));
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken || rawToken.length < 32 || rawToken.length > 128) return null;

  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();

  await env.DB.prepare('DELETE FROM teacher_sessions WHERE expires_at <= ?').bind(nowIso).run();
  const row = await env.DB.prepare(
    'SELECT token_hash, expires_at FROM teacher_sessions WHERE token_hash = ? AND expires_at > ?',
  )
    .bind(tokenHash, nowIso)
    .first<{ token_hash: string; expires_at: string }>();

  return row ? row.token_hash : null;
}

function validatePlanBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    return { ok: false as const, error: '올바른 JSON 요청 형식이 아닙니다.' };
  }
  const raw = body as Record<string, unknown>;

  const grade = sanitizeText(raw.grade, 20);
  const classRoom = sanitizeText(raw.classRoom, 20);
  const studentName = sanitizeText(raw.studentName, 40);
  const discoverySource = sanitizeText(raw.discoverySource, 60);
  const problemSummary = sanitizeText(raw.problemSummary, 1500);
  const urgencyReason = sanitizeText(raw.urgencyReason, 1000);
  const publicBenefitReason = sanitizeText(raw.publicBenefitReason, 1000);
  const inquiryQuestion = sanitizeText(raw.inquiryQuestion, 1000);
  const screenComposition = sanitizeText(raw.screenComposition, 1500);
  const featuresToImplement = sanitizeText(raw.featuresToImplement, 1500);
  const dataToStore = sanitizeText(raw.dataToStore, 1500);
  const constraints = sanitizeText(raw.constraints, 1500);
  const programmingPrinciples = sanitizeText(raw.programmingPrinciples, 1500);
  const safetyChecked = raw.safetyChecked === true;

  if (!grade || !classRoom || !studentName) {
    return { ok: false as const, error: '작성자의 학년, 반, 성명(또는 가상 별칭)을 모두 입력해 주세요.' };
  }
  if (!VALID_SOURCES.has(discoverySource)) {
    return { ok: false as const, error: '실생활 문제 탐색 경로를 올바르게 선택해 주세요.' };
  }
  if (!problemSummary || !urgencyReason || !publicBenefitReason) {
    return { ok: false as const, error: '실생활 문제와 시급성·공공의 이익 선정 이유를 모두 입력해 주세요.' };
  }
  if (!inquiryQuestion || !screenComposition) {
    return { ok: false as const, error: '탐구 질문과 웹앱 화면 구성을 모두 입력해 주세요.' };
  }
  if (!featuresToImplement || !dataToStore || !constraints || !programmingPrinciples) {
    return {
      ok: false as const,
      error: '앱 기획서 4가지 항목(기능, 저장 데이터, 제약사항, 프로그래밍 원리)을 모두 입력해 주세요.',
    };
  }
  if (!safetyChecked) {
    return { ok: false as const, error: '디지털 안전 약속 확인 체크를 완료해 주세요.' };
  }

  return {
    ok: true as const,
    data: {
      grade,
      classRoom,
      studentName,
      discoverySource,
      problemSummary,
      urgencyReason,
      publicBenefitReason,
      inquiryQuestion,
      screenComposition,
      featuresToImplement,
      dataToStore,
      constraints,
      programmingPrinciples,
      safetyChecked,
    },
  };
}

function validateGalleryBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    return { ok: false as const, error: '올바른 JSON 요청 형식이 아닙니다.' };
  }
  const raw = body as Record<string, unknown>;

  const studentId = sanitizeText(raw.studentId, 30);
  const studentName = sanitizeText(raw.studentName, 40);
  const appUrlRaw = sanitizeText(raw.appUrl, 500);
  const intro = sanitizeText(raw.intro, 500);

  if (!studentId || !studentName) {
    return { ok: false as const, error: '학번과 이름(또는 가상 별칭)을 모두 입력해 주세요.' };
  }
  if (!appUrlRaw) {
    return { ok: false as const, error: '작성한 웹페이지 URL을 입력해 주세요.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(appUrlRaw);
  } catch {
    return { ok: false as const, error: 'https:// 또는 http://로 시작하는 올바른 URL 형식을 입력해 주세요.' };
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return { ok: false as const, error: 'URL은 https:// 또는 http:// 주소만 등록할 수 있습니다.' };
  }

  if (!intro) {
    return { ok: false as const, error: '작품 소개글을 입력해 주세요.' };
  }

  return {
    ok: true as const,
    data: {
      studentId,
      studentName,
      appUrl: parsedUrl.toString(),
      intro,
    },
  };
}

async function handleApiRequest(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (!env.DB) {
    return jsonResponse({ ok: false, error: 'D1 데이터베이스(DB)가 바인딩되지 않았습니다.' }, 503);
  }

  if (path === '/api/health' && method === 'GET') {
    try {
      await env.DB.prepare('SELECT 1 FROM app_plans LIMIT 1').first();
      await env.DB.prepare('SELECT 1 FROM teacher_sessions LIMIT 1').first();
      await env.DB.prepare('SELECT 1 FROM gallery_items LIMIT 1').first();
      return jsonResponse({ ok: true, dbReady: true });
    } catch {
      return jsonResponse(
        { ok: false, dbReady: false, error: 'D1 테이블이 아직 생성되지 않았습니다. setup.sql을 실행해 주세요.' },
        503,
      );
    }
  }

  if (path === '/api/teacher/session' && method === 'GET') {
    try {
      const sessionHash = await getActiveTeacherSessionHash(request, env);
      return jsonResponse({ authenticated: Boolean(sessionHash) });
    } catch {
      return jsonResponse({ authenticated: false, error: '세션 확인 중 오류가 발생했습니다.' }, 503);
    }
  }

  if (path === '/api/teacher/login' && method === 'POST') {
    if (!env.TEACHER_PASSWORD || env.TEACHER_PASSWORD.length === 0) {
      return jsonResponse(
        { error: 'Worker 환경에 TEACHER_PASSWORD 시크릿이 설정되지 않았습니다.' },
        500,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '올바른 요청 형식이 아닙니다.' }, 400);
    }

    const password = sanitizeText((body as Record<string, unknown>)?.password, 200);
    if (!password) {
      return jsonResponse({ error: '교사 비밀번호를 입력해 주세요.' }, 400);
    }

    const matched = await timingSafePasswordMatch(password, env.TEACHER_PASSWORD);
    if (!matched) {
      return jsonResponse({ error: '교사 비밀번호가 일치하지 않습니다.' }, 401);
    }

    try {
      const rawToken = generateSessionToken();
      const tokenHash = await sha256Hex(rawToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

      await env.DB.prepare('DELETE FROM teacher_sessions WHERE expires_at <= ?')
        .bind(now.toISOString())
        .run();
      await env.DB.prepare(
        'INSERT INTO teacher_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)',
      )
        .bind(tokenHash, now.toISOString(), expiresAt.toISOString())
        .run();

      return jsonResponse(
        { authenticated: true },
        200,
        { 'Set-Cookie': buildCookieHeader(rawToken, SESSION_TTL_SECONDS, url) },
      );
    } catch {
      return jsonResponse(
        { error: '교사 세션을 저장하지 못했습니다. D1 setup.sql 실행 여부를 확인해 주세요.' },
        500,
      );
    }
  }

  if (path === '/api/teacher/logout' && method === 'POST') {
    try {
      const cookies = parseCookies(request.headers.get('Cookie'));
      const rawToken = cookies[SESSION_COOKIE_NAME];
      if (rawToken) {
        const tokenHash = await sha256Hex(rawToken);
        await env.DB.prepare('DELETE FROM teacher_sessions WHERE token_hash = ?').bind(tokenHash).run();
      }
    } catch {
      // Clear cookie regardless
    }

    return jsonResponse(
      { authenticated: false },
      200,
      { 'Set-Cookie': buildCookieHeader('', 0, url) },
    );
  }

  // Public gallery: returns ONLY teacher-approved items
  if (path === '/api/gallery' && method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        'SELECT id, student_id, student_name, app_url, intro, status, created_at, updated_at FROM gallery_items WHERE status = ? ORDER BY updated_at DESC LIMIT 200',
      )
        .bind('approved')
        .all<GalleryRow>();

      return jsonResponse({ items: results.map(mapRowToGalleryItem) });
    } catch {
      return jsonResponse({ error: '갤러리 목록을 불러오지 못했습니다. D1 setup.sql을 확인해 주세요.' }, 500);
    }
  }

  // Student gallery submission: always created with status = 'pending'
  if (path === '/api/gallery' && method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '올바른 JSON 요청 본문이 아닙니다.' }, 400);
    }

    const parsed = validateGalleryBody(body);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400);
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const d = parsed.data;

    try {
      await env.DB.prepare(
        'INSERT INTO gallery_items (id, student_id, student_name, app_url, intro, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(id, d.studentId, d.studentName, d.appUrl, d.intro, 'pending', nowIso, nowIso)
        .run();

      return jsonResponse(
        {
          item: {
            id,
            ...d,
            status: 'pending',
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        },
        201,
      );
    } catch {
      return jsonResponse(
        { error: '갤러리 등록 저장에 실패했습니다. D1 setup.sql 적용 여부를 확인해 주세요.' },
        500,
      );
    }
  }

  // Teacher gallery moderation endpoints
  if (path === '/api/teacher/gallery' && method === 'GET') {
    const sessionHash = await getActiveTeacherSessionHash(request, env);
    if (!sessionHash) {
      return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401);
    }

    try {
      const { results } = await env.DB.prepare(
        'SELECT id, student_id, student_name, app_url, intro, status, created_at, updated_at FROM gallery_items ORDER BY updated_at DESC LIMIT 500',
      ).all<GalleryRow>();

      return jsonResponse({ items: results.map(mapRowToGalleryItem) });
    } catch {
      return jsonResponse({ error: '갤러리 신청 목록을 불러오지 못했습니다.' }, 500);
    }
  }

  const teacherGalleryMatch = path.match(/^\/api\/teacher\/gallery\/([a-zA-Z0-9-]+)$/);
  if (teacherGalleryMatch && method === 'PATCH') {
    const sessionHash = await getActiveTeacherSessionHash(request, env);
    if (!sessionHash) {
      return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '올바른 JSON 요청 본문이 아닙니다.' }, 400);
    }

    const status = sanitizeText((body as Record<string, unknown>)?.status, 20);
    if (!VALID_GALLERY_STATUS.has(status)) {
      return jsonResponse({ error: '유효한 상태(pending, approved, rejected)를 선택해 주세요.' }, 400);
    }

    const itemId = teacherGalleryMatch[1];
    const nowIso = new Date().toISOString();

    try {
      const res = await env.DB.prepare(
        'UPDATE gallery_items SET status = ?, updated_at = ? WHERE id = ?',
      )
        .bind(status, nowIso, itemId)
        .run();

      if (!res.meta?.changes) {
        return jsonResponse({ error: '해당 갤러리 항목을 찾을 수 없습니다.' }, 404);
      }

      const row = await env.DB.prepare(
        'SELECT id, student_id, student_name, app_url, intro, status, created_at, updated_at FROM gallery_items WHERE id = ?',
      )
        .bind(itemId)
        .first<GalleryRow>();

      if (!row) {
        return jsonResponse({ error: '해당 갤러리 항목을 찾을 수 없습니다.' }, 404);
      }

      return jsonResponse({ item: mapRowToGalleryItem(row) });
    } catch {
      return jsonResponse({ error: '갤러리 인증 상태를 변경하지 못했습니다.' }, 500);
    }
  }

  if (teacherGalleryMatch && method === 'DELETE') {
    const sessionHash = await getActiveTeacherSessionHash(request, env);
    if (!sessionHash) {
      return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401);
    }

    const itemId = teacherGalleryMatch[1];
    try {
      const res = await env.DB.prepare('DELETE FROM gallery_items WHERE id = ?').bind(itemId).run();
      if (!res.meta?.changes) {
        return jsonResponse({ error: '삭제할 갤러리 항목을 찾을 수 없습니다.' }, 404);
      }
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ error: '갤러리 항목 삭제 중 오류가 발생했습니다.' }, 500);
    }
  }

  if (path === '/api/plans' && method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '올바른 JSON 요청 본문이 아닙니다.' }, 400);
    }

    const parsed = validatePlanBody(body);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400);
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const d = parsed.data;

    try {
      await env.DB.prepare(
        'INSERT INTO app_plans (id, grade, class_room, student_name, discovery_source, problem_summary, urgency_reason, public_benefit_reason, inquiry_question, screen_composition, features_to_implement, data_to_store, constraints, programming_principles, safety_checked, rubric_level, teacher_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(
          id,
          d.grade,
          d.classRoom,
          d.studentName,
          d.discoverySource,
          d.problemSummary,
          d.urgencyReason,
          d.publicBenefitReason,
          d.inquiryQuestion,
          d.screenComposition,
          d.featuresToImplement,
          d.dataToStore,
          d.constraints,
          d.programmingPrinciples,
          d.safetyChecked ? 1 : 0,
          '미확인',
          '',
          nowIso,
          nowIso,
        )
        .run();

      return jsonResponse(
        {
          plan: {
            id,
            ...d,
            rubricLevel: '미확인',
            teacherNote: '',
            storageState: 'synced',
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        },
        201,
      );
    } catch {
      return jsonResponse(
        { error: '데이터베이스 저장에 실패했습니다. D1 setup.sql 적용 여부를 확인해 주세요.' },
        500,
      );
    }
  }

  if (path === '/api/plans' && method === 'GET') {
    const sessionHash = await getActiveTeacherSessionHash(request, env);
    if (!sessionHash) {
      return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401);
    }

    try {
      const { results } = await env.DB.prepare(
        'SELECT id, grade, class_room, student_name, discovery_source, problem_summary, urgency_reason, public_benefit_reason, inquiry_question, screen_composition, features_to_implement, data_to_store, constraints, programming_principles, safety_checked, rubric_level, teacher_note, created_at, updated_at FROM app_plans ORDER BY updated_at DESC LIMIT 500',
      ).all<AppPlanRow>();

      return jsonResponse({ plans: results.map(mapRowToPlan) });
    } catch {
      return jsonResponse({ error: '응답 목록을 조회하지 못했습니다.' }, 500);
    }
  }

  const reviewMatch = path.match(/^\/api\/plans\/([a-zA-Z0-9-]+)\/review$/);
  if (reviewMatch && method === 'PATCH') {
    const sessionHash = await getActiveTeacherSessionHash(request, env);
    if (!sessionHash) {
      return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '올바른 JSON 요청 본문이 아닙니다.' }, 400);
    }

    const raw = (body || {}) as Record<string, unknown>;
    const rubricLevel = sanitizeText(raw.rubricLevel, 20);
    const teacherNote = sanitizeText(raw.teacherNote, 1000);

    if (!VALID_RUBRIC.has(rubricLevel)) {
      return jsonResponse({ error: '평가 수준은 미확인, 상, 중, 하 중 하나여야 합니다.' }, 400);
    }

    const planId = reviewMatch[1];
    try {
      const updateResult = await env.DB.prepare(
        'UPDATE app_plans SET rubric_level = ?, teacher_note = ? WHERE id = ?',
      )
        .bind(rubricLevel, teacherNote, planId)
        .run();

      if (!updateResult.meta?.changes) {
        return jsonResponse({ error: '해당 학생 응답을 찾을 수 없습니다.' }, 404);
      }

      const row = await env.DB.prepare(
        'SELECT id, grade, class_room, student_name, discovery_source, problem_summary, urgency_reason, public_benefit_reason, inquiry_question, screen_composition, features_to_implement, data_to_store, constraints, programming_principles, safety_checked, rubric_level, teacher_note, created_at, updated_at FROM app_plans WHERE id = ?',
      )
        .bind(planId)
        .first<AppPlanRow>();

      if (!row) {
        return jsonResponse({ error: '해당 학생 응답을 찾을 수 없습니다.' }, 404);
      }

      return jsonResponse({ plan: mapRowToPlan(row) });
    } catch {
      return jsonResponse({ error: '평가 확인 내용을 저장하지 못했습니다.' }, 500);
    }
  }

  const deleteMatch = path.match(/^\/api\/plans\/([a-zA-Z0-9-]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const sessionHash = await getActiveTeacherSessionHash(request, env);
    if (!sessionHash) {
      return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401);
    }

    const planId = deleteMatch[1];
    try {
      const res = await env.DB.prepare('DELETE FROM app_plans WHERE id = ?').bind(planId).run();
      if (!res.meta?.changes) {
        return jsonResponse({ error: '삭제할 응답을 찾을 수 없습니다.' }, 404);
      }
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ error: '응답 삭제 중 오류가 발생했습니다.' }, 500);
    }
  }

  return jsonResponse({ error: '지원하지 않는 API 경로입니다.' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};
