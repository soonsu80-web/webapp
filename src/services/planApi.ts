import type {
  AppPlanInput,
  AppPlanSubmission,
  AppRevisionInput,
  AppRevisionSubmission,
  EvaluationStage,
  GalleryInput,
  GalleryItem,
  GalleryStatus,
  RevisionReviewStatus,
  RubricLevel,
  StageEvaluation,
} from '../types/lesson';

export type BackendMode = 'checking' | 'ready' | 'db_uninitialized' | 'unavailable';

function isJsonResponse(res: Response): boolean {
  const contentType = res.headers.get('content-type') || '';
  return contentType.toLowerCase().includes('application/json');
}

export async function checkBackendHealth(): Promise<{ mode: BackendMode; message?: string }> {
  try {
    const res = await fetch('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { mode: 'unavailable' };
    }
    const data = await res.json();
    if (res.ok && data?.ok && data?.dbReady) {
      return { mode: 'ready' };
    }
    return {
      mode: 'db_uninitialized',
      message: typeof data?.error === 'string' ? data.error : 'D1 데이터베이스 준비가 필요합니다.',
    };
  } catch {
    return { mode: 'unavailable' };
  }
}

export async function checkTeacherSession(): Promise<{ connected: boolean; authenticated: boolean }> {
  try {
    const res = await fetch('/api/teacher/session', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { connected: false, authenticated: false };
    }
    const data = await res.json();
    return { connected: true, authenticated: data?.authenticated === true };
  } catch {
    return { connected: false, authenticated: false };
  }
}

export async function loginTeacher(
  password: string,
): Promise<{ connected: boolean; authenticated: boolean; error?: string }> {
  try {
    const res = await fetch('/api/teacher/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ password }),
    });
    if (!isJsonResponse(res)) {
      return {
        connected: false,
        authenticated: false,
        error: '저장소 및 인증 서버(/api)가 연결되지 않았습니다. Cloudflare Worker 발행 후 로그인할 수 있습니다.',
      };
    }
    const data = await res.json();
    if (!res.ok) {
      return {
        connected: true,
        authenticated: false,
        error: typeof data?.error === 'string' ? data.error : '로그인에 실패했습니다.',
      };
    }
    return { connected: true, authenticated: data?.authenticated === true };
  } catch {
    return {
      connected: false,
      authenticated: false,
      error: '인증 서버와 연결하지 못했습니다.',
    };
  }
}

export async function logoutTeacher(): Promise<void> {
  try {
    await fetch('/api/teacher/logout', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
  } catch {
    // Ignore network errors on logout
  }
}

export async function fetchTeacherPlans(): Promise<{
  connected: boolean;
  unauthorized?: boolean;
  plans: AppPlanSubmission[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/plans', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { connected: false, plans: [] };
    }
    const data = await res.json();
    if (res.status === 401) {
      return {
        connected: true,
        unauthorized: true,
        plans: [],
        error: typeof data?.error === 'string' ? data.error : '교사 로그인이 필요합니다.',
      };
    }
    if (!res.ok) {
      return {
        connected: true,
        plans: [],
        error: typeof data?.error === 'string' ? data.error : '응답을 불러오지 못했습니다.',
      };
    }
    const list: AppPlanSubmission[] = Array.isArray(data?.plans)
      ? data.plans.map((p: AppPlanSubmission) => ({ ...p, storageState: 'synced' }))
      : [];
    return { connected: true, plans: list };
  } catch {
    return { connected: false, plans: [], error: '서버와 연결하지 못했습니다.' };
  }
}

export async function submitPlanToApi(
  input: AppPlanInput & { promptDraft?: string },
): Promise<{
  connected: boolean;
  ok: boolean;
  plan?: AppPlanSubmission;
  error?: string;
}> {
  try {
    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(input),
    });

    if (!isJsonResponse(res)) {
      return {
        connected: false,
        ok: false,
        error: '저장 준비 중: /api 데이터 저장소가 연결되지 않아 서버에 저장되지 않았습니다.',
      };
    }

    const data = await res.json();
    if (!res.ok || !data?.plan) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '저장에 실패했습니다.',
      };
    }

    return {
      connected: true,
      ok: true,
      plan: { ...data.plan, storageState: 'synced' },
    };
  } catch {
    return {
      connected: false,
      ok: false,
      error: '저장 준비 중: 서버와 통신하지 못해 저장되지 않았습니다.',
    };
  }
}

