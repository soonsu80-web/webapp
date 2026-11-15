import { useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Clock, ImagePlus, Plus, RotateCcw, Send, Trash2, Upload } from 'lucide-react';
import type { AppPlanInput, AppRevisionSubmission, CodeChangePair } from '../types/lesson';
import { submitRevisionToApi, type BackendMode } from '../services/planApi';
import { serializeCodeChanges } from '../utils/revisionCodeBlocks';

interface RevisionDraftShape {
  beforeImage: string;
  codeChanges: CodeChangePair[];
  afterImage: string;
  reasonAndResult: string;
}

interface RevisionPageProps {
  authorForm: Pick<AppPlanInput, 'grade' | 'classRoom' | 'studentName' | 'problemSummary'>;
  onGoToDiscovery: () => void;
  revisionDraft: RevisionDraftShape;
  onUpdateRevisionField: <K extends keyof RevisionDraftShape>(
    key: K,
    value: RevisionDraftShape[K],
  ) => void;
  onResetRevisionDraft: () => void;
  backendMode: BackendMode;
  lastSavedRevision: AppRevisionSubmission | null;
  onRevisionSaved: (revision: AppRevisionSubmission) => void;
  onBackendModeChange: (mode: BackendMode) => void;
}

function formatAuthorSummary(author: Pick<AppPlanInput, 'grade' | 'classRoom' | 'studentName'>): string {
  const g = author.grade.trim();
  const c = author.classRoom.trim();
  const n = author.studentName.trim();
  if (!g && !c && !n) return '미입력';
  const gradeText = g ? (g.endsWith('학년') ? g : `${g}학년`) : '';
  const classText = c ? (c.endsWith('반') ? c : `${c}반`) : '';
  return [gradeText, classText, n].filter(Boolean).join(' ');
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
  onGoToDiscovery,
  revisionDraft,
  onUpdateRevisionField,
  onResetRevisionDraft,
  backendMode,
  lastSavedRevision,
  onRevisionSaved,
  onBackendModeChange,
}: RevisionPageProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingAuthor, setMissingAuthor] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const authorComplete =
    authorForm.grade.trim().length > 0 &&
    authorForm.classRoom.trim().length > 0 &&
    authorForm.studentName.trim().length > 0;

  function clearNotices() {
    if (errorMessage) setErrorMessage(null);
    if (missingAuthor) setMissingAuthor(false);
    if (successMessage) setSuccessMessage(null);
  }

  const codeChanges =
    revisionDraft.codeChanges.length > 0
      ? revisionDraft.codeChanges
      : [{ beforeCode: '', afterCode: '' }];

  function handleCodeChange(index: number, field: keyof CodeChangePair, value: string) {
    const updated = codeChanges.map((item, idx) =>
      idx === index ? { ...item, [field]: value } : item,
    );
    onUpdateRevisionField('codeChanges', updated);
    clearNotices();
  }

  function handleAddCodeBlock() {
    if (codeChanges.length >= 8) return;
    onUpdateRevisionField('codeChanges', [...codeChanges, { beforeCode: '', afterCode: '' }]);
    clearNotices();
  }

  function handleRemoveCodeBlock(index: number) {
    if (codeChanges.length <= 1) return;
    onUpdateRevisionField(
      'codeChanges',
      codeChanges.filter((_, idx) => idx !== index),
    );
    clearNotices();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setMissingAuthor(false);
    setSuccessMessage(null);

    if (!authorComplete) {
      setMissingAuthor(true);
      setErrorMessage('‘문제탐색’ 페이지에서 작성자의 학년, 반, 성명을 먼저 입력해 주세요.');
      return;
    }
    if (!revisionDraft.beforeImage) {
      setErrorMessage('첫 프롬프트 결과 처음 완성된 웹앱 화면 캡처 이미지를 올려 주세요.');
      return;
    }

    for (let i = 0; i < codeChanges.length; i += 1) {
      const pair = codeChanges[i];
      if (!pair.beforeCode.trim() || !pair.afterCode.trim()) {
        const prefix = codeChanges.length > 1 ? `수정 코드 ${i + 1}의 ` : '';
        setErrorMessage(`${prefix}수정 전 코드와 수정 후 코드를 모두 붙여넣어 입력해 주세요.`);
        return;
      }
    }

    if (!revisionDraft.afterImage) {
      setErrorMessage('수정 결과 바뀐 웹앱 화면 캡처 이미지를 올려 주세요.');
      return;
    }
    if (!revisionDraft.reasonAndResult.trim()) {
      setErrorMessage('해당 코드를 수정한 이유와 적용 결과를 서술해 주세요.');
      return;
    }

    const { beforeCode, afterCode } = serializeCodeChanges(codeChanges);

    setSubmitting(true);
    try {
      const result = await submitRevisionToApi({
        grade: authorForm.grade,
        classRoom: authorForm.classRoom,
        studentName: authorForm.studentName,
        beforeImage: revisionDraft.beforeImage,
        beforeCode,
        afterCode,
        afterImage: revisionDraft.afterImage,
        reasonAndResult: revisionDraft.reasonAndResult,
      });

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

  const hasAnyRevisionInput =
    Boolean(revisionDraft.beforeImage) ||
    codeChanges.some((c) => Boolean(c.beforeCode) || Boolean(c.afterCode)) ||
    codeChanges.length > 1 ||
    Boolean(revisionDraft.afterImage) ||
    Boolean(revisionDraft.reasonAndResult) ||
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
            첫 웹앱 화면 점검 및 코드 직접 수정 기록
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            첫 프롬프트로 완성된 웹앱 화면과 내가 직접 수정한 코드(수정 전·후), 바뀐 화면 캡처, 수정 이유와 적용 결과를 기록하세요.
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
              {authorForm.problemSummary.trim() && (
                <span className="font-normal text-slate-600"> · {authorForm.problemSummary.trim()}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToDiscovery}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{authorComplete ? '문제탐색 내용 확인·수정' : '문제탐색 작성하러 가기'}</span>
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

        {/* 02. 내가 직접 수정한 코드 (수정 전 / 수정 후) */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="text-xs font-medium text-slate-500">02. 코드 읽기 및 직접 수정</div>
              <h2 className="mt-0.5 text-base font-bold text-slate-900">
                내가 직접 수정한 코드는 무엇인가? (수정 전 코드 · 수정 후 코드)
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                생성된 코드 중 내가 직접 찾아서 고친 부분을 복사하여 수정 전 코드와 수정 후 코드 칸에 각각 붙여넣어 주세요.
              </p>
            </div>

            {codeChanges.length < 8 && (
              <button
                type="button"
                onClick={handleAddCodeBlock}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-700 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>수정 코드 추가하기</span>
              </button>
            )}
          </div>

          <div className="space-y-5">
            {codeChanges.map((pair, idx) => (
              <div
                key={idx}
                className={
                  codeChanges.length > 1
                    ? 'rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3'
                    : ''
                }
              >
                {codeChanges.length > 1 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular text-xs font-bold text-blue-700">
                      수정 코드 #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCodeBlock(idx)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>삭제</span>
                    </button>
                  </div>
                )}

                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`beforeCode-${idx}`}
                      className="block text-sm font-semibold text-slate-800"
                    >
                      수정 전 코드 (복사 · 붙여넣기)
                    </label>
                    <textarea
                      id={`beforeCode-${idx}`}
                      rows={8}
                      maxLength={8000}
                      spellCheck={false}
                      value={pair.beforeCode}
                      onChange={(e) => handleCodeChange(idx, 'beforeCode', e.target.value)}
                      placeholder="수정하기 전 원래 코드를 여기에 복사해 붙여넣으세요."
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-950 px-3.5 py-3 font-mono text-xs leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                    />
                    <div className="mt-1 text-right text-[11px] text-slate-400 font-mono-tabular">
                      {pair.beforeCode.length} / 8000
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`afterCode-${idx}`}
                      className="block text-sm font-semibold text-slate-800"
                    >
                      수정 후 코드 (복사 · 붙여넣기)
                    </label>
                    <textarea
                      id={`afterCode-${idx}`}
                      rows={8}
                      maxLength={8000}
                      spellCheck={false}
                      value={pair.afterCode}
                      onChange={(e) => handleCodeChange(idx, 'afterCode', e.target.value)}
                      placeholder="내가 직접 고친 뒤의 코드를 여기에 복사해 붙여넣으세요."
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-950 px-3.5 py-3 font-mono text-xs leading-relaxed text-emerald-200 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                    />
                    <div className="mt-1 text-right text-[11px] text-slate-400 font-mono-tabular">
                      {pair.afterCode.length} / 8000
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {codeChanges.length < 8 && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleAddCodeBlock}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4 text-blue-700" />
                <span>수정 코드 더 추가하기 ({codeChanges.length} / 8)</span>
              </button>
            </div>
          )}
        </div>

        {/* 03. 수정 결과 바뀐 웹앱 화면 캡처 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">03. 수정 후 화면 기록</div>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">
              수정 결과 바뀐 웹앱 화면 캡처
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              코드를 직접 수정한 뒤 실제로 화면이나 동작이 바뀐 웹앱 실행 화면을 캡처하여 올려 주세요.
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

        {/* 04. 해당 코드를 수정한 이유와 적용 결과 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">04. 수정 의도 및 결과 성찰</div>
            <label htmlFor="reasonAndResult" className="mt-0.5 block text-base font-bold text-slate-900">
              해당 코드를 수정한 이유와 적용 결과
            </label>
            <p className="mt-1 text-xs text-slate-600">
              왜 그 코드를 고쳤는지(오류, 불편한 화면 구성, 기능 보완 등)와 수정 후 웹앱에 어떤 변화가 나타났는지 구체적으로 서술하세요.
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

        {/* 제출 영역 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6">
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
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
              className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <span>{submitting ? '저장 요청 중...' : '3차시 수정 기록 제출하기'}</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
