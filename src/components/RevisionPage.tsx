import { useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Clock, ImagePlus, Plus, RotateCcw, Send, Trash2, Upload } from 'lucide-react';
import type {
  AppPlanInput,
  AppPlanSubmission,
  AppRevisionSubmission,
  EditingReportSession,
} from '../types/lesson';
import type { RevisionDraftState } from '../App';
import { submitRevisionToApi, updateFullReportInApi, type BackendMode } from '../services/planApi';
import { buildPromptDraft } from '../utils/promptDraft';

interface RevisionPageProps {
  authorForm: Pick<AppPlanInput, 'grade' | 'classRoom' | 'studentNumber' | 'studentName' | 'problemSummary' | 'appTitle'>;
  fullPlanForm: AppPlanInput;
  onGoToDiscovery: () => void;
  onGoToPlan: () => void;
  revisionDraft: RevisionDraftState;
  onUpdateRevisionField: <K extends keyof RevisionDraftState>(
    key: K,
    value: RevisionDraftState[K],
  ) => void;
  onResetRevisionDraft: () => void;
  backendMode: BackendMode;
  lastSavedRevision: AppRevisionSubmission | null;
  onRevisionSaved: (revision: AppRevisionSubmission) => void;
  onBackendModeChange: (mode: BackendMode) => void;
  editingReport: EditingReportSession | null;
  onEditCompleted: (result: { plan: AppPlanSubmission | null; revision: AppRevisionSubmission | null }) => void;
}

function formatAuthorSummary(
  author: Pick<AppPlanInput, 'grade' | 'classRoom' | 'studentNumber' | 'studentName'>,
): string {
  const g = author.grade.trim();
  const c = author.classRoom.trim();
  const num = author.studentNumber.trim();
  const n = author.studentName.trim();
  if (!g && !c && !num && !n) return '미입력';
  const gradeText = g ? (g.endsWith('학년') ? g : `${g}학년`) : '';
  const classText = c ? (c.endsWith('반') ? c : `${c}반`) : '';
  const numText = num ? (num.endsWith('번') ? num : `${num}번`) : '';
  return [gradeText, classText, numText, n].filter(Boolean).join(' ');
}

const MAX_IMAGE_DATA_URL_LENGTH = 420000;

async function compressScreenshotFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('PNG, JPG, WebP 등 이미지 파일만 올릴 수 있습니다.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다. 다른 캡처 이미지를 선택해 주세요.'));
      image.src = objectUrl;
    });

    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) {
      throw new Error('올바른 이미지 크기를 확인할 수 없습니다.');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('브라우저에서 이미지 처리를 지원하지 않습니다.');
    }

    let maxDim = 1280;
    let quality = 0.84;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
      const targetW = Math.max(1, Math.round(naturalW * scale));
      const targetH = Math.max(1, Math.round(naturalH * scale));

      canvas.width = targetW;
      canvas.height = targetH;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
        return dataUrl;
      }

      if (quality > 0.56) {
        quality -= 0.12;
      } else {
        maxDim = Math.round(maxDim * 0.78);
        quality = 0.72;
      }
    }

    throw new Error('이미지 용량이 너무 큽니다. 화면 일부만 캡처하거나 해상도를 낮춰 다시 올려 주세요.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function estimateKb(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return 0;
  const base64Len = dataUrl.length - commaIdx - 1;
  return Math.max(1, Math.round((base64Len * 3) / 4 / 1024));
}

interface ScreenshotUploadBoxProps {
  id: string;
  title: string;
  description: string;
  value: string;
  onChange: (dataUrl: string) => void;
  onError: (msg: string | null) => void;
}

