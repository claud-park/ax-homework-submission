import type { RelativeMilestone } from '@/lib/milestone-schedule'

export interface MilestoneTemplate {
  id: 'launch' | 'research' | 'sprint'
  label: string
  milestones: RelativeMilestone[]
}

// Durations/offsets are in WORKING days. 1 week ≈ 5 working days.
export const TEMPLATES: MilestoneTemplate[] = [
  {
    id: 'launch',
    label: '제품 출시',
    milestones: [
      { title: '리서치 & 정의', offset_days: 0, duration_days: 5 },
      { title: '설계', offset_days: 5, duration_days: 5 },
      { title: 'MVP 개발', offset_days: 10, duration_days: 15 },
      { title: '베타 테스트', offset_days: 25, duration_days: 10 },
      { title: '출시 준비', offset_days: 35, duration_days: 5 },
    ],
  },
  {
    id: 'research',
    label: '리서치 → MVP → 검증',
    milestones: [
      { title: '문제 리서치', offset_days: 0, duration_days: 10 },
      { title: 'MVP 개발', offset_days: 10, duration_days: 15 },
      { title: '사용자 검증', offset_days: 25, duration_days: 10 },
    ],
  },
  {
    id: 'sprint',
    label: '스프린트 / 해커톤',
    milestones: [
      { title: '기획', offset_days: 0, duration_days: 1 },
      { title: '개발', offset_days: 1, duration_days: 3 },
      { title: '데모 준비', offset_days: 4, duration_days: 1 },
    ],
  },
]

export function getTemplate(id: string): MilestoneTemplate | undefined {
  return TEMPLATES.find(t => t.id === id)
}