export async function saveTeacherReviewToApi(
  id: string,
  rubricLevel: RubricLevel,
  teacherNote: string,
): Promise<{
  connected: boolean;
  ok: boolean;
  unauthorized?: boolean;
  plan?: AppPlanSubmission;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/plans/${encodeURIComponent(id)}/review`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ rubricLevel, teacherNote }),
    });

    if (!isJsonResponse(res)) {
      return { connected: false, ok: false, error: '인증/저장 서버(/api)에 연결되지 않았습니다.' };
    }

    const data = await res.json();
    if (res.status === 401) {
      return { connected: true, ok: false, unauthorized: true, error: '교사 세션이 만료되었습니다.' };
    }
    if (!res.ok || !data?.plan) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '평가 확인 저장에 실패했습니다.',
      };
    }

    return {
      connected: true,
      ok: true,
      plan: { ...data.plan, storageState: 'synced' },
    };
  } catch {
    return { connected: false, ok: false, error: '서버와 통신하지 못했습니다.' };
  }
}

export async function deletePlanFromApi(id: string): Promise<{
  connected: boolean;
  ok: boolean;
  unauthorized?: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { connected: false, ok: false, error: '인증/저장 서버(/api)에 연결되지 않았습니다.' };
    }
    const data = await res.json();
    if (res.status === 401) {
      return { connected: true, ok: false, unauthorized: true, error: '교사 세션이 만료되었습니다.' };
    }
    if (!res.ok) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '삭제에 실패했습니다.',
      };
    }
    return { connected: true, ok: true };
  } catch {
    return { connected: false, ok: false, error: '서버와 통신하지 못했습니다.' };
  }
}

export async function fetchApprovedGallery(): Promise<{
  connected: boolean;
  items: GalleryItem[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/gallery', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { connected: false, items: [] };
    }
    const data = await res.json();
    if (!res.ok) {
      return {
        connected: true,
        items: [],
        error: typeof data?.error === 'string' ? data.error : '갤러리 목록을 불러오지 못했습니다.',
      };
    }
    return {
      connected: true,
      items: Array.isArray(data?.items) ? data.items : [],
    };
  } catch {
    return { connected: false, items: [], error: '서버와 연결하지 못했습니다.' };
  }
}

export async function submitGalleryItem(input: GalleryInput): Promise<{
  connected: boolean;
  ok: boolean;
  item?: GalleryItem;
  error?: string;
}> {
  try {
    const res = await fetch('/api/gallery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(input),
    });
    if (!isJsonResponse(res)) {
      return {
        connected: false,
        ok: false,
        error: '저장 준비 중: /api 데이터 저장소가 연결되지 않아 등록되지 않았습니다.',
      };
    }
    const data = await res.json();
    if (!res.ok || !data?.item) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '갤러리 등록에 실패했습니다.',
      };
    }
    return { connected: true, ok: true, item: data.item };
  } catch {
    return {
      connected: false,
      ok: false,
      error: '저장 준비 중: 서버와 통신하지 못해 등록되지 않았습니다.',
    };
  }
}

export async function fetchTeacherGallery(): Promise<{
  connected: boolean;
  unauthorized?: boolean;
  items: GalleryItem[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/teacher/gallery', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { connected: false, items: [] };
    }
    const data = await res.json();
    if (res.status === 401) {
      return {
        connected: true,
        unauthorized: true,
        items: [],
        error: typeof data?.error === 'string' ? data.error : '교사 로그인이 필요합니다.',
      };
    }
    if (!res.ok) {
      return {
        connected: true,
        items: [],
        error: typeof data?.error === 'string' ? data.error : '갤러리 신청 목록을 불러오지 못했습니다.',
      };
    }
    return {
      connected: true,
      items: Array.isArray(data?.items) ? data.items : [],
    };
  } catch {
    return { connected: false, items: [], error: '서버와 연결하지 못했습니다.' };
  }
}

export async function updateTeacherGalleryStatus(
  id: string,
  status: GalleryStatus,
): Promise<{
  connected: boolean;
  ok: boolean;
  unauthorized?: boolean;
  item?: GalleryItem;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/teacher/gallery/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ status }),
    });
    if (!isJsonResponse(res)) {
      return { connected: false, ok: false, error: '인증/저장 서버(/api)에 연결되지 않았습니다.' };
    }
    const data = await res.json();
    if (res.status === 401) {
      return { connected: true, ok: false, unauthorized: true, error: '교사 세션이 만료되었습니다.' };
    }
    if (!res.ok || !data?.item) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '상태 변경에 실패했습니다.',
      };
    }
    return { connected: true, ok: true, item: data.item };
  } catch {
    return { connected: false, ok: false, error: '서버와 통신하지 못했습니다.' };
  }
}

export async function deleteTeacherGalleryItem(id: string): Promise<{
  connected: boolean;
  ok: boolean;
  unauthorized?: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/teacher/gallery/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { connected: false, ok: false, error: '인증/저장 서버(/api)에 연결되지 않았습니다.' };
    }
    const data = await res.json();
    if (res.status === 401) {
      return { connected: true, ok: false, unauthorized: true, error: '교사 세션이 만료되었습니다.' };
    }
    if (!res.ok) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '삭제에 실패했습니다.',
      };
    }
    return { connected: true, ok: true };
  } catch {
    return { connected: false, ok: false, error: '서버와 통신하지 못했습니다.' };
  }
}

export async function submitRevisionToApi(input: AppRevisionInput): Promise<{
  connected: boolean;
  ok: boolean;
  revision?: AppRevisionSubmission;
  error?: string;
}> {
  try {
    const res = await fetch('/api/revisions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(input),
    });
    if (!isJsonResponse(res)) {
      return {
        connected: false,
        ok: false,
        error: '저장 준비 중: /api 데이터 저장소가 연결되지 않아 서버에 저장되지 않았습니다.',
      };
    }
    const data = await res.json();
    if (!res.ok || !data?.revision) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '3차시 수정 기록 저장에 실패했습니다.',
      };
    }
    return { connected: true, ok: true, revision: data.revision };
  } catch {
    return {
      connected: false,
      ok: false,
      error: '저장 준비 중: 서버와 통신하지 못해 저장되지 않았습니다.',
    };
  }
}

export async function fetchTeacherRevisions(): Promise<{
  connected: boolean;
  unauthorized?: boolean;
  revisions: AppRevisionSubmission[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/revisions', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { connected: false, revisions: [] };
    }
    const data = await res.json();
    if (res.status === 401) {
      return {
        connected: true,
        unauthorized: true,
        revisions: [],
        error: typeof data?.error === 'string' ? data.error : '교사 로그인이 필요합니다.',
      };
    }
    if (!res.ok) {
      return {
        connected: true,
        revisions: [],
        error: typeof data?.error === 'string' ? data.error : '3차시 수정하기 목록을 불러오지 못했습니다.',
      };
    }
    return {
      connected: true,
      revisions: Array.isArray(data?.revisions) ? data.revisions : [],
    };
  } catch {
    return { connected: false, revisions: [], error: '서버와 연결하지 못했습니다.' };
  }
}

export async function saveTeacherRevisionReviewToApi(
  id: string,
  reviewStatus: RevisionReviewStatus,
  teacherNote: string,
): Promise<{
  connected: boolean;
  ok: boolean;
  unauthorized?: boolean;
  revision?: AppRevisionSubmission;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/revisions/${encodeURIComponent(id)}/review`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ reviewStatus, teacherNote }),
    });
    if (!isJsonResponse(res)) {
      return { connected: false, ok: false, error: '인증/저장 서버(/api)에 연결되지 않았습니다.' };
    }
    const data = await res.json();
    if (res.status === 401) {
      return { connected: true, ok: false, unauthorized: true, error: '교사 세션이 만료되었습니다.' };
    }
    if (!res.ok || !data?.revision) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '교사 확인 저장에 실패했습니다.',
      };
    }
    return { connected: true, ok: true, revision: data.revision };
  } catch {
    return { connected: false, ok: false, error: '서버와 통신하지 못했습니다.' };
  }
}

