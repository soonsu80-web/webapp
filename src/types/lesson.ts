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
  studentNumber: string;
  studentName: string;
  discoverySource: DiscoverySource;
  problemSummary: string;
  urgencyReason: string;
  publicBenefitReason: string;
  inquiryQuestion: string;
  appTitle: string;
  screenComposition: string;
  featuresToImplement: string;
  dataToStore: string;
  constraints: string;
  programmingPrinciples: string;
  promptDraft?: string;
  finalPrompt: string;
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
  studentNumber: string;
  studentName: string;
  discoverySource: DiscoverySource;
  problemSummary: string;
  urgencyReason: string;
  publicBenefitReason: string;
  inquiryQuestion: string;
  appTitle: string;
  screenComposition: string;
  featuresToImplement: string;
  dataToStore: string;
  constraints: string;
  programmingPrinciples: string;
  finalPrompt: string;
  safetyChecked: boolean;
}

export type GalleryStatus = 'pending' | 'approved' | 'rejected';

export interface GalleryItem {
  id: string;
  studentId: string;
  studentName: string;
  appUrl: string;
  intro: string;
  status: GalleryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryInput {
  studentId: string;
  studentName: string;
  appUrl: string;
  intro: string;
}

export type RevisionReviewStatus = '미확인' | '확인 완료' | '보완 필요';

export interface AppRevisionInput {
  grade: string;
  classRoom: string;
  studentNumber: string;
  studentName: string;
  beforeImage: string;
  testedContent: string;
  fixedAfterTest: string;
  afterImage: string;
  reasonAndResult: string;
  safetyChecked?: boolean;
}

export interface AppRevisionSubmission extends AppRevisionInput {
  id: string;
  reviewStatus: RevisionReviewStatus;
  teacherNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentLookupIdentity {
  grade: string;
  classRoom: string;
  studentNumber: string;
  studentName: string;
}

export interface EditingReportSession {
  active: boolean;
  planId: string | null;
  revisionId: string | null;
  lookup: StudentLookupIdentity;
}