function ScreenshotUploadBox({
  id,
  title,
  description,
  value,
  onChange,
  onError,
}: ScreenshotUploadBoxProps) {
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function processFile(file: File | null | undefined) {
    if (!file) return;
    setProcessing(true);
    onError(null);
    try {
      const compressed = await compressScreenshotFile(file);
      onChange(compressed);
    } catch (err) {
      onError(err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    void processFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    void processFile(file);
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          void processFile(file);
          return;
        }
      }
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
      className={`rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600/30 ${
        dragOver ? 'border-blue-600 bg-blue-50/70' : 'border-slate-300 bg-slate-50'
      }`}
    >
      {value ? (
        <div className="p-4 space-y-3">
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
            <img
              src={value}
              alt={`${title} 미리보기`}
              className="max-h-[420px] w-full object-contain bg-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono-tabular text-xs font-medium text-slate-600">
              업로드 완료 · 약 {estimateKb(value)} KB
            </span>

            <div className="flex items-center gap-2">
              <label
                htmlFor={id}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>사진 변경</span>
              </label>
              <button
                type="button"
                onClick={() => onChange('')}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>삭제</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex min-h-[180px] flex-col items-center justify-center gap-2.5 px-4 py-8 text-center cursor-pointer"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-blue-700">
            <ImagePlus className="h-5 w-5" />
          </div>
          <div className="text-sm font-bold text-slate-900">
            {processing ? '캡처 이미지 압축 중...' : title}
          </div>
          <p className="max-w-md text-xs leading-relaxed text-slate-600">{description}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white">
            <Upload className="h-3.5 w-3.5" />
            <span>이미지 파일 선택 (또는 영역 클릭 후 Ctrl+V 붙여넣기)</span>
          </span>
        </label>
      )}

      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleFileChange}
        className="sr-only"
      />
    </div>
  );
}

