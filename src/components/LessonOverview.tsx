import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Code2, ShieldCheck } from 'lucide-react';
import heroImage from '../assets/images/webapp_project_hero_1794716108520.jpg';

interface LessonOverviewProps {
  onStartDiscovery: () => void;
}

export default function LessonOverview({ onStartDiscovery }: LessonOverviewProps) {
  const [showStandards, setShowStandards] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <section id="lesson-overview" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Dark engineering hero panel with project visual */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-white sm:p-8 lg:p-9">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-stretch lg:gap-8">
          <div className="flex flex-col justify-between lg:col-span-6">
            <div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono-tabular text-xs font-medium text-slate-400">
                <span className="font-semibold text-blue-400">읽걷쓰AI 프로젝트 수업</span>
                <span aria-hidden="true">·</span>
                <span>고등학교 1학년 정보</span>
              </div>

              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl text-balance">
                실생활 문제 해결 웹앱 구현
              </h1>
              <p className="mt-3.5 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                일상에서 직접 부딪힌 문제를 시급성과 공공의 이익 기준으로 정의하고,
                해결에 필요한 화면 구성·데이터·프로그래밍 원리를 설계해 실제 웹앱으로 구현합니다.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onStartDiscovery}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:w-auto"
              >
                <span>문제탐색 시작하기</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 lg:h-full">
              {!imgError ? (
                <img
                  src={heroImage}
                  alt="노트북 코드와 화면 설계도를 보며 실생활 문제 해결 웹앱을 기획·구현하는 고등학생들의 모습"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-center">
                  <Code2 className="h-8 w-8 text-blue-400" />
                  <span className="text-sm font-semibold text-slate-200">실생활 문제 해결 웹앱 구현</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 핵심 질문 & 핵심 과업 */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-white">
          <div className="font-mono-tabular text-xs font-semibold text-blue-400">핵심 질문</div>
          <p className="mt-1.5 text-base font-bold text-white leading-snug">
            현실 문제를 해결하기 위해 현실 문제를 어떻게 구조화하고 모델링하여 웹앱을 만들 것인가?
          </p>
        </div>

        <div className="rounded-xl border border-slate-300 bg-white p-5">
          <div className="font-mono-tabular text-xs font-semibold text-blue-700">핵심 과업</div>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-800 sm:text-base">
            일상생활에서 접하는 앱의 화면 구성을 파악하고, 해당 앱 완성을 위해 필요한 요소 및 구축 절차 분석하기
          </p>
        </div>
      </div>

      {/* Lower two-column specification cards */}
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-300 bg-white p-6 sm:p-7 lg:col-span-7">
          <div className="border-b border-slate-200 pb-3.5">
            <div className="font-mono-tabular text-xs font-semibold text-blue-700">WORKFLOW · 01 → 02 → 03</div>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">
              1차시 프로젝트 진행 흐름
            </h2>
          </div>

          <ol className="mt-5 space-y-4">
            <li className="flex items-start gap-3.5">
              <span className="font-mono-tabular text-sm font-extrabold text-blue-700 pt-0.5 shrink-0">01</span>
              <div>
                <div className="text-sm font-bold text-slate-950">들어가기 (문제탐색)</div>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  일상 속 불편이나 문제를 찾아 시급성과 공공의 이익 기준으로 주제를 정하고 탐구 질문을 세웁니다.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3.5 border-t border-slate-100 pt-4">
              <span className="font-mono-tabular text-sm font-extrabold text-blue-700 pt-0.5 shrink-0">02</span>
              <div>
                <div className="text-sm font-bold text-slate-950">활동·정리 (앱 기획서)</div>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  웹앱의 화면 구성, 구현 기능, 저장할 데이터, 제약사항과 적용할 프로그래밍 원리를 체계적으로 정리해 제출합니다.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3.5 border-t border-slate-100 pt-4">
              <span className="font-mono-tabular text-sm font-extrabold text-blue-700 pt-0.5 shrink-0">03</span>
              <div>
                <div className="text-sm font-bold text-slate-950">수정 보완(코드 다시 쓰기)</div>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  사용자 편의와 의도에 맞게 코드를 수정하여 반영합니다.
                </p>
              </div>
            </li>
          </ol>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setShowStandards((prev) => !prev)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <span>관련 성취기준</span>
              {showStandards ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showStandards && (
              <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                <div>
                  <div className="font-bold text-slate-950">1차시 연계 프로젝트 목표</div>
                  <p className="mt-1">
                    ① 일상생활 속 문제를 해결하기 위해 웹앱의 화면 구성과 프로그래밍 원리를 분석하여 설명할 수 있다.
                  </p>
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <div className="font-bold text-slate-950">관련 성취기준</div>
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

        <aside className="rounded-2xl border border-slate-300 bg-white p-6 sm:p-7 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3.5">
              <ShieldCheck className="h-5 w-5 text-blue-700 shrink-0" />
              <h2 className="text-lg font-extrabold tracking-tight text-slate-950">디지털 안전 수칙</h2>
            </div>

            <ul className="mt-5 space-y-3 text-xs leading-relaxed text-slate-700 sm:text-sm">
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <strong className="font-bold text-slate-950">민감한 개인정보 입력 금지</strong>
                <p className="mt-0.5 text-xs text-slate-600">
                  연락처, 집 주소, 계정 비밀번호 등 타인의 민감 정보를 앱 데이터나 프롬프트에 넣지 않습니다.
                </p>
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <strong className="font-bold text-slate-950">공공의 이익과 출처 준수</strong>
                <p className="mt-0.5 text-xs text-slate-600">
                  타인에게 피해를 주지 않는 주제를 선택하고, 외부 자료나 API 활용 시 출처와 저작권을 확인합니다.
                </p>
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <strong className="font-bold text-slate-950">생성형 AI 안전 이용</strong>
                <p className="mt-0.5 text-xs text-slate-600">
                  AI 도구 이용 조건을 지키고, 생성된 코드와 결과는 반드시 스스로 읽고 검증해 수정합니다.
                </p>
              </li>
            </ul>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onStartDiscovery}
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <span>1단계: 문제탐색 바로가기</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
