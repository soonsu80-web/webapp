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
  student_number?: string | null;
  student_name: string;
  discovery_source: string;
  problem_summary: string;
  urgency_reason: string;
  public_benefit_reason: string;
  inquiry_question: string;
  app_title?: string | null;
  screen_composition: string;
  features_to_implement: string;
  data_to_store: string;
  constraints: string;
  programming_principles: string;
  safety_checked: number;
  rubric_level: string;
  teacher_note: string;
  prompt_draft?: string | null;
  final_prompt?: string | null;
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

interface AppRevisionRow {
  id: string;
  grade: string;
  class_room: string;
  student_number?: string | null;
  student_name: string;
  before_image: string;
  before_code: string;
  after_code: string;
  tested_content?: string | null;
  fixed_after_test?: string | null;
  after_image: string;
  reason_and_result: string;
  review_status: string;
  teacher_note: string;
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
const VALID_REVISION_STATUS = new Set(['미확인', '확인 완료', '보완 필요']);

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

function sanitizeCodeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').slice(0, maxLength);
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
    studentNumber: row.student_number ?? '',
    studentName: row.student_name,
    discoverySource: row.discovery_source,
    problemSummary: row.problem_summary,
    urgencyReason: row.urgency_reason,
    publicBenefitReason: row.public_benefit_reason,
    inquiryQuestion: row.inquiry_question,
    appTitle: row.app_title ?? '',
    screenComposition: row.screen_composition,
    featuresToImplement: row.features_to_implement,
    dataToStore: row.data_to_store,
    constraints: row.constraints,
    programmingPrinciples: row.programming_principles,
    safetyChecked: row.safety_checked === 1,
    rubricLevel: row.rubric_level,
    teacherNote: row.teacher_note,
    promptDraft: row.prompt_draft ?? '',
    finalPrompt: row.final_prompt ?? '',
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

function mapRowToRevision(row: AppRevisionRow) {
  return {
    id: row.id,
    grade: row.grade,
    classRoom: row.class_room,
    studentNumber: row.student_number ?? '',
    studentName: row.student_name,
    beforeImage: row.before_image,
    testedContent: row.tested_content || row.before_code || '',
    fixedAfterTest: row.fixed_after_test || row.after_code || '',
    afterImage: row.after_image,
    reasonAndResult: row.reason_and_result,
    reviewStatus: row.review_status,
    teacherNote: row.teacher_note,
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
  const studentNumber = sanitizeText(raw.studentNumber, 20);
  const studentName = sanitizeText(raw.studentName, 40);
  const discoverySource = sanitizeText(raw.discoverySource, 60);
  const problemSummary = sanitizeText(raw.problemSummary, 1500);
  const urgencyReason = sanitizeText(raw.urgencyReason, 1000);
  const publicBenefitReason = sanitizeText(raw.publicBenefitReason, 1000);
  const inquiryQuestion = sanitizeText(raw.inquiryQuestion, 1000);
  const appTitle = sanitizeText(raw.appTitle, 100);
  const screenComposition = sanitizeText(raw.screenComposition, 1500);
  const featuresToImplement = sanitizeText(raw.featuresToImplement, 1500);
  const dataToStore = sanitizeText(raw.dataToStore, 1500);
  const constraints = sanitizeText(raw.constraints, 1500);
  const programmingPrinciples = sanitizeText(raw.programmingPrinciples, 1500);
  const promptDraft = sanitizeText(raw.promptDraft, 12000);
  const finalPrompt = sanitizeText(raw.finalPrompt, 6000);
  const safetyChecked = raw.safetyChecked === true;

  if (!grade || !classRoom || !studentNumber || !studentName) {
    return { ok: false as const, error: '작성자의 학년, 반, 번호, 성명을 모두 입력해 주세요.' };
  }
  if (!VALID_SOURCES.has(discoverySource)) {
    return { ok: false as const, error: '실생활 문제 탐색 경로를 올바르게 선택해 주세요.' };
  }
  if (!problemSummary || !urgencyReason || !publicBenefitReason) {
    return { ok: false as const, error: '실생활 문제와 시급성·공공의 이익 선정 이유를 모두 입력해 주세요.' };
  }
  if (!appTitle) {
    return { ok: false as const, error: '웹앱 제목을 입력해 주세요.' };
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
  const resolvedFinalPrompt = finalPrompt || promptDraft;
  if (!safetyChecked) {
    return { ok: false as const, error: '디지털 안전 약속 확인 체크를 완료해 주세요.' };
  }

  return {
    ok: true as const,
    data: {
      grade,
      classRoom,
      studentNumber,
      studentName,
      discoverySource,
      problemSummary,
      urgencyReason,
      publicBenefitReason,
      inquiryQuestion,
      appTitle,
      screenComposition,
      featuresToImplement,
      dataToStore,
      constraints,
      programmingPrinciples,
      promptDraft,
      finalPrompt: resolvedFinalPrompt,
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
      await env.DB.prepare('SELECT 1 FROM app_plan_prompts LIMIT 1').first();
      await env.DB.prepare('SELECT 1 FROM app_revisions LIMIT 1').first();
      await env.DB.prepare('SELECT 1 FROM app_plan_meta LIMIT 1').first();
      await env.DB.prepare('SELECT 1 FROM app_revision_details LIMIT 1').first();
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

      await env.DB.prepare(
        'INSERT INTO app_plan_prompts (plan_id, prompt_draft, final_prompt, updated_at) VALUES (?, ?, ?, ?)',
      )
        .bind(id, d.promptDraft, d.finalPrompt, nowIso)
        .run();

      await env.DB.prepare(
        'INSERT INTO app_plan_meta (plan_id, student_number, app_title, updated_at) VALUES (?, ?, ?, ?)',
      )
        .bind(id, d.studentNumber, d.appTitle, nowIso)
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
        "SELECT a.id, a.grade, a.class_room, COALESCE(m.student_number, '') AS student_number, a.student_name, a.discovery_source, a.problem_summary, a.urgency_reason, a.public_benefit_reason, a.inquiry_question, COALESCE(m.app_title, '') AS app_title, a.screen_composition, a.features_to_implement, a.data_to_store, a.constraints, a.programming_principles, a.safety_checked, a.rubric_level, a.teacher_note, COALESCE(p.prompt_draft, '') AS prompt_draft, COALESCE(p.final_prompt, '') AS final_prompt, a.created_at, a.updated_at FROM app_plans a LEFT JOIN app_plan_prompts p ON p.plan_id = a.id LEFT JOIN app_plan_meta m ON m.plan_id = a.id ORDER BY a.updated_at DESC LIMIT 500",
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
        "SELECT a.id, a.grade, a.class_room, COALESCE(m.student_number, '') AS student_number, a.student_name, a.discovery_source, a.problem_summary, a.urgency_reason, a.public_benefit_reason, a.inquiry_question, COALESCE(m.app_title, '') AS app_title, a.screen_composition, a.features_to_implement, a.data_to_store, a.constraints, a.programming_principles, a.safety_checked, a.rubric_level, a.teacher_note, COALESCE(p.prompt_draft, '') AS prompt_draft, COALESCE(p.final_prompt, '') AS final_prompt, a.created_at, a.updated_at FROM app_plans a LEFT JOIN app_plan_prompts p ON p.plan_id = a.id LEFT JOIN app_plan_meta m ON m.plan_id = a.id WHERE a.id = ?",
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
      await env.DB.prepare('DELETE FROM app_plan_meta WHERE plan_id = ?').bind(planId).run();
      await env.DB.prepare('DELETE FROM app_plan_prompts WHERE plan_id = ?').bind(planId).run();
      const res = await env.DB.prepare('DELETE FROM app_plans WHERE id = ?').bind(planId).run();
      if (!res.meta?.changes) {
        return jsonResponse({ error: '삭제할 응답을 찾을 수 없습니다.' }, 404);
      }
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ error: '응답 삭제 중 오류가 발생했습니다.' }, 500);
    }
  }

  if (path === '/api/revisions' && method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '올바른 JSON 요청 본문이 아닙니다.' }, 400);
    }

    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: '올바른 요청 형식이 아닙니다.' }, 400);
    }
    const raw = body as Record<string, unknown>;

    const grade = sanitizeText(raw.grade, 20);
    const classRoom = sanitizeText(raw.classRoom, 20);
    const studentNumber = sanitizeText(raw.studentNumber, 20);
    const studentName = sanitizeText(raw.studentName, 40);
    const beforeImage = typeof raw.beforeImage === 'string' ? raw.beforeImage.trim() : '';
    const testedContent = sanitizeCodeText(raw.testedContent ?? raw.beforeCode, 5000).trim();
    const fixedAfterTest = sanitizeCodeText(raw.fixedAfterTest ?? raw.afterCode, 5000).trim();
    const afterImage = typeof raw.afterImage === 'string' ? raw.afterImage.trim() : '';
    const reasonAndResult = sanitizeText(raw.reasonAndResult, 3000);

    if (!grade || !classRoom || !studentNumber || !studentName) {
      return jsonResponse({ error: '작성자의 학년, 반, 번호, 성명을 모두 입력해 주세요.' }, 400);
    }

    const imagePattern = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
    if (!beforeImage || !imagePattern.test(beforeImage)) {
      return jsonResponse({ error: '첫 프롬프트 결과 완성된 웹앱 화면 캡처 이미지를 올려 주세요.' }, 400);
    }
    if (!afterImage || !imagePattern.test(afterImage)) {
      return jsonResponse({ error: '수정 결과 바뀐 웹앱 화면 캡처 이미지를 올려 주세요.' }, 400);
    }
    if (beforeImage.length > 480000 || afterImage.length > 480000) {
      return jsonResponse({ error: '캡처 이미지 용량이 너무 큽니다. 더 작은 이미지를 선택해 주세요.' }, 400);
    }
    if (!testedContent || !fixedAfterTest) {
      return jsonResponse({ error: '웹앱을 테스트한 내용과 테스트 후 수정한 내용을 모두 입력해 주세요.' }, 400);
    }
    if (!reasonAndResult) {
      return jsonResponse({ error: '수정한 이유와 적용 결과를 서술해 주세요.' }, 400);
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    try {
      await env.DB.prepare(
        'INSERT INTO app_revisions (id, grade, class_room, student_name, before_image, before_code, after_code, after_image, reason_and_result, review_status, teacher_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(
          id,
          grade,
          classRoom,
          studentName,
          beforeImage,
          testedContent,
          fixedAfterTest,
          afterImage,
          reasonAndResult,
          '미확인',
          '',
          nowIso,
          nowIso,
        )
        .run();

      await env.DB.prepare(
        'INSERT INTO app_revision_details (revision_id, student_number, tested_content, fixed_after_test, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(id, studentNumber, testedContent, fixedAfterTest, nowIso)
        .run();

      return jsonResponse(
        {
          revision: {
            id,
            grade,
            classRoom,
            studentNumber,
            studentName,
            beforeImage,
            testedContent,
            fixedAfterTest,
            afterImage,
            reasonAndResult,
            reviewStatus: '미확인',
            teacherNote: '',
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        },
        201,
      );
    } catch {
      return jsonResponse(
        { error: '수정하기 기록 저장에 실패했습니다. D1 setup.sql 적용 여부를 확인해 주세요.' },
        500,
      );
    }
  }

  if (path === '/api/revisions' && method === 'GET') {
    const sessionHash = await getActiveTeacherSessionHash(request, env);
    if (!sessionHash) {
      return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401);
    }

    try {
      const { results } = await env.DB.prepare(
        "SELECT r.id, r.grade, r.class_room, COALESCE(d.student_number, '') AS student_number, r.student_name, r.before_image, r.before_code, r.after_code, COALESCE(d.tested_content, '') AS tested_content, COALESCE(d.fixed_after_test, '') AS fixed_after_test, r.after_image, r.reason_and_result, r.review_status, r.teacher_note, r.created_at, r.updated_at FROM app_revisions r LEFT JOIN app_revision_details d ON d.revision_id = r.id ORDER BY r.updated_at DESC LIMIT 500",
      ).all<AppRevisionRow>();

      return jsonResponse({ revisions: results.map(mapRowToRevision) });
    } catch {
      return jsonResponse({ error: '3차시 수정하기 목록을 조회하지 못했습니다.' }, 500);
    }
  }

  const revisionReviewMatch = path.match(/^\/api\/revisions\/([a-zA-Z0-9-]+)\/review$/);
  if (revisionReviewMatch && method === 'PATCH') {
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
    const reviewStatus = sanitizeText(raw.reviewStatus, 20);
    const teacherNote = sanitizeText(raw.teacherNote, 1000);

    if (!VALID_REVISION_STATUS.has(reviewStatus)) {
      return jsonResponse({ error: '확인 상태는 미확인, 확인 완료, 보완 필요 중 하나여야 합니다.' }, 400);
    }

    const revisionId = revisionReviewMatch[1];
    try {
      const updateResult = await env.DB.prepare(
        'UPDATE app_revisions SET review_status = ?, teacher_note = ? WHERE id = ?',
      )
        .bind(reviewStatus, teacherNote, revisionId)
        .run();

      if (!updateResult.meta?.changes) {
        return jsonResponse({ error: '해당 수정하기 기록을 찾을 수 없습니다.' }, 404);
      }

      const row = await env.DB.prepare(
        "SELECT r.id, r.grade, r.class_room, COALESCE(d.student_number, '') AS student_number, r.student_name, r.before_image, r.before_code, r.after_code, COALESCE(d.tested_content, '') AS tested_content, COALESCE(d.fixed_after_test, '') AS fixed_after_test, r.after_image, r.reason_and_result, r.review_status, r.teacher_note, r.created_at, r.updated_at FROM app_revisions r LEFT JOIN app_revision_details d ON d.revision_id = r.id WHERE r.id = ?",
      )
        .bind(revisionId)
        .first<AppRevisionRow>();

      if (!row) {
        return jsonResponse({ error: '해당 수정하기 기록을 찾을 수 없습니다.' }, 404);
      }

      return jsonResponse({ revision: mapRowToRevision(row) });
    } catch {
      return jsonResponse({ error: '교사 확인 내용을 저장하지 못했습니다.' }, 500);
    }
  }

  const revisionDeleteMatch = path.match(/^\/api\/revisions\/([a-zA-Z0-9-]+)$/);
  if (revisionDeleteMatch && method === 'DELETE') {
    const sessionHash = await getActiveTeacherSessionHash(request, env);
    if (!sessionHash) {
      return jsonResponse({ error: '교사 로그인이 필요합니다.' }, 401);
    }

    const revisionId = revisionDeleteMatch[1];
    try {
      await env.DB.prepare('DELETE FROM app_revision_details WHERE revision_id = ?').bind(revisionId).run();
      const res = await env.DB.prepare('DELETE FROM app_revisions WHERE id = ?').bind(revisionId).run();
      if (!res.meta?.changes) {
        return jsonResponse({ error: '삭제할 수정하기 기록을 찾을 수 없습니다.' }, 404);
      }
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ error: '수정하기 기록 삭제 중 오류가 발생했습니다.' }, 500);
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