export default function RevisionPage({
  authorForm,
  fullPlanForm,
  onGoToDiscovery,
  onGoToPlan,
  revisionDraft,
  onUpdateRevisionField,
  onResetRevisionDraft,
  backendMode,
  lastSavedRevision,
  onRevisionSaved,
  onBackendModeChange,
  editingReport,
  onEditCompleted,
}: RevisionPageProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingAuthor, setMissingAuthor] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const authorComplete =
    authorForm.grade.trim().length > 0 &&
    authorForm.classRoom.trim().length > 0 &&
    authorForm.studentNumber.trim().length > 0 &&
    authorForm.studentName.trim().length > 0;

  function clearNotices() {
    if (errorMessage) setErrorMessage(null);
    if (missingAuthor) setMissingAuthor(false);
    if (successMessage) setSuccessMessage(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setMissingAuthor(false);
    setSuccessMessage(null);

    if (!authorComplete) {
      setMissingAuthor(true);
      setErrorMessage('‘문제탐색’ 페이지에서 작성자의 학년, 반, 번호, 성명을 먼저 입력해 주세요.');
      return;
    }
    if (!revisionDraft.beforeImage) {
      setErrorMessage('첫 프롬프트 결과 처음 완성된 웹앱 화면 캡처 이미지를 올려 주세요.');
      return;
    }
    const cleanTested = revisionDraft.testedItems.map((s) => s.trim()).filter(Boolean);
    const cleanFixed = revisionDraft.fixedItems.map((s) => s.trim()).filter(Boolean);

    if (cleanTested.length === 0) {
      setErrorMessage('웹앱을 직접 사용해 보고 테스트한 내용을 한 문장 이상 입력해 주세요.');
      return;
    }
    if (cleanFixed.length === 0) {
      setErrorMessage('테스트 후 수정한 내용을 한 문장 이상 입력해 주세요.');
      return;
    }
    if (!revisionDraft.afterImage) {
      setErrorMessage('수정 결과 바뀐 웹앱 화면 캡처 이미지를 올려 주세요.');
      return;
    }
    if (!revisionDraft.reasonAndResult.trim()) {
      setErrorMessage('수정한 이유와 적용 결과를 서술해 주세요.');
      return;
    }
    if (!revisionDraft.safetyChecked) {
      setErrorMessage('디지털 안전 약속 확인 체크박스를 선택해 주세요.');
      return;
    }

    const testedContent = cleanTested
      .map((line, idx) => `${idx + 1}. ${line.replace(/^\d+\.\s*/, '')}`)
      .join('\n');
    const fixedAfterTest = cleanFixed
      .map((line, idx) => `${idx + 1}. ${line.replace(/^\d+\.\s*/, '')}`)
      .join('\n');

    setSubmitting(true);
    try {
      const revisionPayload = {
        grade: authorForm.grade,
        classRoom: authorForm.classRoom,
        studentNumber: authorForm.studentNumber,
        studentName: authorForm.studentName,
        beforeImage: revisionDraft.beforeImage,
        testedContent,
        fixedAfterTest,
        afterImage: revisionDraft.afterImage,
        reasonAndResult: revisionDraft.reasonAndResult,
        safetyChecked: revisionDraft.safetyChecked,
      };

      if (editingReport?.active) {
        const promptDraft = buildPromptDraft(fullPlanForm);
        const effectiveFinalPrompt = fullPlanForm.finalPrompt.trim() || promptDraft;
        const result = await updateFullReportInApi({
          planId: editingReport.planId,
          revisionId: editingReport.revisionId,
          lookup: editingReport.lookup,
          plan: {
            ...fullPlanForm,
            finalPrompt: effectiveFinalPrompt,
            promptDraft,
            safetyChecked: revisionDraft.safetyChecked,
          },
          revision: revisionPayload,
        });

        if (result.connected && result.ok) {
          onBackendModeChange('ready');
          onEditCompleted({
            plan: result.plan ?? null,
            revision: result.revision ?? null,
          });
          setSuccessMessage(
            '보고서 수정이 완료되어 D1 저장소에 반영되었습니다. 이제 다른 메뉴로 자유롭게 이동할 수 있습니다.',
          );
        } else if (!result.connected) {
          onBackendModeChange('unavailable');
          setErrorMessage(
            result.error ||
              '저장 준비 중: 현재 환경에는 Cloudflare Worker(/api/report)가 연결되지 않아 수정 내용이 저장되지 않았습니다.',
          );
        } else {
          setErrorMessage(result.error || '보고서 수정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
      } else {
        const result = await submitRevisionToApi(revisionPayload);

        if (result.connected && result.ok && result.revision) {
          onBackendModeChange('ready');
          onRevisionSaved(result.revision);
          setSuccessMessage(
            '3차시 수정하기 기록이 D1 저장소에 안전하게 제출되었습니다. 비공개 응답 보호 원칙에 따라 제출 내역은 교사만 열람할 수 있습니다.',
          );
        } else if (!result.connected) {
          onBackendModeChange('unavailable');
          setErrorMessage(
            result.error ||
              '저장 준비 중: 현재 환경에는 Cloudflare Worker(/api/revisions)가 연결되지 않아 저장되지 않았습니다.',
          );
        } else {
          setErrorMessage(result.error || '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setErrorMessage(null);
    setMissingAuthor(false);
    setSuccessMessage(null);
    onResetRevisionDraft();
  }

  function updateSentenceItem(field: 'testedItems' | 'fixedItems', index: number, value: string) {
    const cleanLine = value.replace(/\r?\n/g, ' ');
    const next = revisionDraft[field].map((item, idx) => (idx === index ? cleanLine : item));
    onUpdateRevisionField(field, next);
    clearNotices();
  }

  function addSentenceItem(field: 'testedItems' | 'fixedItems') {
    onUpdateRevisionField(field, [...revisionDraft[field], '']);
    clearNotices();
  }

  function removeSentenceItem(field: 'testedItems' | 'fixedItems', index: number) {
    if (revisionDraft[field].length <= 1) return;
    const next = revisionDraft[field].filter((_, idx) => idx !== index);
    onUpdateRevisionField(field, next);
    clearNotices();
  }

  const hasAnyRevisionInput =
    Boolean(revisionDraft.beforeImage) ||
    revisionDraft.testedItems.some((s) => s.trim().length > 0) ||
    revisionDraft.fixedItems.some((s) => s.trim().length > 0) ||
    Boolean(revisionDraft.afterImage) ||
    Boolean(revisionDraft.reasonAndResult) ||
    revisionDraft.safetyChecked ||
    Boolean(lastSavedRevision);

  return (
    <section id="revision-page" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono-tabular text-xs font-semibold text-slate-600">
            <span className="text-blue-700">3차시 · 수정하기</span>
            <span aria-hidden="true">·</span>
            <span>
              {backendMode === 'checking'
                ? '저장소 연결 확인 중'
                : backendMode === 'ready'
                  ? 'D1 저장소 연결됨 (/api/revisions)'
                  : backendMode === 'db_uninitialized'
                    ? 'D1 테이블 미생성 (setup.sql 실행 필요)'
                    : '저장 준비 중 (/api 미연결)'}
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            테스트 및 수정 보완
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            완성된 웹앱을 직접 사용해 보고 테스트한 내용과 수정한 사항, 바뀐 화면 캡처, 수정 이유 및 적용 결과를 정리하세요.
          </p>
        </div>

        {hasAnyRevisionInput && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>입력 초기화</span>
          </button>
        )}
      </div>

      {backendMode !== 'ready' && backendMode !== 'checking' && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 sm:text-sm">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              {backendMode === 'db_uninitialized' ? (
                <>
                  <strong className="font-semibold">D1 데이터베이스 테이블 준비 필요</strong> — Worker(`/api`)는
                  동작 중이지만 `setup.sql` 테이블이 아직 생성되지 않아 저장할 수 없습니다.
                </>
              ) : (
                <>
                  <strong className="font-semibold">저장 준비 중 (/api 미연결)</strong> — 현재 Preview 환경에는
                  Cloudflare Worker와 D1 저장소가 연결되어 있지 않습니다. Cloudflare 발행 및 D1 연결 후 실제 저장됩니다.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 문제탐색 · 앱 기획서 연결 요약 (다시 입력하지 않고 이어서 사용) */}
      <div className="mt-6 rounded-xl border border-slate-300 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">
              연결된 작성자 정보 · {authorComplete ? '문제탐색 · 앱 기획서 기록 연동됨' : '미입력 (문제탐색에서 먼저 작성 필요)'}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              작성자: {formatAuthorSummary(authorForm)}
              {authorForm.appTitle.trim() && (
                <span className="font-semibold text-blue-800"> · {authorForm.appTitle.trim()}</span>
              )}
              {!authorForm.appTitle.trim() && authorForm.problemSummary.trim() && (
                <span className="font-normal text-slate-600"> · {authorForm.problemSummary.trim()}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToPlan}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{authorComplete ? '앱기획서 내용 확인·수정' : '앱기획서 작성하러 가기'}</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6 sm:space-y-8">
        {/* 01. 첫 프롬프트 결과 화면 캡처 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">01. 수정 전 화면 기록</div>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">
              첫 프롬프트 결과 처음 완성된 웹앱 화면 캡처
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              2차시에서 완성한 프롬프트를 입력해 처음 생성된 웹앱의 실행 화면을 캡처하여 올려 주세요.
            </p>
          </div>

          <ScreenshotUploadBox
            id="beforeImageUpload"
            title="첫 프롬프트 결과 웹앱 화면 캡처 올리기"
            description="스크린샷 파일을 드래그하거나 선택하세요. 캡처 도구(Win+Shift+S 등)로 복사한 뒤 이 영역을 클릭해 Ctrl+V로 바로 붙여넣을 수도 있습니다."
            value={revisionDraft.beforeImage}
            onChange={(url) => {
              onUpdateRevisionField('beforeImage', url);
              clearNotices();
            }}
            onError={(msg) => setErrorMessage(msg)}
          />
        </div>

        {/* 02. 내가 테스트한 것은? */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">02. 웹앱 사용 테스트 및 수정 정리</div>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">내가 테스트한 것은?</h2>
            <p className="mt-1 text-xs text-slate-600">
              테스트한 내용과 테스트 후 수정한 내용을 구분해 한 문장씩 작성하세요. 더 입력하려면 추가 버튼을 누르세요.
            </p>
          </div>

          {/* ① 웹앱을 사용해 보고 테스트한 것 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900">
                ① 웹앱을 사용해 보고 테스트한 것
              </div>
              <span className="text-[11px] font-medium text-slate-500">한 칸에 한 문장씩 입력</span>
            </div>

            <div className="space-y-2.5">
              {revisionDraft.testedItems.map((sentence, idx) => (
                <div key={`tested-${idx}`} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center font-mono-tabular text-xs font-bold text-blue-700">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    maxLength={200}
                    value={sentence}
                    onChange={(e) => updateSentenceItem('testedItems', idx, e.target.value)}
                    aria-label={`테스트한 것 ${idx + 1}`}
                    placeholder={
                      idx === 0
                        ? '예: 입력창이 비어 있을 때 추가 버튼을 누르면 어떻게 동작하는지 테스트했습니다.'
                        : '추가로 테스트한 내용을 한 문장으로 입력하세요.'
                    }
                    className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                  />
                  {revisionDraft.testedItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSentenceItem('testedItems', idx)}
                      aria-label={`테스트한 것 ${idx + 1}번 삭제`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => addSentenceItem('testedItems')}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>테스트한 것 추가</span>
              </button>
            </div>
          </div>

          {/* ② 테스트 후 수정한 것 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900">
                ② 테스트 후 수정한 것
              </div>
              <span className="text-[11px] font-medium text-slate-500">한 칸에 한 문장씩 입력</span>
            </div>

            <div className="space-y-2.5">
              {revisionDraft.fixedItems.map((sentence, idx) => (
                <div key={`fixed-${idx}`} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center font-mono-tabular text-xs font-bold text-blue-700">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    maxLength={200}
                    value={sentence}
                    onChange={(e) => updateSentenceItem('fixedItems', idx, e.target.value)}
                    aria-label={`테스트 후 수정한 것 ${idx + 1}`}
                    placeholder={
                      idx === 0
                        ? '예: 빈 칸일 때는 안내 문구가 뜨고 등록되지 않도록 수정했습니다.'
                        : '추가로 수정한 내용을 한 문장으로 입력하세요.'
                    }
                    className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                  />
                  {revisionDraft.fixedItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSentenceItem('fixedItems', idx)}
                      aria-label={`테스트 후 수정한 것 ${idx + 1}번 삭제`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => addSentenceItem('fixedItems')}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>수정한 것 추가</span>
              </button>
            </div>
          </div>
        </div>

        {/* 03. 수정 결과 바뀐 웹앱 화면 캡처 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">03. 수정 후 화면 기록</div>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">
              수정 결과 바뀐 웹앱 화면 캡처
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              테스트 후 수정 사항을 반영하여 실제로 화면이나 동작이 바뀐 웹앱 실행 화면을 캡처해 올려 주세요.
            </p>
          </div>

          <ScreenshotUploadBox
            id="afterImageUpload"
            title="수정 결과 바뀐 웹앱 화면 캡처 올리기"
            description="수정 전 화면과 변화가 잘 드러나도록 실행 화면을 캡처해 올려 주세요. (파일 선택, 드래그 또는 Ctrl+V 붙여넣기)"
            value={revisionDraft.afterImage}
            onChange={(url) => {
              onUpdateRevisionField('afterImage', url);
              clearNotices();
            }}
            onError={(msg) => setErrorMessage(msg)}
          />
        </div>

        {/* 04. 수정한 이유와 적용 결과 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">04. 수정 의도 및 결과 성찰</div>
            <label htmlFor="reasonAndResult" className="mt-0.5 block text-base font-bold text-slate-900">
              수정한 이유와 적용 결과
            </label>
            <p className="mt-1 text-xs text-slate-600">
              왜 그 부분을 수정했는지(오류, 불편한 화면 구성, 기능 보완 등)와 수정 후 웹앱에 어떤 변화가 나타났는지 서술하세요.
            </p>
          </div>

          <textarea
            id="reasonAndResult"
            rows={5}
            maxLength={3000}
            value={revisionDraft.reasonAndResult}
            onChange={(e) => {
              onUpdateRevisionField('reasonAndResult', e.target.value);
              clearNotices();
            }}
            placeholder="예: 제목 글자 크기가 작고 버튼 색이 배경과 비슷해 잘 보이지 않았습니다. 제목 글자 크기를 키우고 버튼 색을 눈에 잘 띄는 파란색으로 수정한 결과, 화면이 한눈에 잘 들어오고 버튼을 쉽게 구분할 수 있게 되었습니다."
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
          />
          <div className="text-right text-[11px] text-slate-400 font-mono-tabular">
            {revisionDraft.reasonAndResult.length} / 3000
          </div>
        </div>

        {/* 디지털 안전 약속 확인 및 보고서 제출 영역 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6">
          <label className="flex min-h-[44px] items-start gap-3 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={revisionDraft.safetyChecked}
              onChange={(e) => {
                onUpdateRevisionField('safetyChecked', e.target.checked);
                clearNotices();
              }}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-sm leading-relaxed text-slate-700">
              <strong className="font-semibold text-slate-900">디지털 안전 약속 확인</strong> — 공공의 이익에 반하지 않는 주제로 작성하였습니다.
            </span>
          </label>

          {errorMessage && (
            <div
              role="alert"
              className="mt-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{errorMessage}</span>
              {missingAuthor && (
                <button
                  type="button"
                  onClick={onGoToDiscovery}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  문제탐색으로 이동
                </button>
              )}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500 font-mono-tabular">
              {lastSavedRevision
                ? `최근 제출 완료: ${new Date(lastSavedRevision.updatedAt).toLocaleString('ko-KR')}`
                : backendMode === 'ready'
                  ? '제출 시 Cloudflare D1에 저장되며 교사만 확인할 수 있습니다.'
                  : '저장소가 연결되면 D1에 실제 저장됩니다.'}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:w-auto sm:min-h-[46px]"
            >
              <Send className="h-4 w-4" />
              <span>{submitting ? '저장 요청 중...' : '보고서 제출하기'}</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
