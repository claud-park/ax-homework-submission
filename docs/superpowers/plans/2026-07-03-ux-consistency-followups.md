# UX 일관성 스윕 — 후속 항목 Implementation Plan

> 이 PR에서 안전한 CSS/a11y/삭제확인은 선반영. 아래는 디자인·상호작용 변경이 커 별도 진행 권장.

**선반영됨 (이 PR):**
- `admin/users` 테이블 모바일 가로 스크롤(`overflowX:auto` + `minWidth`) — 잘림 해소.
- 마일스톤 수정/삭제 버튼 `opacity-0`→`opacity-50`으로 터치 기기 도달 가능.
- 세션 액션아이템/댓글 삭제에 확인(`window.confirm`) 추가 — 기존 세션 삭제 confirm과 일관.

---

## 후속 1 — 네이티브 다이얼로그 → AlertDialog 통일

`window.confirm`/`prompt` 잔존 지점을 앱 표준 `components/ui/alert-dialog.tsx`로 이전:
- `components/sessions/AdminSessionDetail.tsx`(세션 삭제), `useSessionActionItems.ts`/`ChampionSessionDetail.tsx`/`AdminSessionDetail.tsx`(이번에 추가한 confirm 포함)
- `app/admin/champions/[userId]/page.tsx:295`, `components/CharterCommentPanel.tsx:38`
- `app/(champion)/my-project/charter/SectionEditorInner.tsx:211`(`prompt` 링크 삽입) → URL 입력 모달 + 유효성 검사

주의: AlertDialog는 async 흐름이 아니라 상태+콜백 기반이라 각 호출부 리팩터 필요. 시각 검증(로그인 필요).

## 후속 2 — 로드 실패/빈 화면 + 재시도

`return null`로 영구 빈 화면 되는 지점에 에러+재시도 UI:
- `app/admin/champions/[userId]/page.tsx`, `components/SubmissionDetailPanel.tsx`(제출 없는 카드 → "제출 없음" 안내), `app/(champion)/champions/[userId]/page.tsx`(무음 리다이렉트)
- 중첩 라우트 `loading.tsx`/`error.tsx` 추가(현재 루트에만 존재).

## 후속 3 — 모바일 탭바 정보구조 → 변경 불필요 (2026-07-06 재확인)

실제 코드 확인 결과 플랜의 전제가 틀림: `MOBILE_TABS`는 [지연신고, 과제정의서(mobile/charters), 리포트, 핫라인] 4개로, Kanban(DesktopOnly)은 **애초에 탭바에 없음**. DesktopOnly 화면(대시보드/Kanban/챔피언리스트)은 정확히 제외돼 있고, 4개 탭 대상은 모두 모바일 지원 화면. → 조치 불필요.

---

## 진행 현황 (2026-07-06)

- ✅ 후속 1(일부): 네이티브 confirm 6곳 → `useConfirm`(AlertDialog) 통일.
- ✅ 후속 2: SubmissionDetailPanel 빈 상태 안내 + admin/(champion) `loading.tsx`.
- ✅ 후속 3: 변경 불필요(위).
- ⬜ **남음**: `SectionEditorInner.tsx` 링크 삽입 `window.prompt` → 텍스트 입력 모달(useConfirm는 boolean만 커버, 별도 input 모달 필요). champion 상세 로드 실패 시 에러+재시도 UI, 중첩 `error.tsx`.
