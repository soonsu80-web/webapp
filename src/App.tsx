import { useCallback, useEffect, useState } from 'react';
import LessonOverview from './components/LessonOverview';
import AppPlanForm from './components/AppPlanForm';
import TeacherReview from './components/TeacherReview';
import type { AppPlanSubmission } from './types/lesson';
import { fetchPlansFromApi } from './services/planApi';

type ActiveMode = 'student' | 'teacher';

const SESSION_DRAFTS_KEY = 'vibe_coding_p1_session_drafts';

function loadSessionDrafts(): AppPlanSubmission[] {
  try {
    const raw = window.sessionStorage.getItem(SESSION_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [mode, setMode] = useState<ActiveMode>('student');
  const [storageConnected, setStorageConnected] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<AppPlanSubmission[]>([]);
  const [currentDraft, setCurrentDraft] = useState<AppPlanSubmission | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);

  const syncWithApi = useCallback(async () => {
    setLoadingPlans(true);
    const result = await fetchPlansFromApi();
    setStorageConnected(result.connected);

    if (result.connected) {
      setPlans(result.plans);
    } else {
      const drafts = loadSessionDrafts();
      setPlans(drafts);
      if (drafts.length > 0) {
        setCurrentDraft((prev) => prev ?? drafts[0]);
      }
    }
    setLoadingPlans(false);
  }, []);

  useEffect(() => {
    syncWithApi();
  }, [syncWithApi]);

  function persistSessionDrafts(nextPlans: AppPlanSubmission[]) {
    try {
      const draftsOnly = nextPlans.filter((p) => p.storageState === 'pending_local');
      window.sessionStorage.setItem(SESSION_DRAFTS_KEY, JSON.stringify(draftsOnly));
    } catch {
      // Ignore storage quota issues
    }
  }

  function handlePlanRecorded(plan: AppPlanSubmission, connected: boolean) {
    setStorageConnected(connected);
    setCurrentDraft(plan);
    setPlans((prev) => {
      const exists = prev.some((item) => item.id === plan.id);
      const next = exists ? prev.map((item) => (item.id === plan.id ? plan : item)) : [plan, ...prev];
      if (!connected) {
        persistSessionDrafts(next);
      }
      return next;
    });
  }

  function handleUpdatePlan(updated: AppPlanSubmission) {
    setPlans((prev) => {
      const next = prev.map((item) => (item.id === updated.id ? updated : item));
      if (updated.storageState === 'pending_local') {
        persistSessionDrafts(next);
      }
      return next;
    });
    if (currentDraft?.id === updated.id) {
      setCurrentDraft(updated);
    }
  }

  function handleRemovePlan(id: string) {
    setPlans((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistSessionDrafts(next);
      return next;
    });
    if (currentDraft?.id === id) {
      setCurrentDraft(null);
    }
  }

  function navigateToSection(targetMode: ActiveMode, sectionId?: string) {
    setMode(targetMode);
    if (sectionId) {
      window.requestAnimationFrame(() => {
        const el = document.getElementById(sectionId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-2.5 sm:px-6 sm:py-3">
          {/* Zone 1: Single-element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              navigateToSection('student');
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            바이브 코딩 프로젝트
          </a>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigateToSection('student', 'lesson-overview')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              수업 안내
            </button>
            <button
              type="button"
              onClick={() => navigateToSection('student', 'problem-discovery')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              문제 탐색
            </button>
            <button
              type="button"
              onClick={() => navigateToSection('student', 'app-plan-form')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'student' ? 'text-sky-700 font-semibold' : 'hover:text-slate-900'
              }`}
            >
              앱 기획서
            </button>
            <button
              type="button"
              onClick={() => navigateToSection('teacher')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'teacher' ? 'text-sky-700 font-semibold' : 'hover:text-slate-900'
              }`}
            >
              교사 확인
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            {mode === 'student' ? (
              <button
                type="button"
                onClick={() => navigateToSection('teacher')}
                className="min-h-[40px] rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:px-4"
              >
                교사 확인
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigateToSection('student', 'app-plan-form')}
                className="min-h-[40px] rounded-lg bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:px-4"
              >
                학생 작성
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Non-sticky mobile workspace switcher for easy thumb tap */}
      <div className="border-b border-slate-200 bg-white px-4 py-2 md:hidden">
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode('student')}
            className={`min-h-[44px] flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'student' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            학생 활동 (앱 기획서)
          </button>
          <button
            type="button"
            onClick={() => setMode('teacher')}
            className={`min-h-[44px] flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'teacher' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            교사 확인 ({plans.length})
          </button>
        </div>
      </div>

      <main id="top" className="flex-1">
        {mode === 'student' ? (
          <>
            <LessonOverview />
            <AppPlanForm
              storageConnected={storageConnected}
              currentDraft={currentDraft}
              onPlanRecorded={handlePlanRecorded}
              onResetDraft={() => setCurrentDraft(null)}
            />
          </>
        ) : (
          <TeacherReview
            storageConnected={storageConnected}
            plans={plans}
            loading={loadingPlans}
            onRefresh={syncWithApi}
            onUpdatePlan={handleUpdatePlan}
            onRemovePlan={handleRemovePlan}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-slate-500 sm:px-6">
          <span>코드를 읽고 다시 쓰는 바이브 코딩 프로젝트 · 고등학교 1학년 정보 (1차시)</span>
          <span>
            {storageConnected
              ? '데이터 저장소 연결됨 (/api/plans)'
              : '저장 준비 중 · Cloudflare Workers + D1 연결 예정'}
          </span>
        </div>
      </footer>
    </div>
  );
}
