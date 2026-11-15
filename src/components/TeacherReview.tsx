import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Clock, Download, ExternalLink, Lock, LogOut, RefreshCw, Search, Trash2, X, ZoomIn } from 'lucide-react';
import type {
  AppPlanSubmission,
  AppRevisionSubmission,
  GalleryItem,
  GalleryStatus,
  RevisionReviewStatus,
  RubricLevel,
} from '../types/lesson';
import {
  deletePlanFromApi,
  deleteRevisionFromApi,
  deleteTeacherGalleryItem,
  loginTeacher,
  logoutTeacher,
  saveTeacherReviewToApi,
  saveTeacherRevisionReviewToApi,
  updateTeacherGalleryStatus,
  type BackendMode,
} from '../services/planApi';
import { buildPromptDraft } from '../utils/promptDraft';
import { parseCodeChanges } from '../utils/revisionCodeBlocks';

const RUBRIC_DESCRIPTIONS: { level: Exclude<RubricLevel, '미확인'>; desc: string }[] = [
  {
    level: '상',
    desc: '일상생활 속 문제 상황과 연계하여 웹앱의 화면 구성과 필요한 프로그래밍 원리를 체계적으로 분석하여 설명함.',
  },
  {
    level: '중',
    desc: '주어진 문제 상황에 맞추어 웹앱의 화면 구성과 프로그래밍 요소를 파악하여 제시함.',
  },
  {
    level: '하',
    desc: '안내된 양식에 따라 웹앱의 화면 구성 요소를 나열함.',
  },
];

