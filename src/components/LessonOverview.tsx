import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';

interface LessonOverviewProps {
  onStartDiscovery: () => void;
}

export default function LessonOverview({ onStartDiscovery }: LessonOverviewProps) {
  const [showStandards, setShowStandards] = useState(false);

  return (
    <section id="lesson-overview" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-500">
          <span>읽걷쓰AI 프로젝트 수업</span>
          <span aria-hidden="true">·</span>
          <span>고등학교 1학년 정보</span>
          <span aria-hidden="true">·</span>
          <span>1단계(1차시)</span>
          <span aria-hidden="true">·</span>
          <span>개인 활동</span>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
          <div className="lg:col-span-7">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
              실생활 문제 탐색 및 웹앱 화면 구성·구현 절차 기획
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              일상 관찰이나 대화·인터뷰에서 찾은 실생활 문제를 시급성과 공공의 이익 기준으로 선정하고,
              해결을 위한 웹앱의 화면 구성과 프로그래밍 원리를 분석해 앱 기획서를 작성합니다.
            </p>

            <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-sky-700">관통 질문</div>
                <p className="mt-1 text-sm font-medium text-slate-900">어떤 절차로 해결할까.</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-sky-700">1차시 핵심 과업</div>
                <p className="mt-1 text-sm text-slate-700">
                  일상생활에서 접하는 앱의 화면 구성을 파악하고 해당 앱 완성을 위해 필요한 요소 및 구축 절차 분석하기
                </p>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowStandards((prev) => !prev)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <span>관련 성취기준 및 1차시 목표 보기</span>
                {showStandards ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showStandards && (
                <div className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                  <div>
                    <div className="font-semibold text-slate-900">1차시 연계 프로젝트 목표</div>
                    <p className="mt-1">
                      ① 일상생활 속 문제를 해결하기 위해 웹앱의 화면 구성과 프로그래밍 원리를 분석하여 설명할 수 있다.
                    </p>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <div className="font-semibold text-slate-900">관련 성취기준</div>
                    <ul className="mt-1 space-y-1">
                      <li>[12정03-07] 다양한 제어 구조를 복합적으로 활용한 프로그램을 작성한다.</li>
                      <li>[12정03-09] 실생활 및 다양한 학문 분야의 문제 해결을 위한 프로그램을 협력적으로 설계·구현한다.</li>
                      <li>[12정03-10] 문제 해결을 위한 프로그램의 성능을 평가하고 공유한다.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 lg:col-span-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-sky-700 shrink-0" />
              <span>디지털 안전 약속 및 1차시 활동 흐름</span>
            </div>

            <ol className="mt-3.5 space-y-2.5 text-xs leading-relaxed text-slate-700">
              <li>
                <span className="font-semibold text-slate-900">1. 들어가기 (문제탐색)</span> — 일상 속 문제 상황을 나누고
                시급성과 공공성을 기준으로 해결할 문제와 탐구 질문을 정합니다.
              </li>
              <li>
                <span className="font-semibold text-slate-900">2. 활동·정리 (앱 기획서)</span> — 웹앱의 화면 구성,
                구현할 기능, 저장할 데이터, 제약사항과 프로그래밍 원리를 작성합니다.
              </li>
              <li>
                <span className="font-semibold text-slate-900">3. 공유·확인 (갤러리·교사확인)</span> — 작품 갤러리와
                교사 확인 화면을 통해 기획과 산출물을 점검합니다.
              </li>
            </ol>

            <div className="mt-4 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-600">
              <div className="font-semibold text-slate-900">디지털 안전 약속</div>
              <p className="mt-1">
                프롬프트 입력 및 데이터 저장 시{' '}
                <strong className="text-slate-900">연락처·주소 등 민감한 개인정보 입력 금지</strong>,
                생성형 AI 도구 이용 연령·보호자 동의 확인, 외부 자료 출처 표기, 공공의 이익 침해 여부를 점검하세요.
              </p>
            </div>
          </aside>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            수업 안내를 확인했다면 다음 단계인 문제탐색 페이지로 이동하세요.
          </p>
          <button
            type="button"
            onClick={onStartDiscovery}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:w-auto"
          >
            <span>문제탐색 시작하기</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
