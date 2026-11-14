export type DiscoverySource =
  | '기사'
  | '주변 지역사회 주민 인터뷰'
  | '가족과의 대화'
  | '친구와의 브레인스토밍'
  | '수업 중 학교문제 토론'
  | '기타 일상 관찰';

export type RubricLevel = '미확인' | '상' | '중' | '하';

export type StorageSyncState = 'pending_local' | 'synced';

export interface AppPlanSubmission {
  id: string;
  grade: string;
  classRoom: string;
  studentName: string;
  discoverySource: DiscoverySource;
  problemSummary: string;
  urgencyReason: string;
  publicBenefitReason: string;
  inquiryQuestion: string;
  screenComposition: string;
  featuresToImplement: string;
  dataToStore: string;
  constraints: string;
  programmingPrinciples: string;
  safetyChecked: boolean;
  rubricLevel: RubricLevel;
  teacherNote: string;
  storageState: StorageSyncState;
  createdAt: string;
  updatedAt: string;
}

export interface AppPlanInput {
  grade: string;
  classRoom: string;
  studentName: string;
  discoverySource: DiscoverySource;
  problemSummary: string;
  urgencyReason: string;
  publicBenefitReason: string;
  inquiryQuestion: string;
  screenComposition: string;
  featuresToImplement: string;
  dataToStore: string;
  constraints: string;
  programmingPrinciples: string;
  safetyChecked: boolean;
}
