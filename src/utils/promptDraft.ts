import type { AppPlanInput } from '../types/lesson';

type PromptSourceFields = Pick<
  AppPlanInput,
  | 'grade'
  | 'classRoom'
  | 'studentNumber'
  | 'studentName'
  | 'discoverySource'
  | 'problemSummary'
  | 'urgencyReason'
  | 'publicBenefitReason'
  | 'inquiryQuestion'
  | 'appTitle'
  | 'screenComposition'
  | 'featuresToImplement'
  | 'dataToStore'
  | 'constraints'
  | 'programmingPrinciples'
>;

export function buildPromptDraft(data: PromptSourceFields): string {
  const authorFields: { label: string; value: string }[] = [
    { label: '학년', value: data.grade.trim() },
    { label: '반', value: data.classRoom.trim() },
    { label: '번호', value: (data.studentNumber ?? '').trim() },
    { label: '성명', value: data.studentName.trim() },
  ];

  const bodyFields: { label: string; value: string }[] = [
    { label: '선정한 실생활 문제', value: data.problemSummary.trim() },
    { label: '선정 기준(시급성)', value: data.urgencyReason.trim() },
    { label: '선정 기준(공공의 이익)', value: data.publicBenefitReason.trim() },
    { label: '탐구 질문', value: data.inquiryQuestion.trim() },
    { label: '웹앱 제목', value: (data.appTitle ?? '').trim() },
    { label: '웹앱 화면 구성 및 구축 절차', value: data.screenComposition.trim() },
    { label: '구현할 기능', value: data.featuresToImplement.trim() },
    { label: '저장할 데이터', value: data.dataToStore.trim() },
    { label: '제약사항', value: data.constraints.trim() },
    { label: '적용할 프로그래밍 원리', value: data.programmingPrinciples.trim() },
  ];

  const hasAnyText = [...authorFields, ...bodyFields].some((item) => item.value.length > 0);
  if (!hasAnyText) {
    return '';
  }

  const allItems: { label: string; value: string }[] = [
    ...authorFields,
    { label: '실생활 문제 탐색 경로', value: data.discoverySource.trim() },
    ...bodyFields,
  ].filter((item) => item.value.length > 0);

  return allItems.map((item, idx) => `${idx + 1}. ${item.label}: ${item.value}`).join('\n');
}

