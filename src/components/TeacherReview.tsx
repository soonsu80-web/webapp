import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Lock,
  LogOut,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
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

function parseNumeric(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(digits, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function normalizeUnit(raw: string, suffix: string): string {
  const trimmed = raw.trim().replace(new RegExp(`${suffix}$`), '').trim();
  return trimmed;
}

function formatGradeText(grade: string): string {
  const g = normalizeUnit(grade, '학년');
  return g ? `${g}학년` : '';
}

function formatClassText(classRoom: string): string {
  const c = normalizeUnit(classRoom, '반');
  return c ? `${c}반` : '';
}

function formatNumberText(studentNumber: string): string {
  const n = normalizeUnit(studentNumber, '번');
  return n ? `${n}번` : '';
}

function buildStudentIdBadge(grade: string, classRoom: string, studentNumber: string): string {
  const numRaw = normalizeUnit(studentNumber, '번');
  if (!numRaw) return '';
  if (numRaw.length >= 4 && /^\d+$/.test(numRaw)) {
    return numRaw;
  }
  const g = normalizeUnit(grade, '학년');
  const c = normalizeUnit(classRoom, '반');
  if (/^\d+$/.test(g) && /^\d+$/.test(c) && /^\d+$/.test(numRaw)) {
    return `${g}${c.padStart(2, '0')}${numRaw.padStart(2, '0')}`;
  }
  return numRaw;
}

function formatFullAuthorLabel(item: {
  grade: string;
  classRoom: string;
  studentNumber: string;
  studentName: string;
}): string {
  return [
    formatGradeText(item.grade),
    formatClassText(item.classRoom),
    formatNumberText(item.studentNumber),
    item.studentName.trim(),
  ]
    .filter(Boolean)
    .join(' ');
}

interface UnifiedStudentPortfolio {
  key: string;
  grade: string;
  classRoom: string;
  studentNumber: string;
  studentName: string;
  classKey: string;
  classLabel: string;
  gradeNum: number;
  classNum: number;
  numberNum: number;
  studentIdBadge: string;
  appTitle: string;
  featuresToImplement: string;
  plan: AppPlanSubmission | null;
  revision: AppRevisionSubmission | null;
  latestUpdatedAt: string;
}

function buildUnifiedPortfolios(
  plans: AppPlanSubmission[],
  revisions: AppRevisionSubmission[],
): UnifiedStudentPortfolio[] {
  const map = new Map<string, UnifiedStudentPortfolio>();

  function getMatchKey(grade: string, classRoom: string, studentName: string): string {
    const g = normalizeUnit(grade, '학년').toLowerCase();
    const c = normalizeUnit(classRoom, '반').toLowerCase();
    const name = studentName.trim().toLowerCase();
    return `${g}__${c}__${name}`;
  }

  for (const plan of plans) {
    const key = getMatchKey(plan.grade, plan.classRoom, plan.studentName);
    const existing = map.get(key);
    const gNum = parseNumeric(plan.grade);
    const cNum = parseNumeric(plan.classRoom);
    const nNum = parseNumeric(plan.studentNumber);
    const classKey = `${normalizeUnit(plan.grade, '학년')}-${normalizeUnit(plan.classRoom, '반')}`;
    const classLabel = [formatGradeText(plan.grade), formatClassText(plan.classRoom)].filter(Boolean).join(' ') || '반 미지정';

    if (!existing) {
      map.set(key, {
        key,
        grade: plan.grade,
        classRoom: plan.classRoom,
        studentNumber: plan.studentNumber,
        studentName: plan.studentName,
        classKey,
        classLabel,
        gradeNum: gNum,
        classNum: cNum,
        numberNum: nNum,
        studentIdBadge: buildStudentIdBadge(plan.grade, plan.classRoom, plan.studentNumber),
        appTitle: plan.appTitle?.trim() || '',
        featuresToImplement: plan.featuresToImplement?.trim() || '',
        plan,
        revision: null,
        latestUpdatedAt: plan.updatedAt,
      });
    } else if (!existing.plan || plan.updatedAt > existing.plan.updatedAt) {
      existing.plan = plan;
      if (plan.studentNumber && !existing.studentNumber) {
        existing.studentNumber = plan.studentNumber;
        existing.numberNum = nNum;
        existing.studentIdBadge = buildStudentIdBadge(plan.grade, plan.classRoom, plan.studentNumber);
      }
      if (plan.appTitle?.trim()) existing.appTitle = plan.appTitle.trim();
      if (plan.featuresToImplement?.trim()) existing.featuresToImplement = plan.featuresToImplement.trim();
      if (plan.updatedAt > existing.latestUpdatedAt) existing.latestUpdatedAt = plan.updatedAt;
    }
  }

  for (const rev of revisions) {
    const key = getMatchKey(rev.grade, rev.classRoom, rev.studentName);
    const existing = map.get(key);
    const gNum = parseNumeric(rev.grade);
    const cNum = parseNumeric(rev.classRoom);
    const nNum = parseNumeric(rev.studentNumber);
    const classKey = `${normalizeUnit(rev.grade, '학년')}-${normalizeUnit(rev.classRoom, '반')}`;
    const classLabel = [formatGradeText(rev.grade), formatClassText(rev.classRoom)].filter(Boolean).join(' ') || '반 미지정';

    if (!existing) {
      map.set(key, {
        key,
        grade: rev.grade,
        classRoom: rev.classRoom,
        studentNumber: rev.studentNumber,
        studentName: rev.studentName,
        classKey,
        classLabel,
        gradeNum: gNum,
        classNum: cNum,
        numberNum: nNum,
        studentIdBadge: buildStudentIdBadge(rev.grade, rev.classRoom, rev.studentNumber),
        appTitle: '',
        featuresToImplement: '',
        plan: null,
        revision: rev,
        latestUpdatedAt: rev.updatedAt,
      });
    } else {
      if (!existing.revision || rev.updatedAt > existing.revision.updatedAt) {
        existing.revision = rev;
      }
      if (!existing.studentNumber && rev.studentNumber) {
        existing.studentNumber = rev.studentNumber;
        existing.numberNum = nNum;
        existing.studentIdBadge = buildStudentIdBadge(existing.grade, existing.classRoom, rev.studentNumber);
      }
      if (rev.updatedAt > existing.latestUpdatedAt) {
        existing.latestUpdatedAt = rev.updatedAt;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.gradeNum !== b.gradeNum) return a.gradeNum - b.gradeNum;
    if (a.classNum !== b.classNum) return a.classNum - b.classNum;
    if (a.numberNum !== b.numberNum) return a.numberNum - b.numberNum;
    return a.studentName.localeCompare(b.studentName, 'ko-KR');
  });
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

type TeacherTab = 'portfolio' | 'gallery';

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
  const [activeTab, setActiveTab] = useState<TeacherTab>('portfolio');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [selectedClassKey, setSelectedClassKey] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null);

  const [rubricDraft, setRubricDraft] = useState<RubricLevel>('미확인');
  const [noteDraft, setNoteDraft] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);

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

  const portfolios = useMemo(() => buildUnifiedPortfolios(plans, revisions), [plans, revisions]);

  const classOptions = useMemo(() => {
    const map = new Map<
      string,
      { classKey: string; classLabel: string; gradeNum: number; classNum: number; count: number }
    >();
    for (const p of portfolios) {
      const prev = map.get(p.classKey);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(p.classKey, {
          classKey: p.classKey,
          classLabel: p.classLabel,
          gradeNum: p.gradeNum,
          classNum: p.classNum,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.gradeNum !== b.gradeNum) return a.gradeNum - b.gradeNum;
      return a.classNum - b.classNum;
    });
  }, [portfolios]);

  const filteredPortfolios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return portfolios.filter((p) => {
      const matchesClass = selectedClassKey === 'all' || p.classKey === selectedClassKey;
      const authorText = formatFullAuthorLabel(p).toLowerCase();
      const matchesQuery =
        !q ||
        authorText.includes(q) ||
        p.studentIdBadge.toLowerCase().includes(q) ||
        p.studentName.toLowerCase().includes(q) ||
        p.appTitle.toLowerCase().includes(q) ||
        p.featuresToImplement.toLowerCase().includes(q) ||
        (p.plan?.problemSummary.toLowerCase().includes(q) ?? false);
      return matchesClass && matchesQuery;
    });
  }, [portfolios, selectedClassKey, searchQuery]);

  const selectedPortfolio = useMemo(() => {
    if (!selectedStudentKey) return null;
    return filteredPortfolios.find((p) => p.key === selectedStudentKey) ?? null;
  }, [filteredPortfolios, selectedStudentKey]);

  const selectedPortfolioIndex = useMemo(() => {
    if (!selectedPortfolio) return -1;
    return filteredPortfolios.findIndex((p) => p.key === selectedPortfolio.key);
  }, [filteredPortfolios, selectedPortfolio]);

  useEffect(() => {
    if (selectedPortfolio?.plan) {
      setRubricDraft(selectedPortfolio.plan.rubricLevel);
      setNoteDraft(selectedPortfolio.plan.teacherNote);
    } else {
      setRubricDraft('미확인');
      setNoteDraft('');
    }
    setReviewNotice(null);
    setConfirmDeletePlanId(null);

    if (selectedPortfolio?.revision) {
      setRevisionStatusDraft(selectedPortfolio.revision.reviewStatus);
      setRevisionNoteDraft(selectedPortfolio.revision.teacherNote);
    } else {
      setRevisionStatusDraft('미확인');
      setRevisionNoteDraft('');
    }
    setRevisionNotice(null);
    setConfirmDeleteRevisionId(null);
  }, [selectedPortfolio]);

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

  async function handleSavePlanReview() {
    if (!selectedPortfolio?.plan) return;
    setSavingReview(true);
    setReviewNotice(null);

    try {
      const res = await saveTeacherReviewToApi(selectedPortfolio.plan.id, rubricDraft, noteDraft);
      if (res.unauthorized) {
        onLoggedOut();
        return;
      }
      if (res.ok && res.plan) {
        onUpdatePlan(res.plan);
        setReviewNotice({ kind: 'ok', text: '2차시 앱 기획서 평가 내용이 D1 저장소에 반영되었습니다.' });
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
      setConfirmDeletePlanId(null);
      if (!selectedPortfolio?.revision) {
        setSelectedStudentKey(null);
      }
    } else {
      setReviewNotice({ kind: 'err', text: res.error || '응답 삭제에 실패했습니다.' });
    }
  }

  async function handleSaveRevisionReview() {
    if (!selectedPortfolio?.revision) return;
    setSavingRevisionReview(true);
    setRevisionNotice(null);

    try {
      const res = await saveTeacherRevisionReviewToApi(
        selectedPortfolio.revision.id,
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
      if (!selectedPortfolio?.plan) {
        setSelectedStudentKey(null);
      }
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

  function handleExportUnifiedCsv() {
    const headers = [
      '학년',
      '반',
      '번호',
      '학번',
      '성명',
      '웹앱 제목',
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
      '프롬프트',
      '안전 약속 확인',
      '2차시 평가(상/중/하)',
      '2차시 교사 메모',
      '3차시 웹앱 테스트한 것',
      '3차시 테스트 후 수정한 것',
      '3차시 수정 이유 및 적용 결과',
      '3차시 확인 상태',
      '3차시 교사 메모',
      '최근 제출 시각',
    ];
    const rows = filteredPortfolios.map((item) => [
      item.grade,
      item.classRoom,
      item.studentNumber,
      item.studentIdBadge,
      item.studentName,
      item.appTitle,
      item.plan?.discoverySource ?? '',
      item.plan?.problemSummary ?? '',
      item.plan?.urgencyReason ?? '',
      item.plan?.publicBenefitReason ?? '',
      item.plan?.inquiryQuestion ?? '',
      item.plan?.screenComposition ?? '',
      item.featuresToImplement,
      item.plan?.dataToStore ?? '',
      item.plan?.constraints ?? '',
      item.plan?.programmingPrinciples ?? '',
      item.plan ? item.plan.finalPrompt?.trim() || item.plan.promptDraft?.trim() || buildPromptDraft(item.plan) : '',
      item.plan ? (item.plan.safetyChecked ? '확인' : '미확인') : '',
      item.plan?.rubricLevel ?? '',
      item.plan?.teacherNote ?? '',
      item.revision?.testedContent ?? '',
      item.revision?.fixedAfterTest ?? '',
      item.revision?.reasonAndResult ?? '',
      item.revision?.reviewStatus ?? '',
      item.revision?.teacherNote ?? '',
      new Date(item.latestUpdatedAt).toLocaleString('ko-KR'),
    ]);

    const csvContent =
      '\uFEFF' + [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `학생프로젝트_통합확인_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const pendingGalleryCount = galleryItems.filter((g) => g.status === 'pending').length;
  const approvedGalleryCount = galleryItems.filter((g) => g.status === 'approved').length;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono-tabular text-xs font-semibold text-slate-600">
            <span className="text-blue-700">교사확인 · 통합 프로젝트 점검 및 갤러리 인증</span>
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
            교사 확인 및 학생별 통합 포트폴리오
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            학번순·반별로 정렬된 학생 카드에서 학생이 작성한 문제탐색, 앱 기획서, 수정하기(테스트·수정 내용)를 한 페이지로 확인하세요.
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

            {activeTab === 'portfolio' && (
              <button
                type="button"
                onClick={handleExportUnifiedCsv}
                disabled={filteredPortfolios.length === 0}
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
              onClick={() => setActiveTab('portfolio')}
              className={`min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${
                activeTab === 'portfolio'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              학생별 통합 확인 ({portfolios.length}명)
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
              공개 갤러리 인증 ({galleryItems.length}
              {pendingGalleryCount > 0 ? ` · 대기 ${pendingGalleryCount}` : ''})
            </button>
          </div>

          {authError && (
            <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {authError}
            </div>
          )}

          {activeTab === 'portfolio' ? (
            selectedPortfolio ? (
              /* 학생 1명의 문제탐색 + 앱 기획서 + 수정하기 통합 단일 페이지 */
              <div className="mt-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3.5 sm:px-6">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentKey(null)}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>제출 학생 목록(갤러리)으로</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={selectedPortfolioIndex <= 0}
                      onClick={() => {
                        const prev = filteredPortfolios[selectedPortfolioIndex - 1];
                        if (prev) setSelectedStudentKey(prev.key);
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>이전 학생</span>
                    </button>
                    <button
                      type="button"
                      disabled={selectedPortfolioIndex < 0 || selectedPortfolioIndex >= filteredPortfolios.length - 1}
                      onClick={() => {
                        const next = filteredPortfolios[selectedPortfolioIndex + 1];
                        if (next) setSelectedStudentKey(next.key);
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    >
                      <span>다음 학생</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>페이지 인쇄</span>
                    </button>
                  </div>
                </div>

                {/* 학생 통합 헤더 */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white sm:p-7">
                  <div className="flex flex-wrap items-center gap-2 font-mono-tabular text-xs text-blue-300">
                    <span>{formatGradeText(selectedPortfolio.grade)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatClassText(selectedPortfolio.classRoom)}</span>
                    {selectedPortfolio.studentNumber && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{formatNumberText(selectedPortfolio.studentNumber)}</span>
                      </>
                    )}
                    {selectedPortfolio.studentIdBadge && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>학번 {selectedPortfolio.studentIdBadge}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-bold text-white">{selectedPortfolio.studentName}</span>
                  </div>

                  <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                    {selectedPortfolio.appTitle || '웹앱 제목 미입력'}
                  </h2>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                    <span>1·2차시 문제탐색·앱 기획서: {selectedPortfolio.plan ? '제출 완료' : '미제출'}</span>
                    <span aria-hidden="true">·</span>
                    <span>3차시 수정하기: {selectedPortfolio.revision ? '제출 완료' : '미제출'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      최근 제출 {new Date(selectedPortfolio.latestUpdatedAt).toLocaleString('ko-KR')}
                    </span>
                  </div>
                </div>

                {/* 1부: [1차시] 문제탐색 + [2차시] 앱 기획서 */}
                <div className="rounded-xl border border-slate-300 bg-white p-5 sm:p-7 space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <div className="font-mono-tabular text-xs font-semibold text-blue-700">PART 01 · 02</div>
                      <h3 className="mt-0.5 text-lg font-extrabold text-slate-950">
                        [문제탐색] 및 [앱 기획서] 작성 내용
                      </h3>
                    </div>

                    {selectedPortfolio.plan && (
                      <div>
                        {confirmDeletePlanId === selectedPortfolio.plan.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeletePlan(selectedPortfolio.plan!.id)}
                              className="min-h-[40px] rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 cursor-pointer"
                            >
                              삭제 확인
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePlanId(null)}
                              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePlanId(selectedPortfolio.plan!.id)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:border-red-200 hover:text-red-700 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>1·2차시 기록 삭제</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {!selectedPortfolio.plan ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      아직 1·2차시 [문제탐색] 및 [앱 기획서] 제출 내역이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-6 text-sm">
                      {/* 1차시 문제탐색 */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                          <h4 className="text-xs font-bold text-blue-700">1. [문제탐색] 실생활 문제 및 탐구 질문</h4>
                          <span className="text-xs font-medium text-slate-600">
                            탐색 경로: {selectedPortfolio.plan.discoverySource}
                          </span>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-500">선정한 실생활 문제</div>
                          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-900">
                            {selectedPortfolio.plan.problemSummary}
                          </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <div className="text-xs font-semibold text-slate-500">선정 기준 ① 시급성</div>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                              {selectedPortfolio.plan.urgencyReason}
                            </p>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-500">선정 기준 ② 공공의 이익</div>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                              {selectedPortfolio.plan.publicBenefitReason}
                            </p>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-500">나의 탐구 질문</div>
                          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-900">
                            {selectedPortfolio.plan.inquiryQuestion}
                          </p>
                        </div>
                      </div>

                      {/* 2차시 앱 기획서 */}
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                          <h4 className="text-xs font-bold text-blue-700">2. [앱 기획서] 웹앱 설계 및 프롬프트</h4>
                          <span className="text-xs font-medium text-slate-600">
                            {selectedPortfolio.plan.safetyChecked ? '디지털 안전 약속 확인함' : '안전 약속 미확인'}
                          </span>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                            <div className="text-xs font-semibold text-slate-500">웹앱 제목</div>
                            <p className="mt-1 font-bold text-slate-900">
                              {selectedPortfolio.plan.appTitle || '제목 미입력'}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                            <div className="text-xs font-semibold text-slate-500">웹앱 화면 구성 및 구축 절차</div>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                              {selectedPortfolio.plan.screenComposition}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                            <div className="text-xs font-semibold text-slate-500">① 구현할 기능</div>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                              {selectedPortfolio.plan.featuresToImplement}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                            <div className="text-xs font-semibold text-slate-500">② 저장할 데이터</div>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                              {selectedPortfolio.plan.dataToStore}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                            <div className="text-xs font-semibold text-slate-500">③ 제약사항</div>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                              {selectedPortfolio.plan.constraints}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                            <div className="text-xs font-semibold text-slate-500">④ 적용할 프로그래밍 원리</div>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                              {selectedPortfolio.plan.programmingPrinciples}
                            </p>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-500">프롬프트</div>
                          <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-sans text-xs leading-relaxed text-slate-800">
                            {selectedPortfolio.plan.finalPrompt?.trim() ||
                              selectedPortfolio.plan.promptDraft?.trim() ||
                              buildPromptDraft(selectedPortfolio.plan)}
                          </pre>
                        </div>
                      </div>

                      {/* 2차시 교사 평가 기록 */}
                      <div className="border-t border-slate-200 pt-5">
                        <h4 className="text-xs font-bold text-slate-900">
                          교사 평가 확인 기록 (2차시 앱 기획서)
                        </h4>

                        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                          {(['미확인', '상', '중', '하'] as RubricLevel[]).map((level) => {
                            const active = rubricDraft === level;
                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() => setRubricDraft(level)}
                                className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
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

                        <div className="mt-2.5 space-y-1 text-xs text-slate-500">
                          {RUBRIC_DESCRIPTIONS.map((item) => (
                            <div key={item.level}>
                              <span className="font-semibold text-slate-700">{item.level}:</span> {item.desc}
                            </div>
                          ))}
                        </div>

                        <div className="mt-3">
                          <label htmlFor="teacherNote" className="block text-xs font-medium text-slate-700">
                            교사 피드백 메모
                          </label>
                          <textarea
                            id="teacherNote"
                            rows={2}
                            maxLength={1000}
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="1·2차시 문제탐색 및 앱 기획서에 대한 피드백을 기록하세요."
                            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                          />
                        </div>

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                            onClick={handleSavePlanReview}
                            disabled={savingReview}
                            className="min-h-[42px] w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer sm:w-auto"
                          >
                            {savingReview ? '저장 중...' : '2차시 확인 저장'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2부: [3차시] 수정하기 */}
                <div className="rounded-xl border border-slate-300 bg-white p-5 sm:p-7 space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <div className="font-mono-tabular text-xs font-semibold text-blue-700">PART 03</div>
                      <h3 className="mt-0.5 text-lg font-extrabold text-slate-950">
                        [수정하기] 웹앱 테스트 및 수정 보완 내용
                      </h3>
                    </div>

                    {selectedPortfolio.revision && (
                      <div>
                        {confirmDeleteRevisionId === selectedPortfolio.revision.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteRevision(selectedPortfolio.revision!.id)}
                              className="min-h-[40px] rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 cursor-pointer"
                            >
                              삭제 확인
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRevisionId(null)}
                              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteRevisionId(selectedPortfolio.revision!.id)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:border-red-200 hover:text-red-700 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>3차시 기록 삭제</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {!selectedPortfolio.revision ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      아직 3차시 [수정하기] 제출 내역이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-6 text-sm">
                      {/* 전/후 화면 캡처 비교 */}
                      <div>
                        <h4 className="text-xs font-bold text-blue-700">
                          1. 웹앱 화면 변화 비교 (첫 프롬프트 결과 → 수정 후 결과)
                        </h4>
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
                                    label: `${formatFullAuthorLabel(selectedPortfolio)} · 첫 프롬프트 결과 화면`,
                                    src: selectedPortfolio.revision!.beforeImage,
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
                                  label: `${formatFullAuthorLabel(selectedPortfolio)} · 첫 프롬프트 결과 화면`,
                                  src: selectedPortfolio.revision!.beforeImage,
                                })
                              }
                              className="block w-full overflow-hidden rounded border border-slate-200 bg-white cursor-zoom-in"
                            >
                              <img
                                src={selectedPortfolio.revision.beforeImage}
                                alt="첫 프롬프트 결과 웹앱 화면"
                                className="h-60 w-full object-contain bg-slate-100"
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
                                    label: `${formatFullAuthorLabel(selectedPortfolio)} · 수정 결과 바뀐 화면`,
                                    src: selectedPortfolio.revision!.afterImage,
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
                                  label: `${formatFullAuthorLabel(selectedPortfolio)} · 수정 결과 바뀐 화면`,
                                  src: selectedPortfolio.revision!.afterImage,
                                })
                              }
                              className="block w-full overflow-hidden rounded border border-slate-200 bg-white cursor-zoom-in"
                            >
                              <img
                                src={selectedPortfolio.revision.afterImage}
                                alt="수정 결과 바뀐 웹앱 화면"
                                className="h-60 w-full object-contain bg-slate-100"
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 내가 테스트한 것은? */}
                      <div className="border-t border-slate-200 pt-5">
                        <h4 className="text-xs font-bold text-blue-700">2. 내가 테스트한 것은?</h4>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs font-semibold text-slate-600">
                              ① 웹앱을 사용해 보고 테스트한 것
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                              {selectedPortfolio.revision.testedContent}
                            </p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs font-semibold text-slate-600">
                              ② 테스트 후 수정한 것
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                              {selectedPortfolio.revision.fixedAfterTest}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 수정 이유와 적용 결과 */}
                      <div className="border-t border-slate-200 pt-5">
                        <h4 className="text-xs font-bold text-blue-700">3. 수정한 이유와 적용 결과</h4>
                        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900">
                          {selectedPortfolio.revision.reasonAndResult}
                        </p>
                      </div>

                      {/* 3차시 교사 확인 기록 */}
                      <div className="border-t border-slate-200 pt-5">
                        <h4 className="text-xs font-bold text-slate-900">교사 확인 기록 (3차시 수정하기)</h4>

                        <div className="mt-3 grid grid-cols-3 gap-2.5">
                          {(['미확인', '확인 완료', '보완 필요'] as RevisionReviewStatus[]).map((status) => {
                            const active = revisionStatusDraft === status;
                            return (
                              <button
                                key={status}
                                type="button"
                                onClick={() => setRevisionStatusDraft(status)}
                                className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
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

                        <div className="mt-3">
                          <label htmlFor="revisionTeacherNote" className="block text-xs font-medium text-slate-700">
                            교사 피드백 메모
                          </label>
                          <textarea
                            id="revisionTeacherNote"
                            rows={2}
                            maxLength={1000}
                            value={revisionNoteDraft}
                            onChange={(e) => setRevisionNoteDraft(e.target.value)}
                            placeholder="테스트 내용 및 수정·보완 결과에 대한 교사 피드백을 기록하세요."
                            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                          />
                        </div>

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                            className="min-h-[42px] w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer sm:w-auto"
                          >
                            {savingRevisionReview ? '저장 중...' : '3차시 확인 저장'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* 학번순 정렬 · 반별 필터 · 갤러리 형태 학생 목록 */
              <>
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-medium text-slate-500">제출 학생 수</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">
                      {portfolios.length}명
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-medium text-slate-500">1·2차시 / 3차시 제출</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">
                      {plans.length}건 / {revisions.length}건
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-medium text-slate-500">최근 제출 시각</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 font-mono-tabular">
                      {portfolios[0]
                        ? new Date(portfolios[0].latestUpdatedAt).toLocaleString('ko-KR')
                        : '제출 내역 없음'}
                    </div>
                  </div>
                </div>

                {/* 반 선택 필터 + 검색 */}
                <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 mr-1">반별 보기:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedClassKey('all')}
                      className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        selectedClassKey === 'all'
                          ? 'bg-blue-700 text-white'
                          : 'border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      전체 반 ({portfolios.length})
                    </button>
                    {classOptions.map((cls) => {
                      const active = selectedClassKey === cls.classKey;
                      return (
                        <button
                          key={cls.classKey}
                          type="button"
                          onClick={() => setSelectedClassKey(cls.classKey)}
                          className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                            active
                              ? 'bg-blue-700 text-white'
                              : 'border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {cls.classLabel} ({cls.count})
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="학년·반·학번·이름, 웹앱 제목, 구현할 기능으로 검색"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                    />
                  </div>
                </div>

                {/* 갤러리 형태 카드 그리드 (학번순 정렬) */}
                {loading ? (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                    제출된 학생 기록을 불러오는 중입니다...
                  </div>
                ) : filteredPortfolios.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center sm:p-12">
                    <p className="text-sm font-medium text-slate-800">표시할 제출 학생이 없습니다.</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                      학생이 문제탐색, 앱 기획서, 수정하기를 제출하면 반별·학번순 갤러리 카드로 표시됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredPortfolios.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setSelectedStudentKey(item.key)}
                        className="group flex flex-col justify-between rounded-xl border border-slate-300 bg-white p-5 text-left transition-colors hover:border-blue-600 hover:bg-blue-50/30 cursor-pointer"
                      >
                        <div>
                          {/* 학년 · 반 · 이름 (+ 학번) */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-700">
                              <span>{formatGradeText(item.grade)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatClassText(item.classRoom)}</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-sm font-extrabold text-slate-950">{item.studentName}</span>
                            </div>
                            {item.studentIdBadge && (
                              <span className="rounded bg-slate-900 px-2 py-0.5 font-mono-tabular text-[11px] font-bold text-white">
                                {item.studentIdBadge}
                              </span>
                            )}
                          </div>

                          {/* 웹앱 제목 */}
                          <h2 className="mt-3 text-base font-extrabold tracking-tight text-blue-800 group-hover:text-blue-700 line-clamp-2">
                            {item.appTitle || '웹앱 제목 미입력'}
                          </h2>

                          {/* 구현할 기능 */}
                          <div className="mt-2.5">
                            <div className="text-[11px] font-semibold text-slate-500">구현할 기능</div>
                            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                              {item.featuresToImplement || '아직 앱 기획서가 제출되지 않았습니다.'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                          <span className="font-mono-tabular">
                            {item.plan ? '기획서 ○' : '기획서 -'} · {item.revision ? '수정하기 ○' : '수정하기 -'}
                          </span>
                          <span className="font-semibold text-blue-700 group-hover:underline">
                            통합 내용 보기 →
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
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
                    placeholder="학번, 이름, 소개글, URL로 검색"
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