export async function deleteRevisionFromApi(id: string): Promise<{
  connected: boolean;
  ok: boolean;
  unauthorized?: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/revisions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { connected: false, ok: false, error: '인증/저장 서버(/api)에 연결되지 않았습니다.' };
    }
    const data = await res.json();
    if (res.status === 401) {
      return { connected: true, ok: false, unauthorized: true, error: '교사 세션이 만료되었습니다.' };
    }
    if (!res.ok) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '삭제에 실패했습니다.',
      };
    }
    return { connected: true, ok: true };
  } catch {
    return { connected: false, ok: false, error: '서버와 통신하지 못했습니다.' };
  }
}

export async function lookupStudentReport(identity: {
  grade: string;
  classRoom: string;
  studentNumber: string;
  studentName: string;
}): Promise<{
  connected: boolean;
  ok: boolean;
  plan?: AppPlanSubmission | null;
  revision?: AppRevisionSubmission | null;
  error?: string;
}> {
  try {
    const res = await fetch('/api/report/lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(identity),
    });
    if (!isJsonResponse(res)) {
      return {
        connected: false,
        ok: false,
        error: '저장 준비 중: /api 데이터 저장소가 연결되지 않아 기존 보고서를 불러올 수 없습니다.',
      };
    }
    const data = await res.json();
    if (!res.ok) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '보고서를 조회하지 못했습니다.',
      };
    }
    return {
      connected: true,
      ok: true,
      plan: data?.plan ? { ...data.plan, storageState: 'synced' } : null,
      revision: data?.revision ?? null,
    };
  } catch {
    return {
      connected: false,
      ok: false,
      error: '서버와 통신하지 못해 보고서를 불러오지 못했습니다.',
    };
  }
}

