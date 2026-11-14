import type { AppPlanInput, AppPlanSubmission, RubricLevel } from '../types/lesson';

export interface ApiListResult {
  connected: boolean;
  plans: AppPlanSubmission[];
}

export interface ApiWriteResult {
  connected: boolean;
  plan: AppPlanSubmission;
}

function isJsonResponse(res: Response): boolean {
  const contentType = res.headers.get('content-type') || '';
  return contentType.toLowerCase().includes('application/json');
}

/**
 * Same-origin /api/plans client designed for Cloudflare Workers + D1.
 * When /api is not yet mounted (e.g. static Vite preview before 3rd-period D1 setup),
 * returns connected: false so the UI accurately displays "저장 준비 중".
 */
export async function fetchPlansFromApi(): Promise<ApiListResult> {
  try {
    const res = await fetch('/api/plans', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok || !isJsonResponse(res)) {
      return { connected: false, plans: [] };
    }
    const data = await res.json();
    const list: AppPlanSubmission[] = Array.isArray(data?.plans)
      ? data.plans.map((p: AppPlanSubmission) => ({ ...p, storageState: 'synced' }))
      : [];
    return { connected: true, plans: list };
  } catch {
    return { connected: false, plans: [] };
  }
}

export async function submitPlanToApi(
  input: AppPlanInput,
  existingId?: string | null,
): Promise<ApiWriteResult> {
  const now = new Date().toISOString();
  const localDraft: AppPlanSubmission = {
    id: existingId || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...input,
    rubricLevel: '미확인',
    teacherNote: '',
    storageState: 'pending_local',
    createdAt: now,
    updatedAt: now,
  };

  try {
    const endpoint = existingId ? `/api/plans/${encodeURIComponent(existingId)}` : '/api/plans';
    const method = existingId ? 'PUT' : 'POST';

    const res = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!res.ok || !isJsonResponse(res)) {
      return { connected: false, plan: localDraft };
    }

    const data = await res.json();
    if (!data?.plan) {
      return { connected: false, plan: localDraft };
    }

    return {
      connected: true,
      plan: { ...data.plan, storageState: 'synced' },
    };
  } catch {
    return { connected: false, plan: localDraft };
  }
}

export async function saveTeacherReviewToApi(
  id: string,
  rubricLevel: RubricLevel,
  teacherNote: string,
): Promise<{ connected: boolean; plan?: AppPlanSubmission }> {
  try {
    const res = await fetch(`/api/plans/${encodeURIComponent(id)}/review`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ rubricLevel, teacherNote }),
    });

    if (!res.ok || !isJsonResponse(res)) {
      return { connected: false };
    }

    const data = await res.json();
    return {
      connected: true,
      plan: data?.plan ? { ...data.plan, storageState: 'synced' } : undefined,
    };
  } catch {
    return { connected: false };
  }
}

export async function deletePlanFromApi(id: string): Promise<{ connected: boolean }> {
  try {
    const res = await fetch(`/api/plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok || !isJsonResponse(res)) {
      return { connected: false };
    }
    return { connected: true };
  } catch {
    return { connected: false };
  }
}
