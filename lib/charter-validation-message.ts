export interface CharterValidationField {
  field: string
  message: string
}

// 서버(app/api/charter/submissions/[id]/route.ts, app/api/charter/submissions/route.ts)의
// validateCharter가 반환하는 필드 키를, 챔피언이 에디터에서 보는 섹션 라벨로 매핑한다.
const FIELD_LABELS: Record<string, string> = {
  project_name: '프로젝트명',
  summary: '00. 30-Second Summary',
  problem: '01. Problem · 왜 이 문제를 푸는가',
  user: '02. User · 누가 이걸 쓸 것인가',
  goal: '03. Goal · Success Metric',
  solution: '04. Solution · 어떻게 풀 것인가',
  build: '05. Build · 어떻게 만들 것인가',
}

export function formatCharterValidationMessage(fields: CharterValidationField[]): string {
  if (fields.length === 0) return '게시 실패: 필수 항목을 확인해주세요.'

  const labels = fields.map(f => FIELD_LABELS[f.field] ?? f.field)
  if (labels.length === 1) return `게시 실패: ${labels[0]} 항목을 확인해주세요.`
  return `게시 실패: 다음 항목을 확인해주세요 — ${labels.join(', ')}`
}