export async function updatePlanReportInApi(params: {
  planId: string;
  lookup: { grade: string; classRoom: string; studentNumber: string; studentName: string };
  plan: AppPlanInput & { promptDraft?: string };
}): Promise<{
  connected: boolean;
  ok: boolean;
  plan?: AppPlanSubmission;
  error?: string;
}> {
  try {
    const res = await fetch('/api/report/plan', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(params),
    });
    if (!isJsonResponse(res)) {
      return {
        connected: false,
        ok: false,
        error: '저장 준비 중: /api 데이터 저장소가 연결되지 않아 수정 내용이 저장되지 않았습니다.',
      };
    }
    const data = await res.json();
    if (!res.ok || !data?.plan) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '기획서 수정 저장에 실패했습니다.',
      };
    }
    return {
      connected: true,
      ok: true,
      plan: { ...data.plan, storageState: 'synced' },
    };
  } catch {
    return {
      connected: false,
      ok: false,
      error: '서버와 통신하지 못해 수정 내용이 저장되지 않았습니다.',
    };
  }
}

export async function updateFullReportInApi(params: {
  planId: string | null;
  revisionId: string | null;
  lookup: { grade: string; classRoom: string; studentNumber: string; studentName: string };
  plan: AppPlanInput & { promptDraft?: string };
  revision: AppRevisionInput;
}): Promise<{
  connected: boolean;
  ok: boolean;
  plan?: AppPlanSubmission | null;
  revision?: AppRevisionSubmission | null;
  error?: string;
}> {
  try {
    const res = await fetch('/api/report', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(params),
    });
    if (!isJsonResponse(res)) {
      return {
        connected: false,
        ok: false,
        error: '저장 준비 중: /api 데이터 저장소가 연결되지 않아 보고서를 갱신할 수 없습니다.',
      };
    }
    const data = await res.json();
    if (!res.ok || !data?.revision) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '보고서 수정 저장에 실패했습니다.',
      };
    }
    return {
      connected: true,
      ok: true,
      plan: data?.plan ? { ...data.plan, storageState: 'synced' } : null,
      revision: data.revision,
    };
  } catch {
    return {
      connected: false,
      ok: false,
      error: '서버와 통신하지 못해 보고서 수정 저장에 실패했습니다.',
    };
  }
}

export async function fetchTeacherEvaluations(): Promise<{
  connected: boolean;
  unauthorized?: boolean;
  evaluations: StageEvaluation[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/teacher/evaluations', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!isJsonResponse(res)) {
      return { connected: false, evaluations: [] };
    }
    const data = await res.json();
    if (res.status === 401) {
      return {
        connected: true,
        unauthorized: true,
        evaluations: [],
        error: typeof data?.error === 'string' ? data.error : '교사 로그인이 필요합니다.',
      };
    }
    if (!res.ok) {
      return {
        connected: true,
        evaluations: [],
        error: typeof data?.error === 'string' ? data.error : '단계별 평가 목록을 불러오지 못했습니다.',
      };
    }
    return {
      connected: true,
      evaluations: Array.isArray(data?.evaluations) ? data.evaluations : [],
    };
  } catch {
    return { connected: false, evaluations: [], error: '서버와 연결하지 못했습니다.' };
  }
}

export async function saveStageEvaluationToApi(params: {
  studentKey: string;
  stage: EvaluationStage;
  rubric: RubricLevel;
  note: string;
  planId?: string | null;
  revisionId?: string | null;
}): Promise<{
  connected: boolean;
  ok: boolean;
  unauthorized?: boolean;
  evaluation?: StageEvaluation;
  error?: string;
}> {
  try {
    const res = await fetch('/api/teacher/evaluations', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(params),
    });
    if (!isJsonResponse(res)) {
      return { connected: false, ok: false, error: '인증/저장 서버(/api)에 연결되지 않았습니다.' };
    }
    const data = await res.json();
    if (res.status === 401) {
      return { connected: true, ok: false, unauthorized: true, error: '교사 세션이 만료되었습니다.' };
    }
    if (!res.ok || !data?.evaluation) {
      return {
        connected: true,
        ok: false,
        error: typeof data?.error === 'string' ? data.error : '단계별 평가 저장에 실패했습니다.',
      };
    }
    return { connected: true, ok: true, evaluation: data.evaluation };
  } catch {
    return { connected: false, ok: false, error: '서버와 통신하지 못했습니다.' };
  }
}

