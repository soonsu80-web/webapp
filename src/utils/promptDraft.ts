import type { AppPlanInput } from '../types/lesson';

type PromptSourceFields = Pick<
  AppPlanInput,
  'appTitle' | 'featuresToImplement' | 'dataToStore' | 'constraints'
>;

export function buildPromptDraft(data: PromptSourceFields): string {
  const appTitle = (data.appTitle ?? '').trim();
  const features = data.featuresToImplement.trim();
  const storage = data.dataToStore.trim();
  const constraints = data.constraints.trim();

  return [
    '1. 앱 스크립트로 작성합니다. html페이지와 gs코드 두개의 파일을 완성해주세요.',
    `2. 웹앱 제목: ${appTitle}`,
    `3. 구현할 기능: ${features}`,
    `4. 저장할 데이터: ${storage}`,
    `5. 제약사항: ${constraints}`,
    '6. 추가사항: ',
  ].join('\n');
}