function escapeCsvCell(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

function formatAuthorLabel(plan: { grade: string; classRoom: string; studentName: string }): string {
  const g = plan.grade.trim();
  const c = plan.classRoom.trim();
  const n = plan.studentName.trim();
  const gradeText = g ? (g.endsWith('학년') ? g : `${g}학년`) : '';
  const classText = c ? (c.endsWith('반') ? c : `${c}반`) : '';
  return [gradeText, classText, n].filter(Boolean).join(' ');
}

interface TeacherReviewProps {
  backendMode: BackendMode;
  authenticated: boolean;
  plans: AppPlanSubmission[];
  revisions: AppRevisionSubmission[];
  galleryItems: GalleryItem[];
  loading: boolean;
  authError: string | null;
  onAuthenticated: () => void;
  onLoggedOut: () => void;
  onRefresh: () => void;
  onUpdatePlan: (updated: AppPlanSubmission) => void;
  onRemovePlan: (id: string) => void;
  onUpdateRevision: (updated: AppRevisionSubmission) => void;
  onRemoveRevision: (id: string) => void;
  onUpdateGalleryItem: (updated: GalleryItem) => void;
  onRemoveGalleryItem: (id: string) => void;
}

type TeacherTab = 'plans' | 'revisions' | 'gallery';

const GALLERY_STATUS_META: Record<GalleryStatus, { label: string; textClass: string }> = {
  pending: { label: '승인 대기', textClass: 'text-amber-700' },
  approved: { label: '게시 완료', textClass: 'text-emerald-700' },
  rejected: { label: '보류', textClass: 'text-slate-500' },
};

export default function TeacherReview({
  backendMode,
  authenticated,
  plans,
  revisions,
  galleryItems,
  loading,
  authError,
  onAuthenticated,
  onLoggedOut,
  onRefresh,
  onUpdatePlan,
  onRemovePlan,
  onUpdateRevision,
  onRemoveRevision,
  onUpdateGalleryItem,
  onRemoveGalleryItem,
}: TeacherReviewProps) {
  const [activeTab, setActiveTab] = useState<TeacherTab>('plans');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('전체');

  const [rubricDraft, setRubricDraft] = useState<RubricLevel>('미확인');
  const [noteDraft, setNoteDraft] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [revisionSearch, setRevisionSearch] = useState('');
  const [revisionStatusFilter, setRevisionStatusFilter] = useState<'all' | RevisionReviewStatus>('all');
  const [revisionStatusDraft, setRevisionStatusDraft] = useState<RevisionReviewStatus>('미확인');
  const [revisionNoteDraft, setRevisionNoteDraft] = useState('');
  const [savingRevisionReview, setSavingRevisionReview] = useState(false);
  const [revisionNotice, setRevisionNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDeleteRevisionId, setConfirmDeleteRevisionId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ label: string; src: string } | null>(null);

  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryStatusFilter, setGalleryStatusFilter] = useState<'all' | GalleryStatus>('all');
  const [busyGalleryId, setBusyGalleryId] = useState<string | null>(null);
  const [confirmDeleteGalleryId, setConfirmDeleteGalleryId] = useState<string | null>(null);
  const [galleryNotice, setGalleryNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plans.filter((p) => {
      const matchesSource = sourceFilter === '전체' || p.discoverySource === sourceFilter;
      const authorText = formatAuthorLabel(p).toLowerCase();
      const matchesQuery =
        !q ||
        authorText.includes(q) ||
        p.studentName.toLowerCase().includes(q) ||
        p.problemSummary.toLowerCase().includes(q) ||
        p.featuresToImplement.toLowerCase().includes(q);
      return matchesSource && matchesQuery;
    });
  }, [plans, searchQuery, sourceFilter]);

  const selectedPlan = useMemo(() => {
    if (selectedId) {
      const exact = filteredPlans.find((p) => p.id === selectedId);
      if (exact) return exact;
    }
    return filteredPlans[0] ?? null;
  }, [filteredPlans, selectedId]);

  useEffect(() => {
    if (selectedPlan) {
      setRubricDraft(selectedPlan.rubricLevel);
      setNoteDraft(selectedPlan.teacherNote);
      setReviewNotice(null);
      setConfirmDeleteId(null);
    }
  }, [selectedPlan]);

  const filteredRevisions = useMemo(() => {
    const q = revisionSearch.trim().toLowerCase();
    return revisions.filter((rev) => {
      const matchesStatus = revisionStatusFilter === 'all' || rev.reviewStatus === revisionStatusFilter;
      const authorText = formatAuthorLabel(rev).toLowerCase();
      const matchesQuery =
        !q ||
        authorText.includes(q) ||
        rev.studentName.toLowerCase().includes(q) ||
        rev.beforeCode.toLowerCase().includes(q) ||
        rev.afterCode.toLowerCase().includes(q) ||
        rev.reasonAndResult.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [revisions, revisionSearch, revisionStatusFilter]);

  const selectedRevision = useMemo(() => {
    if (selectedRevisionId) {
      const exact = filteredRevisions.find((r) => r.id === selectedRevisionId);
      if (exact) return exact;
    }
    return filteredRevisions[0] ?? null;
  }, [filteredRevisions, selectedRevisionId]);

  useEffect(() => {
    if (selectedRevision) {
      setRevisionStatusDraft(selectedRevision.reviewStatus);
      setRevisionNoteDraft(selectedRevision.teacherNote);
      setRevisionNotice(null);
      setConfirmDeleteRevisionId(null);
    }
  }, [selectedRevision]);

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    if (!password.trim()) {
      setLoginError('교사 비밀번호를 입력해 주세요.');
      return;
    }

    setLoggingIn(true);
    try {
      const res = await loginTeacher(password);
      if (res.authenticated) {
        setPassword('');
        onAuthenticated();
      } else {
        setLoginError(res.error || '로그인에 실패했습니다.');
      }
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await logoutTeacher();
    onLoggedOut();
  }

  async function handleSaveReview() {
    if (!selectedPlan) return;
    setSavingReview(true);
    setReviewNotice(null);

    try {
      const res = await saveTeacherReviewToApi(selectedPlan.id, rubricDraft, noteDraft);
      if (res.unauthorized) {
        onLoggedOut();
        return;
      }
      if (res.ok && res.plan) {
        onUpdatePlan(res.plan);
        setReviewNotice({ kind: 'ok', text: '교사 확인 내용이 D1 저장소에 반영되었습니다.' });
      } else {
        setReviewNotice({ kind: 'err', text: res.error || '평가 확인 저장에 실패했습니다.' });
      }
    } finally {
      setSavingReview(false);
    }
  }

  async function handleDeletePlan(id: string) {
    const res = await deletePlanFromApi(id);
    if (res.unauthorized) {
      onLoggedOut();
      return;
    }
    if (res.ok) {
      onRemovePlan(id);
      setConfirmDeleteId(null);
      setSelectedId(null);
    } else {
      setReviewNotice({ kind: 'err', text: res.error || '응답 삭제에 실패했습니다.' });
    }
  }

  async function handleSaveRevisionReview() {
    if (!selectedRevision) return;
    setSavingRevisionReview(true);
    setRevisionNotice(null);

    try {
      const res = await saveTeacherRevisionReviewToApi(
        selectedRevision.id,
        revisionStatusDraft,
        revisionNoteDraft,
      );
      if (res.unauthorized) {
        onLoggedOut();
        return;
      }
      if (res.ok && res.revision) {
        onUpdateRevision(res.revision);
        setRevisionNotice({ kind: 'ok', text: '3차시 수정하기 교사 확인 내용이 D1 저장소에 반영되었습니다.' });
      } else {
        setRevisionNotice({ kind: 'err', text: res.error || '교사 확인 저장에 실패했습니다.' });
      }
    } finally {
      setSavingRevisionReview(false);
    }
  }

  async function handleDeleteRevision(id: string) {
    const res = await deleteRevisionFromApi(id);
    if (res.unauthorized) {
      onLoggedOut();
      return;
    }
    if (res.ok) {
      onRemoveRevision(id);
      setConfirmDeleteRevisionId(null);
      setSelectedRevisionId(null);
    } else {
      setRevisionNotice({ kind: 'err', text: res.error || '수정하기 기록 삭제에 실패했습니다.' });
    }
  }

  async function handleGalleryStatusChange(id: string, nextStatus: GalleryStatus) {
    setBusyGalleryId(id);
    setGalleryNotice(null);
    try {
      const res = await updateTeacherGalleryStatus(id, nextStatus);
      if (res.unauthorized) {
        onLoggedOut();
        return;
      }
      if (res.ok && res.item) {
        onUpdateGalleryItem(res.item);
        const statusMsg =
          nextStatus === 'approved'
            ? '갤러리 게시가 승인되었습니다.'
            : nextStatus === 'rejected'
              ? '해당 항목을 보류 처리했습니다.'
              : '해당 항목을 승인 대기 상태로 전환했습니다.';
        setGalleryNotice({ kind: 'ok', text: statusMsg });
      } else {
        setGalleryNotice({ kind: 'err', text: res.error || '상태 변경에 실패했습니다.' });
      }
    } finally {
      setBusyGalleryId(null);
    }
  }

  async function handleDeleteGalleryItem(id: string) {
    setBusyGalleryId(id);
    setGalleryNotice(null);
    try {
      const res = await deleteTeacherGalleryItem(id);
      if (res.unauthorized) {
        onLoggedOut();
        return;
      }
      if (res.ok) {
        onRemoveGalleryItem(id);
        setConfirmDeleteGalleryId(null);
        setGalleryNotice({ kind: 'ok', text: '갤러리 신청 항목을 삭제했습니다.' });
      } else {
        setGalleryNotice({ kind: 'err', text: res.error || '항목 삭제에 실패했습니다.' });
      }
    } finally {
      setBusyGalleryId(null);
    }
  }

  const filteredGalleryItems = useMemo(() => {
    const q = gallerySearch.trim().toLowerCase();
    return galleryItems.filter((item) => {
      const matchesStatus = galleryStatusFilter === 'all' || item.status === galleryStatusFilter;
      const matchesQuery =
        !q ||
        item.studentId.toLowerCase().includes(q) ||
        item.studentName.toLowerCase().includes(q) ||
        item.intro.toLowerCase().includes(q) ||
        item.appUrl.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [galleryItems, gallerySearch, galleryStatusFilter]);

  function handleExportCsv() {
    const headers = [
      '학년',
      '반',
      '성명',
      '탐색 경로',
      '선정한 실생활 문제',
      '시급성 이유',
      '공공의 이익 이유',
      '탐구 질문',
      '웹앱 화면 구성',
      '구현할 기능',
      '저장할 데이터',
      '제약사항',
      '적용할 프로그래밍 원리',
      '사용할 프롬프트 초안',
      '프롬프트 완성본',
      '안전 약속 확인',
      '평가 확인(상/중/하)',
      '교사 메모',
      '작성 시각',
    ];
    const rows = plans.map((p) => [
      p.grade,
      p.classRoom,
      p.studentName,
      p.discoverySource,
      p.problemSummary,
      p.urgencyReason,
      p.publicBenefitReason,
      p.inquiryQuestion,
      p.screenComposition,
      p.featuresToImplement,
      p.dataToStore,
      p.constraints,
      p.programmingPrinciples,
      p.promptDraft?.trim() || buildPromptDraft(p),
      p.finalPrompt || '',
      p.safetyChecked ? '확인' : '미확인',
      p.rubricLevel,
      p.teacherNote,
      new Date(p.updatedAt).toLocaleString('ko-KR'),
    ]);

    const csvContent =
      '\uFEFF' + [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `2차시_앱기획서_확인목록_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleExportRevisionsCsv() {
    const headers = [
      '학년',
      '반',
      '성명',
      '수정 전 코드',
      '수정 후 코드',
      '수정 이유 및 적용 결과',
      '첫 화면 캡처 첨부',
      '수정 후 화면 캡처 첨부',
      '확인 상태',
      '교사 피드백',
      '작성 시각',
    ];
    const rows = revisions.map((r) => [
      r.grade,
      r.classRoom,
      r.studentName,
      r.beforeCode,
      r.afterCode,
      r.reasonAndResult,
      r.beforeImage ? '첨부됨' : '미첨부',
      r.afterImage ? '첨부됨' : '미첨부',
      r.reviewStatus,
      r.teacherNote,
      new Date(r.updatedAt).toLocaleString('ko-KR'),
    ]);

    const csvContent =
      '\uFEFF' + [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `3차시_수정하기_확인목록_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const reviewedCount = plans.filter((p) => p.rubricLevel !== '미확인').length;
  const reviewedRevisionsCount = revisions.filter((r) => r.reviewStatus !== '미확인').length;
  const pendingGalleryCount = galleryItems.filter((g) => g.status === 'pending').length;
  const approvedGalleryCount = galleryItems.filter((g) => g.status === 'approved').length;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono-tabular text-xs font-semibold text-slate-600">
            <span className="text-blue-700">교사확인 · 평가 및 갤러리 인증</span>
            <span aria-hidden="true">·</span>
            <span>
              {backendMode === 'checking'
                ? '연결 확인 중'
                : backendMode === 'ready'
                  ? 'D1 저장소 연결됨 (/api)'
                  : backendMode === 'db_uninitialized'
                    ? 'D1 테이블 미생성 (setup.sql 필요)'
                    : '저장 준비 중 (/api 미연결)'}
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            교사 확인 및 갤러리 인증 관리
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            교사 로그인 후 2차시 앱 기획서·프롬프트 완성본과 3차시 수정하기 기록(캡처 화면·수정 코드·적용 결과)을 열람하고, 갤러리 작품을 인증할 수 있습니다.
          </p>
        </div>

        {authenticated && (
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
            >
              <RefreshCw className="h-4 w-4" />
              <span>응답 새로고침</span>
            </button>

            {activeTab === 'plans' && (
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={plans.length === 0}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
              >
                <Download className="h-4 w-4" />
                <span>CSV 내보내기</span>
              </button>
            )}

            {activeTab === 'revisions' && (
              <button
                type="button"
                onClick={handleExportRevisionsCsv}
                disabled={revisions.length === 0}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
              >
                <Download className="h-4 w-4" />
                <span>CSV 내보내기</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
            >
              <LogOut className="h-4 w-4" />
              <span>로그아웃</span>
            </button>
          </div>
        )}
      </div>

      {backendMode !== 'ready' && backendMode !== 'checking' && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 sm:text-sm">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              {backendMode === 'db_uninitialized' ? (
                <>
                  <strong className="font-semibold">D1 데이터베이스 테이블 미생성</strong> — Cloudflare D1 Console에서
                  `setup.sql`을 실행한 뒤 다시 확인해 주세요.
                </>
              ) : (
                <>
                  <strong className="font-semibold">저장 준비 중 (/api 미연결)</strong> — 현재 Preview 환경에는
                  Cloudflare Worker와 `TEACHER_PASSWORD` Secret이 연결되어 있지 않습니다. Cloudflare 발행 및 D1·시크릿
                  설정 후 로그인하여 학생 응답을 확인할 수 있습니다.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Teacher Login Panel */}
      {!authenticated ? (
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Lock className="h-4 w-4 text-blue-700 shrink-0" />
            <span>교사 인증 로그인</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            서버에 설정된 <span className="font-mono-tabular font-semibold text-slate-800">TEACHER_PASSWORD</span>{' '}
            비밀번호로 인증하며, 로그인 시 보호된 세션 쿠키(`HttpOnly`)가 발급됩니다.
          </p>

          <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="teacherPassword" className="block text-xs font-medium text-slate-700">
                교사 비밀번호
              </label>
              <input
                id="teacherPassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                placeholder="교사 비밀번호 입력"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>

            {(loginError || authError) && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                {loginError || authError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="min-h-[44px] w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {loggingIn ? '인증 확인 중...' : '로그인'}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              className={`min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${
                activeTab === 'plans'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              2차시 앱 기획서 ({plans.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('revisions')}
              className={`min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${
                activeTab === 'revisions'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              3차시 수정하기 ({revisions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gallery')}
              className={`min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${
                activeTab === 'gallery'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              갤러리 인증 관리 ({galleryItems.length}
              {pendingGalleryCount > 0 ? ` · 대기 ${pendingGalleryCount}` : ''})
            </button>
          </div>

          {authError && (
            <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {authError}
            </div>
          )}

          {activeTab === 'plans' ? (
            <>
              {/* Summary metrics */}
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">제출된 기획서</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">{plans.length}건</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">교사 확인 완료</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">
                    {reviewedCount} / {plans.length}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">최근 제출 시각</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 font-mono-tabular">
                    {plans[0] ? new Date(plans[0].updatedAt).toLocaleString('ko-KR') : '제출 내역 없음'}
                  </div>
                </div>
              </div>

          {/* Search & Filter */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="학년·반·성명, 문제 내용, 기능으로 검색"
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="탐색 경로 필터"
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-700 focus:border-blue-700 focus:outline-none sm:text-sm"
            >
              <option value="전체">탐색 경로: 전체</option>
              <option value="기사">기사</option>
              <option value="주변 지역사회 주민 인터뷰">주변 지역사회 주민 인터뷰</option>
              <option value="가족과의 대화">가족과의 대화</option>
              <option value="친구와의 브레인스토밍">친구와의 브레인스토밍</option>
              <option value="수업 중 학교문제 토론">수업 중 학교문제 토론</option>
              <option value="기타 일상 관찰">기타 일상 관찰</option>
            </select>
          </div>

          {/* Main split */}
          {loading ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              제출된 응답을 불러오는 중입니다...
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center sm:p-12">
              <p className="text-sm font-medium text-slate-800">표시할 앱 기획서 응답이 없습니다.</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                학생이 앱 기획서를 제출하면 이곳에서 바로 조회하고 평가할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start">
              {/* List */}
              <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-4">
                {filteredPlans.map((plan) => {
                  const active = selectedPlan?.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedId(plan.id)}
                      className={`min-h-[60px] w-full px-4 py-3.5 text-left transition-colors cursor-pointer ${
                        active ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {formatAuthorLabel(plan)}
                        </span>
                        <span
                          className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                            plan.rubricLevel === '미확인' ? 'text-slate-400' : 'text-blue-700'
                          }`}
                        >
                          평가: {plan.rubricLevel}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{plan.problemSummary}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono-tabular">
                        <span className="truncate">{plan.discoverySource}</span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(plan.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Detail Inspector */}
              {selectedPlan && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:col-span-8">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{selectedPlan.discoverySource}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          제출 시각 {new Date(selectedPlan.updatedAt).toLocaleString('ko-KR')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{selectedPlan.safetyChecked ? '안전 약속 확인함' : '안전 약속 미확인'}</span>
                      </div>
                      <h2 className="mt-1 text-xl font-bold text-slate-900">
                        {formatAuthorLabel(selectedPlan)}
                      </h2>
                    </div>

                    <div>
                      {confirmDeleteId === selectedPlan.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeletePlan(selectedPlan.id)}
                            className="min-h-[44px] rounded-lg bg-red-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-700 cursor-pointer whitespace-nowrap"
                          >
                            삭제 확인
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(selectedPlan.id)}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:border-red-200 hover:text-red-700 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>삭제</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 space-y-6 text-sm">
                    <div>
                      <h3 className="text-xs font-semibold text-blue-700">1. 선정한 실생활 문제 및 선정 이유</h3>
                      <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-slate-900">
                        {selectedPlan.problemSummary}
                      </p>
                      <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium text-slate-500">시급성</div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                            {selectedPlan.urgencyReason}
                          </p>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">공공의 이익</div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                            {selectedPlan.publicBenefitReason}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-5">
                      <h3 className="text-xs font-semibold text-blue-700">2. 탐구 질문 및 웹앱 화면 구성</h3>
                      <div className="mt-2 space-y-3">
                        <div>
                          <div className="text-xs font-medium text-slate-500">탐구 질문</div>
                          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-900">
                            {selectedPlan.inquiryQuestion}
                          </p>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">웹앱의 화면 구성과 필요 요소</div>
                          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-800">
                            {selectedPlan.screenComposition}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-5">
                      <h3 className="text-xs font-semibold text-blue-700">3. 앱 기획서 핵심 설계</h3>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium text-slate-500">구현할 기능</div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                            {selectedPlan.featuresToImplement}
                          </p>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">저장할 데이터</div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                            {selectedPlan.dataToStore}
                          </p>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">제약사항</div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                            {selectedPlan.constraints}
                          </p>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">적용할 프로그래밍 원리</div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                            {selectedPlan.programmingPrinciples}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-5">
                      <h3 className="text-xs font-semibold text-blue-700">4. 사용할 프롬프트 초안 및 프롬프트 완성본</h3>
                      <div className="mt-3 space-y-4">
                        <div>
                          <div className="text-xs font-medium text-slate-500">사용할 프롬프트 초안</div>
                          <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-sans text-xs leading-relaxed text-slate-700">
                            {selectedPlan.promptDraft?.trim() || buildPromptDraft(selectedPlan)}
                          </pre>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">프롬프트 완성본</div>
                          <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3.5 text-sm leading-relaxed text-slate-900">
                            {selectedPlan.finalPrompt?.trim() || '작성된 프롬프트 완성본이 없습니다.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 평가 요소 ① 확인 기록 */}
                    <div className="border-t border-slate-200 pt-5">
                      <h3 className="text-xs font-semibold text-slate-900">
                        교사 평가 확인 기록 (평가 요소 ①: 웹앱의 화면 구성과 프로그래밍 원리 분석)
                      </h3>

                      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {(['미확인', '상', '중', '하'] as RubricLevel[]).map((level) => {
                          const active = rubricDraft === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setRubricDraft(level)}
                              className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer sm:text-xs ${
                                active
                                  ? 'border-blue-700 bg-blue-700 text-white'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-500">
                        {RUBRIC_DESCRIPTIONS.map((item) => (
                          <div key={item.level}>
                            <span className="font-semibold text-slate-700">{item.level}:</span> {item.desc}
                          </div>
                        ))}
                      </div>

                      <div className="mt-4">
                        <label htmlFor="teacherNote" className="block text-xs font-medium text-slate-700">
                          교사 피드백 메모
                        </label>
                        <textarea
                          id="teacherNote"
                          rows={2}
                          maxLength={1000}
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="2차시 프롬프트 구조화 전 보완할 점이나 피드백을 기록하세요."
                          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                        />
                      </div>

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs">
                          {reviewNotice && (
                            <span
                              className={`inline-flex items-start gap-1.5 ${
                                reviewNotice.kind === 'ok' ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {reviewNotice.kind === 'ok' && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                              <span>{reviewNotice.text}</span>
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveReview}
                          disabled={savingReview}
                          className="min-h-[44px] w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap sm:w-auto"
                        >
                          {savingReview ? '저장 중...' : '확인 결과 저장'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
            </>
          ) : activeTab === 'revisions' ? (
            <>
              {/* 3차시 수정하기 Summary metrics */}
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">제출된 수정 기록</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">{revisions.length}건</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">교사 확인 완료</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">
                    {reviewedRevisionsCount} / {revisions.length}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">최근 제출 시각</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 font-mono-tabular">
                    {revisions[0] ? new Date(revisions[0].updatedAt).toLocaleString('ko-KR') : '제출 내역 없음'}
                  </div>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 sm:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={revisionSearch}
                    onChange={(e) => setRevisionSearch(e.target.value)}
                    placeholder="학년·반·성명, 수정 코드, 이유 및 결과로 검색"
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                  />
                </div>

                <select
                  value={revisionStatusFilter}
                  onChange={(e) => setRevisionStatusFilter(e.target.value as 'all' | RevisionReviewStatus)}
                  aria-label="수정 기록 확인 상태 필터"
                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-700 focus:border-blue-700 focus:outline-none sm:text-sm"
                >
                  <option value="all">확인 상태: 전체</option>
                  <option value="미확인">미확인</option>
                  <option value="확인 완료">확인 완료</option>
                  <option value="보완 필요">보완 필요</option>
                </select>
              </div>

              {loading ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                  3차시 수정하기 기록을 불러오는 중입니다...
                </div>
              ) : filteredRevisions.length === 0 ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center sm:p-12">
                  <p className="text-sm font-medium text-slate-800">표시할 3차시 수정하기 기록이 없습니다.</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    학생이 수정하기 메뉴에서 화면 캡처와 수정 전·후 코드, 수정 이유를 제출하면 이곳에서 바로 확인할 수 있습니다.
                  </p>
                </div>
              ) : (
                <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start">
                  {/* List */}
                  <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-4">
                    {filteredRevisions.map((rev) => {
                      const active = selectedRevision?.id === rev.id;
                      return (
                        <button
                          key={rev.id}
                          type="button"
                          onClick={() => setSelectedRevisionId(rev.id)}
                          className={`min-h-[60px] w-full px-4 py-3.5 text-left transition-colors cursor-pointer ${
                            active ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {formatAuthorLabel(rev)}
                            </span>
                            <span
                              className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                                rev.reviewStatus === '확인 완료'
                                  ? 'text-emerald-700'
                                  : rev.reviewStatus === '보완 필요'
                                    ? 'text-amber-700'
                                    : 'text-slate-400'
                              }`}
                            >
                              {rev.reviewStatus}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                            {rev.reasonAndResult}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono-tabular">
                            <span>전·후 캡처 2장</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {new Date(rev.updatedAt).toLocaleTimeString('ko-KR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Detail Inspector */}
                  {selectedRevision && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:col-span-8">
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>3차시 · 수정하기</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular">
                              제출 시각 {new Date(selectedRevision.updatedAt).toLocaleString('ko-KR')}
                            </span>
                          </div>
                          <h2 className="mt-1 text-xl font-bold text-slate-900">
                            {formatAuthorLabel(selectedRevision)}
                          </h2>
                        </div>

                        <div>
                          {confirmDeleteRevisionId === selectedRevision.id ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDeleteRevision(selectedRevision.id)}
                                className="min-h-[44px] rounded-lg bg-red-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-700 cursor-pointer whitespace-nowrap"
                              >
                                삭제 확인
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRevisionId(null)}
                                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRevisionId(selectedRevision.id)}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:border-red-200 hover:text-red-700 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>삭제</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 space-y-6 text-sm">
                        {/* 1. 수정 전·후 웹앱 화면 캡처 비교 */}
                        <div>
                          <h3 className="text-xs font-semibold text-blue-700">
                            1. 웹앱 화면 변화 비교 (첫 프롬프트 결과 → 수정 후 결과)
                          </h3>
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-700">
                                  첫 프롬프트 결과 완성 화면
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setZoomedImage({
                                      label: `${formatAuthorLabel(selectedRevision)} · 첫 프롬프트 결과 화면`,
                                      src: selectedRevision.beforeImage,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                                >
                                  <ZoomIn className="h-3 w-3" />
                                  <span>크게 보기</span>
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setZoomedImage({
                                    label: `${formatAuthorLabel(selectedRevision)} · 첫 프롬프트 결과 화면`,
                                    src: selectedRevision.beforeImage,
                                  })
                                }
                                className="block w-full overflow-hidden rounded border border-slate-200 bg-white cursor-zoom-in"
                              >
                                <img
                                  src={selectedRevision.beforeImage}
                                  alt="첫 프롬프트 결과 웹앱 화면"
                                  className="h-56 w-full object-contain bg-slate-100"
                                />
                              </button>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-700">
                                  수정 결과 바뀐 웹앱 화면
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setZoomedImage({
                                      label: `${formatAuthorLabel(selectedRevision)} · 수정 결과 바뀐 화면`,
                                      src: selectedRevision.afterImage,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                                >
                                  <ZoomIn className="h-3 w-3" />
                                  <span>크게 보기</span>
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setZoomedImage({
                                    label: `${formatAuthorLabel(selectedRevision)} · 수정 결과 바뀐 화면`,
                                    src: selectedRevision.afterImage,
                                  })
                                }
                                className="block w-full overflow-hidden rounded border border-slate-200 bg-white cursor-zoom-in"
                              >
                                <img
                                  src={selectedRevision.afterImage}
                                  alt="수정 결과 바뀐 웹앱 화면"
                                  className="h-56 w-full object-contain bg-slate-100"
                                />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 2. 내가 직접 수정한 코드 (수정 전 / 수정 후) */}
                        <div className="border-t border-slate-200 pt-5">
                          <h3 className="text-xs font-semibold text-blue-700">
                            2. 내가 직접 수정한 코드 (수정 전 코드 · 수정 후 코드)
                          </h3>
                          {(() => {
                            const pairs = parseCodeChanges(
                              selectedRevision.beforeCode,
                              selectedRevision.afterCode,
                            );
                            return (
                              <div className="mt-3 space-y-4">
                                {pairs.map((pair, idx) => (
                                  <div
                                    key={idx}
                                    className={
                                      pairs.length > 1
                                        ? 'rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5'
                                        : ''
                                    }
                                  >
                                    {pairs.length > 1 && (
                                      <div className="font-mono-tabular text-xs font-bold text-slate-700">
                                        수정 코드 #{idx + 1}
                                      </div>
                                    )}
                                    <div className="grid gap-4 lg:grid-cols-2">
                                      <div>
                                        <div className="mb-1.5 text-xs font-medium text-slate-600">
                                          수정 전 코드
                                        </div>
                                        <pre className="max-h-80 overflow-auto rounded-lg border border-slate-300 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 whitespace-pre-wrap break-words">
                                          {pair.beforeCode}
                                        </pre>
                                      </div>
                                      <div>
                                        <div className="mb-1.5 text-xs font-medium text-slate-600">
                                          수정 후 코드
                                        </div>
                                        <pre className="max-h-80 overflow-auto rounded-lg border border-slate-300 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-emerald-200 whitespace-pre-wrap break-words">
                                          {pair.afterCode}
                                        </pre>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        {/* 3. 해당 코드를 수정한 이유와 적용 결과 */}
                        <div className="border-t border-slate-200 pt-5">
                          <h3 className="text-xs font-semibold text-blue-700">
                            3. 해당 코드를 수정한 이유와 적용 결과
                          </h3>
                          <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-900">
                            {selectedRevision.reasonAndResult}
                          </p>
                        </div>

                        {/* 4. 교사 확인 및 피드백 기록 */}
                        <div className="border-t border-slate-200 pt-5">
                          <h3 className="text-xs font-semibold text-slate-900">
                            교사 확인 기록 (3차시 코드 수정 확인)
                          </h3>

                          <div className="mt-3 grid grid-cols-3 gap-2.5">
                            {(['미확인', '확인 완료', '보완 필요'] as RevisionReviewStatus[]).map((status) => {
                              const active = revisionStatusDraft === status;
                              return (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() => setRevisionStatusDraft(status)}
                                  className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer sm:text-xs ${
                                    active
                                      ? 'border-blue-700 bg-blue-700 text-white'
                                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {status}
                                </button>
                              );
                            })}
                          </div>

                          <div className="mt-4">
                            <label htmlFor="revisionTeacherNote" className="block text-xs font-medium text-slate-700">
                              교사 피드백 메모
                            </label>
                            <textarea
                              id="revisionTeacherNote"
                              rows={2}
                              maxLength={1000}
                              value={revisionNoteDraft}
                              onChange={(e) => setRevisionNoteDraft(e.target.value)}
                              placeholder="직접 수정한 코드와 결과 설명에 대한 교사 피드백을 기록하세요."
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                            />
                          </div>

                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-xs">
                              {revisionNotice && (
                                <span
                                  className={`inline-flex items-start gap-1.5 ${
                                    revisionNotice.kind === 'ok' ? 'text-emerald-700' : 'text-red-700'
                                  }`}
                                >
                                  {revisionNotice.kind === 'ok' && (
                                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  )}
                                  <span>{revisionNotice.text}</span>
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={handleSaveRevisionReview}
                              disabled={savingRevisionReview}
                              className="min-h-[44px] w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap sm:w-auto"
                            >
                              {savingRevisionReview ? '저장 중...' : '확인 결과 저장'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="mt-6">
              {/* Gallery summary metrics */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">전체 등록 신청</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">
                    {galleryItems.length}건
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">승인 대기</div>
                  <div className="mt-1 text-2xl font-bold text-amber-700 font-mono-tabular">
                    {pendingGalleryCount}건
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">갤러리 게시 완료</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-700 font-mono-tabular">
                    {approvedGalleryCount}건
                  </div>
                </div>
              </div>

              {/* Gallery search & filter */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 sm:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={gallerySearch}
                    onChange={(e) => setGallerySearch(e.target.value)}
                    placeholder="학번, 이름(별칭), 소개글, URL로 검색"
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                  />
                </div>

                <select
                  value={galleryStatusFilter}
                  onChange={(e) => setGalleryStatusFilter(e.target.value as 'all' | GalleryStatus)}
                  aria-label="갤러리 인증 상태 필터"
                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-700 focus:border-blue-700 focus:outline-none sm:text-sm"
                >
                  <option value="all">상태: 전체</option>
                  <option value="pending">승인 대기</option>
                  <option value="approved">게시 완료</option>
                  <option value="rejected">보류</option>
                </select>
              </div>

              {galleryNotice && (
                <div
                  role={galleryNotice.kind === 'err' ? 'alert' : 'status'}
                  className={`mt-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-xs sm:text-sm ${
                    galleryNotice.kind === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {galleryNotice.kind === 'ok' && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}
                  <span>{galleryNotice.text}</span>
                </div>
              )}

              {loading ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                  갤러리 신청 목록을 불러오는 중입니다...
                </div>
              ) : filteredGalleryItems.length === 0 ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center sm:p-12">
                  <p className="text-sm font-medium text-slate-800">표시할 갤러리 등록 신청이 없습니다.</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    학생이 갤러리 메뉴에서 본인 웹페이지를 등록하면 이곳에서 인증 및 게시 여부를 결정할 수 있습니다.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {filteredGalleryItems.map((item) => {
                    const statusMeta = GALLERY_STATUS_META[item.status];
                    const busy = busyGalleryId === item.id;
                    return (
                      <article
                        key={item.id}
                        className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className={`font-semibold ${statusMeta.textClass}`}>{statusMeta.label}</span>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="font-mono-tabular font-semibold text-slate-800">{item.studentId}</span>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="font-semibold text-slate-900">{item.studentName}</span>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="font-mono-tabular text-slate-500">
                                {new Date(item.updatedAt).toLocaleString('ko-KR')}
                              </span>
                            </div>

                            <a
                              href={item.appUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline break-all font-mono-tabular"
                            >
                              <span>{item.appUrl}</span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            </a>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {item.status !== 'approved' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleGalleryStatusChange(item.id, 'approved')}
                                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>인증 · 게시</span>
                              </button>
                            )}

                            {item.status !== 'rejected' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleGalleryStatusChange(item.id, 'rejected')}
                                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                보류
                              </button>
                            )}

                            {item.status !== 'pending' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleGalleryStatusChange(item.id, 'pending')}
                                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                대기 전환
                              </button>
                            )}

                            {confirmDeleteGalleryId === item.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDeleteGalleryItem(item.id)}
                                  className="min-h-[44px] rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                >
                                  삭제 확인
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setConfirmDeleteGalleryId(null)}
                                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmDeleteGalleryId(item.id)}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:border-red-200 hover:text-red-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>삭제</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="mt-3.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                          {item.intro}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {zoomedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomedImage.label}
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-700 bg-white"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-bold text-slate-900 truncate">{zoomedImage.label}</span>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
                <span>닫기</span>
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-slate-100 p-4">
              <img
                src={zoomedImage.src}
                alt={zoomedImage.label}
                className="mx-auto max-h-[75vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
