import { describe, it, expect } from 'vitest'
import { formatCharterValidationMessage } from '@/lib/charter-validation-message'

describe('formatCharterValidationMessage', () => {
  it('필드 1개 누락 시 해당 항목명을 콕 집어 안내', () => {
    expect(formatCharterValidationMessage([{ field: 'project_name', message: '프로젝트명은 필수입니다.' }]))
      .toBe('게시 실패: 프로젝트명 항목을 확인해주세요.')
  })

  it('콘텐츠 섹션 필드는 UI 섹션 라벨로 매핑', () => {
    expect(formatCharterValidationMessage([{ field: 'build', message: '필수 항목입니다.' }]))
      .toBe('게시 실패: 05. Build · 어떻게 만들 것인가 항목을 확인해주세요.')
  })

  it('필드 여러 개 누락 시 전부 나열', () => {
    expect(formatCharterValidationMessage([
      { field: 'project_name', message: '프로젝트명은 필수입니다.' },
      { field: 'user', message: '필수 항목입니다.' },
    ])).toBe('게시 실패: 다음 항목을 확인해주세요 — 프로젝트명, 02. User · 누가 이걸 쓸 것인가')
  })

  it('알 수 없는 필드 키는 그대로 노출 (매핑 누락으로 조용히 사라지지 않도록)', () => {
    expect(formatCharterValidationMessage([{ field: 'unknown_field', message: '필수 항목입니다.' }]))
      .toBe('게시 실패: unknown_field 항목을 확인해주세요.')
  })

  it('빈 배열이면 필드명 없이 일반 안내만', () => {
    expect(formatCharterValidationMessage([])).toBe('게시 실패: 필수 항목을 확인해주세요.')
  })
})
