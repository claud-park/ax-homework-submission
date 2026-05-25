# Charter Format Update — PDF 과제정의서 구조 반영

**Date:** 2026-05-22
**Branch:** feature/charter-format
**Status:** Approved

---

## 배경

`View360_과제정의서.pdf`의 문서 구조를 기준으로 시스템의 charter(과제정의서) 포맷을 통일한다. 현재 6개 필드(`problem_definition`, `goal`, `scope_in`, `scope_out`, `expected_outcomes`, `risks`)를 PDF 7개 섹션으로 교체한다.

---

## 새 섹션 구조

| 키 | 섹션명 | 필수 |
|---|---|---|
| `summary` | 00. 30-Second Summary | ✅ |
| `problem` | 01. Problem · 왜 이 문제를 푸는가 | ✅ |
| `user` | 02. User · 누가 이걸 쓸 것인가 | |
| `goal` | 03. Goal · Success Metric | |
| `solution` | 04. Solution · 어떻게 풀 것인가 | |
| `build` | 05. Build · 어떻게 만들 것인가 | |
| `timeline` | 06. Timeline · Milestones | |

입력 방식: 섹션별 TipTap rich text editor (기존과 동일한 편집 UX).

---

## 변경 파일

### 1. `lib/types.ts`
`ProjectCharter.content` 인터페이스 교체:
- 제거: `problem_definition`, `scope_in`, `scope_out`, `expected_outcomes`, `risks`
- 교체: `summary`, `problem`, `user`, `goal`, `solution`, `build`, `timeline`

### 2. `app/(champion)/charter/page.tsx`
- `SECTIONS` 배열을 7개 섹션으로 교체
- `REQUIRED_FIELDS` 를 `['summary', 'problem']`으로 변경
- DOCX export: 커버 페이지(과제명 + 작성일 + 작성자) + 7개 섹션 본문

### 3. `app/api/charter/submissions/route.ts`
- 발행 필수 필드 검증 교체: `['summary', 'problem']`

### 4. `app/api/charter/submissions/[id]/route.ts`
- 동일한 필수 필드 검증 교체

### 5. `app/admin/progress/page.tsx`
- `CharterCard` / `CharterPanel`의 섹션 라벨 업데이트

---

## DOCX 출력 구조

```
[커버 페이지]
AX · 과제정의서
{과제명}                    ← H1
작성일: {submitted_at}
작성자: {user name}

[본문]
00. 30-Second Summary       ← H2
{summary content}

01. Problem · 왜 이 문제를 푸는가  ← H2
{problem content}

...이하 동일 패턴
```

---

## DB 마이그레이션

불필요. `content` 컬럼은 JSONB이므로 키 이름만 변경하면 됨. 기존 제출물의 구 필드는 신규 섹션에서 빈 값으로 표시됨.

---

## 필수 필드 변경 영향

| 기존 | 변경 후 |
|---|---|
| `problem_definition`, `goal`, `scope_in`, `scope_out` | `summary`, `problem` |

발행(publish) 조건이 완화되므로 기존 로직과 충돌 없음.
