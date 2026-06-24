# Test Cases — 디시인사이드 과제 관리 플랫폼

> **기준 문서**: PRD v2.1 (2026-06-08)  
> **구조**: IF (전제 조건) / WHEN (액션) / THEN (기대 결과)  
> **우선순위**: P0 = 블로커 / P1 = 핵심 기능 / P2 = 부가 기능

---

## 목차

| 영역 | TC 범위 | TC 수 |
|---|---|---|
| [AUTH] 인증·권한 | TC-AUTH-01~06 | 6 |
| [CHARTER] 과제정의서 | TC-CH-01~09 | 9 |
| [MS] 마일스톤·WBS | TC-MS-01~12 | 12 |
| [SUB] 제출·칸반 판정 | TC-SUB-01~08 | 8 |
| [DRAFT] 임시저장 | TC-DFT-01~04 | 4 |
| [ADMIN] 어드민 대시보드 | TC-ADM-01~08 | 8 |
| [NUDGE] Champion Nudge | TC-NUD-01~05 | 5 |
| [RPT] 주간 리포트 | TC-RPT-01~03 | 3 |
| [DEL] 지연 신고 | TC-DEL-01~04 | 4 |
| [EMAIL] 이메일 알림 | TC-EMAIL-01~09 | 9 |
| [HOT] 핫라인 | TC-HOT-01~04 | 4 |
| [SEC] 보안·API | TC-SEC-01~05 | 5 |
| [MOB] 모바일 UX | TC-MOB-01~05 | 5 |
| [SESS] 1-on-1 세션 | TC-SESS-01~27 | 27 |
| **합계** | | **109** |

---

## [AUTH] 인증·권한

### TC-AUTH-01: 비로그인 사용자 접근 차단

**IF**
- 사용자가 로그인하지 않은 상태

**WHEN**
- `/my-project/milestones` 또는 `/admin` 등 인증 필요 경로로 직접 URL 접근

**THEN**
- `/login` 페이지로 리다이렉트된다
- 원래 접근하려던 경로는 저장되지 않아도 무방하지만, 로그인 후 적절한 홈으로 이동해야 한다

**우선순위**: P0

---

### TC-AUTH-02: Google OAuth 로그인 성공

**IF**
- 사용자가 `/login` 페이지에 있음
- 유효한 Google 계정 보유

**WHEN**
- "Google로 로그인" 버튼 클릭 후 Google 계정 선택 및 인증 완료

**THEN**
- `/api/auth/callback`을 거쳐 세션이 생성된다
- `is_admin = false`인 사용자는 `/`(과제 목록)으로 이동한다
- `is_admin = true`인 사용자는 `/admin`으로 이동한다

**우선순위**: P0

---

### TC-AUTH-03: 챔피언이 어드민 경로 접근 시도

**IF**
- `is_admin = false`인 챔피언이 로그인한 상태

**WHEN**
- `/admin`, `/admin/kanban`, `/admin/reports` 등 어드민 전용 경로에 직접 URL 접근

**THEN**
- `middleware.ts`가 접근을 차단한다
- 챔피언 홈(`/`)으로 리다이렉트되거나 403 응답을 반환한다
- 어드민 UI가 어떠한 형태로도 노출되지 않는다

**우선순위**: P0

---

### TC-AUTH-04: 어드민이 챔피언 전용 경로 접근

**IF**
- `is_admin = true`인 어드민이 로그인한 상태

**WHEN**
- `/my-project/charter`, `/my-project/milestones` 등 챔피언 전용 경로 접근

**THEN**
- 접근이 허용되거나, 설계에 따라 어드민 홈으로 리다이렉트된다
- 챔피언의 개인 데이터(본인 charter 등)가 노출되지 않는다

**우선순위**: P1

---

### TC-AUTH-05: 세션 만료 후 API 호출

**IF**
- 사용자가 로그인 후 세션이 만료된 상태

**WHEN**
- 페이지에서 데이터를 수정하거나 API를 호출하는 액션 수행

**THEN**
- API가 `401 Unauthorized`를 반환한다
- 클라이언트가 로그인 페이지로 리다이렉트한다

**우선순위**: P0

---

### TC-AUTH-06: partner user_group 대시보드 제외

**IF**
- `users.user_group = 'partner'`인 사용자가 로그인한 상태

**WHEN**
- 어드민이 `/admin` 대시보드(Gantt, 확인 요함 섹션) 또는 챔피언이 전체 현황 페이지 확인

**THEN**
- partner 사용자는 Gantt 행에 표시되지 않는다
- partner 사용자는 확인 요함 섹션(charter 미제출·마일스톤 미등록)에 나타나지 않는다
- `user_group = 'champion'` 필터에 의해 자동 제외된다

**우선순위**: P1

---

## [CHARTER] 과제정의서

### TC-CH-01: Charter 초안 저장

**IF**
- 챔피언이 로그인한 상태
- 해당 과제의 homework가 `published` 상태

**WHEN**
- `/my-project/charter`에서 내용을 입력하고 "임시저장" 버튼 클릭

**THEN**
- `charter_submissions.publish_status = 'draft'`로 저장된다
- 저장 성공 토스트가 표시된다
- 어드민의 Charter 목록에 노출되지 않는다

**우선순위**: P1

---

### TC-CH-02: Charter 게시 — 필수 섹션 모두 입력

**IF**
- 챔피언이 Charter 작성 중
- 필수 4개 섹션(문제 정의·목표·Scope In·Scope Out) 모두 입력됨

**WHEN**
- "게시" 버튼 클릭

**THEN**
- `charter_submissions.publish_status = 'published'`로 업데이트된다
- 어드민의 Charter 검토 목록에 해당 Charter가 노출된다
- 챔피언 화면에 "게시됨" 상태가 표시된다

**우선순위**: P1

---

### TC-CH-03: Charter 게시 — 필수 섹션 미입력

**IF**
- 챔피언이 Charter 작성 중
- 필수 섹션 1개 이상 비어 있음

**WHEN**
- "게시" 버튼 클릭

**THEN**
- 게시가 차단된다
- 미입력 필수 섹션이 시각적으로 표시된다 (에러 메시지 또는 하이라이트)
- `publish_status`가 변경되지 않는다

**우선순위**: P1

---

### TC-CH-04: Charter DOCX 내보내기

**IF**
- 챔피언의 Charter가 `published` 상태

**WHEN**
- "DOCX 내보내기" 버튼 클릭

**THEN**
- `.docx` 파일이 브라우저에서 다운로드된다
- 파일에 Charter 6개 섹션 내용이 포함된다
- 파일명이 적절한 형식(예: `{project_name}_charter.docx`)으로 생성된다

**우선순위**: P2

---

### TC-CH-05: 어드민이 Charter에 댓글 작성

**IF**
- 어드민이 챔피언의 published Charter를 보고 있는 상태

**WHEN**
- 댓글 입력 후 "댓글 등록" 버튼 클릭

**THEN**
- `charter_comments`에 `author_role = 'admin'`으로 저장된다
- 해당 챔피언에게 이메일 E6가 발송된다 (`notifyNewComment`)
- 댓글이 Charter 하단에 즉시 표시된다

**우선순위**: P1

---

### TC-CH-06: 챔피언이 어드민 댓글에 답글 작성

**IF**
- 어드민의 Charter 댓글이 존재하는 상태
- 챔피언이 해당 Charter를 보고 있음

**WHEN**
- 어드민 댓글의 "답글" 버튼 클릭 후 내용 입력 및 등록

**THEN**
- `charter_comments`에 `parent_id = {admin_comment_id}`로 저장된다
- 어드민에게 이메일 E5가 발송된다 (`notifyNewComment`)
- 답글이 해당 댓글 하위에 들여쓰기로 표시된다

**우선순위**: P1

---

### TC-CH-07: 댓글 depth 제한 (최대 2)

**IF**
- 챔피언의 답글(depth 1)이 존재하는 상태

**WHEN**
- depth 1 댓글에 추가 답글 작성을 시도

**THEN**
- 추가 답글 입력 UI가 노출되지 않거나 등록이 차단된다
- 댓글 트리는 최대 2-depth(원댓글 + 답글)로 유지된다

**우선순위**: P2

---

### TC-CH-08: Charter 서식 툴바 — WYSIWYG 편집

**IF**
- 챔피언이 `/my-project/charter`에서 Charter를 작성 중인 상태

**WHEN**
- 섹션 에디터 툴바의 Bold(B), Italic(I), Underline(U), Strikethrough, Link, 순서 있는 목록, 글머리 목록, 인용, 인라인 코드, 코드 블록 버튼 클릭

**THEN**
- 각 서식이 에디터 콘텐츠에 즉시 적용되어 WYSIWYG으로 표시된다
- Bold → `<strong>`, Italic → `<em>`, Underline → `<u>`, 목록 → `<ul>/<ol>` 등 HTML로 저장된다
- Link 버튼 클릭 시 URL 입력 프롬프트가 표시된다
- 툴바 버튼이 활성 서식과 동기화되어 active 상태로 표시된다

**우선순위**: P2

---

### TC-CH-09: Charter DOCX 내보내기 — 서식 보존

**IF**
- 챔피언의 Charter에 Bold, Italic, Underline, Strike, 목록, 코드 등 서식이 적용된 내용이 있는 상태

**WHEN**
- "DOCX 내보내기" 버튼 클릭

**THEN**
- `.docx` 파일에서 Bold → 굵은 글씨, Italic → 기울임, Underline → 밑줄, Strike → 취소선, `code` → Courier New 폰트로 렌더링된다
- 순서 있는 목록(`ol/li`)은 `1. 2. 3.` 형식으로 변환된다
- 글머리 목록(`ul/li`)은 `•` 기호로 변환된다
- 서식 없는 일반 텍스트도 정상 출력된다

**우선순위**: P2

---

## [MS] 마일스톤·WBS

### TC-MS-01: depth-0 마일스톤 그룹 생성

**IF**
- 챔피언이 `/my-project/milestones`에 있음
- Charter가 published 상태

**WHEN**
- "그룹 추가" 버튼 클릭 후 그룹명 입력 및 저장

**THEN**
- `milestones` 테이블에 `parent_milestone_id = null` 레코드가 생성된다
- 날짜(start_date, due_date) 없이 저장 가능하다
- Gantt에서 토글 가능한 project 행으로 표시된다

**우선순위**: P1

---

### TC-MS-02: depth-1 마일스톤 생성

**IF**
- depth-0 그룹이 하나 이상 존재하는 상태

**WHEN**
- 그룹 하위에 마일스톤 추가 (제목·start_date·due_date 입력)

**THEN**
- `milestones` 테이블에 `parent_milestone_id = {group_id}` 레코드가 생성된다
- 해당 그룹 하위에 들여쓰기된 행으로 표시된다
- Gantt 바가 start_date~due_date 범위로 렌더링된다

**우선순위**: P1

---

### TC-MS-03: Milestone 상태 자동 계산 — completed

**IF**
- 마일스톤이 `not_started` 상태

**WHEN**
- 챔피언이 주간 체크인에서 "완료 처리" 선택

**THEN**
- `milestones.status = 'completed'`으로 업데이트된다
- Gantt 바가 completed 색상으로 변경된다
- 완료 섹션으로 이동한다

**우선순위**: P1

---

### TC-MS-04: Milestone 상태 자동 계산 — in_progress (날짜 무관)

**IF**
- 마일스톤의 due_date가 오늘보다 이른 상태 (`due_date < today`)
- `bottleneck_type`이 null

**WHEN**
- 챔피언이 주간 체크인에서 "진행 중" 선택

**THEN**
- `milestones.is_manual_progress = true`로 업데이트된다
- `status = 'in_progress'`로 유지된다
- 날짜가 지났어도 "지연" 섹션이 아닌 "진행중" 섹션에 위치한다

**우선순위**: P1

---

### TC-MS-05: Milestone 상태 자동 계산 — delayed (기한 초과)

**IF**
- 마일스톤의 `due_date < today`
- `is_manual_progress = false`, `bottleneck_type = null`, `is_manual_completed = false`
- `status = 'not_started'`

**WHEN**
- 페이지를 새로 고침하거나 API가 status를 재계산

**THEN**
- `status = 'delayed'`로 반환된다
- 마일스톤이 "지연" 섹션으로 이동한다

**우선순위**: P1

---

### TC-MS-06: Milestone 상태 자동 계산 — delayed (지연 신고)

**IF**
- 마일스톤이 `in_progress` 또는 `not_started` 상태

**WHEN**
- 챔피언이 주간 체크인에서 "지연 신고" 선택 후 bottleneck_type·내용 입력 및 제출

**THEN**
- `milestones.bottleneck_type`이 업데이트된다
- `status = 'delayed'`로 재계산된다
- 어드민에게 이메일 E7이 발송된다 (`notifyBottleneck`)

**우선순위**: P1

---

### TC-MS-07: 기한 변경 모달 — 일반 케이스 (end_date만)

**IF**
- 마일스톤이 `in_progress` 상태 또는 start_date가 아직 지나지 않은 상태

**WHEN**
- 챔피언이 기한 변경 버튼 클릭 → 새 due_date 입력 → 제출

**THEN**
- `deadline_change_requests` 테이블에 `status = 'pending'` 레코드가 생성된다
- 어드민에게 이메일 E2가 발송된다 (`notifyDeadlineChangeRequest`)
- 챔피언 화면에 "검토 대기 중" 상태가 표시된다

**우선순위**: P1

---

### TC-MS-08: 기한 변경 모달 — start+end 동시 변경 케이스

**IF**
- 마일스톤의 `start_date < today` (start_date가 이미 경과)
- 마일스톤의 `status = 'not_started'`

**WHEN**
- 챔피언이 기한 변경 버튼 클릭

**THEN**
- 모달에 start_date + end_date 두 개의 날짜 입력 필드가 표시된다
- 두 날짜 모두 입력해야 제출 가능하다
- 제출 시 `deadline_change_requests`에 새 start_date·due_date가 함께 기록된다

**우선순위**: P1

---

### TC-MS-09: 기한 변경 요청 — 어드민 승인

**IF**
- `deadline_change_requests.status = 'pending'` 레코드가 존재

**WHEN**
- 어드민이 `/admin/requests`에서 해당 요청 "승인" 클릭

**THEN**
- `deadline_change_requests.status = 'approved'`로 업데이트된다
- `milestones.due_date`가 `requested_due_date`로 자동 갱신된다
- 기한 연장 후 `bottleneck_type`이 초기화되어 status가 재계산된다

**우선순위**: P1

---

### TC-MS-10: 기한 변경 요청 — 어드민 거절

**IF**
- `deadline_change_requests.status = 'pending'` 레코드가 존재

**WHEN**
- 어드민이 `/admin/requests`에서 해당 요청 "거절" 클릭

**THEN**
- `deadline_change_requests.status = 'rejected'`로 업데이트된다
- `milestones.due_date`는 변경되지 않는다

**우선순위**: P1

---

### TC-MS-11: Gantt — 2-depth 트리 토글

**IF**
- depth-0 그룹에 depth-1 마일스톤이 2개 이상 등록된 상태

**WHEN**
- Gantt에서 depth-0 그룹 행의 확장/축소 토글 클릭

**THEN**
- 하위 depth-1 마일스톤 행이 접혀서 숨겨지거나 펼쳐진다
- 토글 상태가 화면 내에서 유지된다

**우선순위**: P2

---

### TC-MS-12: 기한 변경 후 status 자동 갱신

**IF**
- 마일스톤이 `bottleneck_type`이 설정된 `delayed` 상태
- 어드민이 기한변경 요청을 승인

**WHEN**
- `due_date`가 미래 날짜로 갱신됨

**THEN**
- PATCH 처리 시 `bottleneck_type`, `bottleneck_note`, `bottleneck_admin_comment`, `bottleneck_reviewed_at`이 null로 초기화된다
- `status`가 `is_manual_progress` 여부에 따라 `in_progress` 또는 `not_started`로 재계산된다
- "지연" 태그가 사라진다

**우선순위**: P1

---

## [SUB] 제출·칸반 판정

### TC-SUB-01: 챔피언 최종 제출

**IF**
- 챔피언이 로그인한 상태
- 해당 과제의 homework가 published 상태

**WHEN**
- 최종 제출 파일 업로드 후 "제출" 버튼 클릭

**THEN**
- `submissions` 테이블에 `status = 'pending'` 레코드가 생성된다
- 파일이 Supabase Storage `submissions` 버킷에 저장된다
- 어드민에게 이메일 E1이 발송된다 (`notifyNewSubmission`)
- 챔피언 화면에 "검토 중" 상태가 표시된다

**우선순위**: P0

---

### TC-SUB-02: 어드민 칸반 DnD — 합격

**IF**
- `submissions.status = 'reviewing'` 카드가 칸반에 존재

**WHEN**
- 어드민이 해당 카드를 "합격" 컬럼으로 드래그앤드롭

**THEN**
- `submissions.status = 'accepted'`로 업데이트된다
- 낙관적 업데이트로 카드가 즉시 합격 컬럼에 위치한다
- 챔피언에게 이메일 알림이 발송된다

**우선순위**: P0

---

### TC-SUB-03: 어드민 칸반 DnD — 불합격

**IF**
- `submissions.status = 'reviewing'` 카드가 칸반에 존재

**WHEN**
- 어드민이 해당 카드를 "불합격" 컬럼으로 드래그앤드롭

**THEN**
- `submissions.status = 'declined'`로 업데이트된다
- 챔피언에게 이메일 알림이 발송된다

**우선순위**: P0

---

### TC-SUB-04: 합격·불합격 후 칸반 역이동 불가

**IF**
- `submissions.status = 'accepted'` 또는 `'declined'` 카드가 존재

**WHEN**
- 어드민이 해당 카드를 다른 컬럼으로 드래그 시도

**THEN**
- DnD가 차단된다 (`DRAGGABLE_COLS = ['reviewing']` 제한)
- 카드가 원래 컬럼에 머문다
- 판정이 변경되지 않는다

**우선순위**: P0

---

### TC-SUB-05: 불합격 후 재제출

**IF**
- `submissions.status = 'declined'` 상태
- 챔피언이 피드백을 반영한 상태

**WHEN**
- 새 파일 업로드 후 "재제출" 버튼 클릭

**THEN**
- 새 `submissions` 레코드가 `attempt_number + 1`로 생성된다
- 상태가 `pending`으로 시작한다
- 어드민에게 이메일 E1이 재발송된다

**우선순위**: P1

---

### TC-SUB-06: 제출 상세 사이드 패널

**IF**
- 어드민이 `/admin/kanban`에 있는 상태

**WHEN**
- 칸반의 카드 클릭

**THEN**
- 오른쪽에 리사이저블 Sheet(사이드 패널)가 열린다
- 제출 파일 다운로드 링크(서명 URL)와 댓글 섹션이 표시된다
- 서명 URL은 60초 TTL로 발급된다

**우선순위**: P1

---

### TC-SUB-07: 챔피언 제출 댓글 이력 확인

**IF**
- 챔피언이 `/my-project/submission`에 접속한 상태
- 해당 챔피언의 제출물에 어드민 또는 챔피언 본인의 댓글이 존재

**WHEN**
- 제출 이력 목록에서 특정 제출 항목 확인

**THEN**
- 제출별로 댓글 목록이 표시된다
- 어드민 댓글은 파란 배경, 챔피언 댓글은 회색 배경으로 구분된다
- 댓글이 없으면 해당 영역이 비어 있거나 숨겨진다
- 챔피언이 새 코멘트를 작성하고 전송할 수 있는 입력란이 표시된다

**우선순위**: P1

---

### TC-SUB-08: 챔피언 제출 파일 다운로드

**IF**
- 챔피언이 `/my-project/submission`에서 제출 이력을 보고 있는 상태
- 해당 제출에 `file_path`가 존재 (`type = 'file'`)

**WHEN**
- 다운로드 버튼(Download 아이콘) 클릭

**THEN**
- `GET /api/submissions/[id]/download`가 호출된다
- 서버가 소유권 검증 (`user_id = 본인`) 후 Supabase Storage 서명 URL(60s TTL)을 반환한다
- 브라우저에서 파일이 다운로드된다
- 본인이 아닌 다른 챔피언의 submission_id로 호출 시 `404`를 반환한다

**우선순위**: P1

---

## [DRAFT] 임시저장

### TC-DFT-01: 초안 과제는 챔피언에게 미노출

**IF**
- 어드민이 `publish_status = 'draft'`인 과제를 생성한 상태

**WHEN**
- 챔피언이 `/`(과제 목록)를 조회

**THEN**
- 해당 초안 과제가 목록에 표시되지 않는다
- 칸반·진행도에서도 해당 과제가 제외된다

**우선순위**: P0

---

### TC-DFT-02: 초안 Charter는 어드민에게 미노출

**IF**
- 챔피언이 `publish_status = 'draft'`인 Charter를 저장한 상태

**WHEN**
- 어드민이 Charter 검토 목록을 조회

**THEN**
- 해당 초안 Charter가 목록에 표시되지 않는다

**우선순위**: P1

---

### TC-DFT-03: 초안 Milestone 게시 전 Charter 제출 차단

**IF**
- 과제가 `publish_status = 'draft'` 상태

**WHEN**
- 챔피언이 해당 과제의 Charter 제출 또는 Milestone 등록 시도

**THEN**
- API가 403 또는 400을 반환한다
- 초안 과제에 대한 데이터 생성이 차단된다

**우선순위**: P1

---

### TC-DFT-04: 게시 전환 후 즉시 반영

**IF**
- 어드민이 `publish_status = 'draft'`인 과제를 보유

**WHEN**
- "게시" 버튼 클릭

**THEN**
- `publish_status = 'published'`로 즉시 전환된다
- 챔피언의 과제 목록에 즉시 나타난다

**우선순위**: P1

---

## [ADMIN] 어드민 대시보드

### TC-ADM-01: ChampionSummaryTable — charter 상태 표시

**IF**
- 어드민이 `/admin`에 접속한 상태
- 챔피언 A: charter 미제출, 챔피언 B: charter 제출 + 마일스톤 없음, 챔피언 C: charter + 마일스톤 모두 있음

**WHEN**
- 챔피언 전체 현황 테이블 확인

**THEN**
- 챔피언 A 과제정의서 셀: amber `⚠️ 미제출` 배지 표시
- 챔피언 B 과제정의서 셀: 기존 charter 배지 + amber `마일스톤 없음` 서브텍스트 표시
- 챔피언 C: 정상 표시

**우선순위**: P1

---

### TC-ADM-02: 확인 요함 섹션 — charter 미제출 챔피언

**IF**
- charter를 제출하지 않은 챔피언이 1명 이상 존재

**WHEN**
- 어드민이 `/admin` Gantt 상단의 확인 요함 섹션 확인

**THEN**
- "과제정의서 미제출" 카드에 해당 챔피언 이름 chip이 표시된다
- 카드 테두리가 amber 색상이다
- 해당 챔피언이 없으면 카드가 숨겨진다

**우선순위**: P1

---

### TC-ADM-03: 확인 요함 섹션 — 마일스톤 미등록 챔피언

**IF**
- charter를 제출했지만 마일스톤을 등록하지 않은 챔피언이 1명 이상 존재

**WHEN**
- 어드민이 확인 요함 섹션의 "마일스톤 미등록" 카드 확인

**THEN**
- 해당 챔피언 이름이 chip으로 표시된다
- 두 케이스(미제출·미등록) 모두 없으면 확인 요함 섹션 전체가 숨겨진다

**우선순위**: P1

---

### TC-ADM-04: 확인 요함 섹션 fold/unfold

**IF**
- 확인 요함 섹션에 챔피언이 표시된 상태

**WHEN**
- 섹션 헤더 클릭 (fold/unfold 토글)

**THEN**
- 섹션이 접히거나 펼쳐진다
- 토글 상태가 해당 세션 동안 유지된다

**우선순위**: P2

---

### TC-ADM-05: ChampionGanttView — 간트 전용 표시

**IF**
- 어드민이 `/admin`에 접속한 상태

**WHEN**
- 간트 뷰 영역 확인

**THEN**
- 뷰 토글 버튼이 없다 (간트만 표시됨)
- 마일스톤이 있는 챔피언의 행이 정상 렌더링된다
- 마일스톤이 없는 챔피언은 간트에서 제외되지만 확인 요함 섹션에는 표시된다

**우선순위**: P1

---

### TC-ADM-06: 챔피언 Gantt 필터 칩 — 마일스톤 있는 챔피언만

**IF**
- 마일스톤이 있는 챔피언과 없는 챔피언이 혼재하는 상태

**WHEN**
- Gantt 상단의 챔피언 필터 칩 확인

**THEN**
- 마일스톤이 있는 챔피언만 필터 칩으로 표시된다
- 마일스톤 미등록 챔피언은 필터 칩에서 제외된다 (확인 요함 섹션에서만 표시)

**우선순위**: P2

---

### TC-ADM-07: 어드민 챔피언 개별 상세 — 제출 피드백 직접 접근

**IF**
- 어드민이 `/admin/champions/[userId]`에 접속한 상태
- 해당 챔피언이 하나 이상의 제출물을 보유

**WHEN**
- 제출 이력 목록 확인 및 상태 변경(합격/불합격) 버튼 클릭

**THEN**
- 챔피언의 제출 이력이 확장 카드 형태로 표시된다
- 각 제출에 상태 변경 버튼(합격·불합격)이 인라인으로 표시된다
- 불합격 선택 시 피드백 텍스트 입력란이 나타나고 확인 후 저장된다
- 제출 파일 다운로드 버튼이 표시되며 Supabase Storage 서명 URL(60s TTL)로 다운로드된다
- 제출별 댓글 스레드가 표시되고 어드민이 새 코멘트를 작성할 수 있다

**우선순위**: P1

---

### TC-ADM-08: Gantt — 독립 스크롤 영역

**IF**
- 어드민 또는 챔피언이 전체 현황 페이지(`/admin` 또는 `/`)에 접속
- 마일스톤이 있는 챔피언이 다수 존재하여 Gantt 행이 길어진 상태

**WHEN**
- 페이지에서 스크롤 시도

**THEN**
- 페이지 전체가 스크롤되지 않는다
- Gantt 차트 영역 내부에서만 x축(시간축)·y축(행) 스크롤이 동작한다
- 페이지 상단의 필터 칩, 뷰 모드 버튼, 확인 요함 섹션은 고정 위치를 유지한다
- Gantt 영역 높이는 `calc(100dvh - 310px)` 기준으로 viewport에 맞게 제한된다

**우선순위**: P2

---

## [NUDGE] Champion Nudge

### TC-NUD-01: 확인 요함 칩 클릭 → no_charter Nudge 발송

**IF**
- 어드민이 로그인한 상태 (`is_admin = true`)
- 확인 요함 섹션에 charter 미제출 챔피언의 chip이 존재

**WHEN**
- 해당 챔피언 chip 클릭 → NudgePopover에서 "찌르기 📧" 버튼 클릭

**THEN**
- `POST /api/admin/nudge`가 `{ nudgeType: 'no_charter', userId }` body로 호출된다
- 버튼이 disabled + loading spinner로 전환된다
- 발송 성공 시 popover가 닫히고 sonner toast "📧 넛지 메일을 발송했습니다" 표시
- 챔피언에게 subject `[AX] 과제정의서 제출을 기다리고 있습니다 🙏` 이메일이 발송된다

**우선순위**: P1

---

### TC-NUD-02: 확인 요함 칩 클릭 → no_milestone Nudge 발송

**IF**
- charter는 제출했지만 마일스톤 미등록 챔피언의 chip이 확인 요함 섹션에 존재

**WHEN**
- 해당 챔피언 chip 클릭 → "찌르기 📧" 클릭

**THEN**
- `nudgeType: 'no_milestone'`으로 API 호출
- 챔피언에게 subject `[AX] 마일스톤 등록을 기다리고 있습니다 🙏` 이메일 발송
- 이메일 CTA 링크가 `/my-project/milestones`로 연결

**우선순위**: P1

---

### TC-NUD-03: Gantt delayed 바 클릭 → delayed_milestone Nudge

**IF**
- 어드민이 Gantt를 보고 있는 상태 (`isAdmin = true`)
- `status = 'delayed'`인 마일스톤 바가 존재

**WHEN**
- delayed 마일스톤 바 클릭

**THEN**
- NudgePopover가 클릭 위치 근처에 표시된다
- Popover에 챔피언 이름과 마일스톤 제목이 표시된다
- "찌르기 📧" 클릭 시 `nudgeType: 'delayed_milestone', milestoneTitle` 포함하여 API 호출
- 챔피언에게 subject `[AX] '{{마일스톤 제목}}' 마일스톤을 확인해주세요 🙏` 이메일 발송

**우선순위**: P1

---

### TC-NUD-04: 챔피언 뷰에서 Nudge 불가

**IF**
- `is_admin = false`인 챔피언이 로그인한 상태

**WHEN**
- 챔피언이 마일스톤 페이지 등에서 NudgePopover 또는 `/api/admin/nudge`를 직접 호출 시도

**THEN**
- API가 `403 Forbidden`을 반환한다
- 챔피언 UI에 NudgePopover가 노출되지 않는다

**우선순위**: P0

---

### TC-NUD-05: Nudge 발송 중 Popover dismiss 불가

**IF**
- NudgePopover가 열린 상태에서 "찌르기 📧" 클릭 후 발송 중

**WHEN**
- 발송 중에 popover 외부 영역 클릭

**THEN**
- Popover가 닫히지 않는다
- 발송이 완료된 후 자동으로 닫힌다

**우선순위**: P2

---

## [RPT] 주간 리포트

### TC-RPT-01: 이번 주 리포트 기본 표시

**IF**
- 어드민이 `/admin/reports`에 접속

**WHEN**
- 페이지 초기 로딩

**THEN**
- 현재 주(Sunday~Saturday 기준)의 마일스톤 현황이 표시된다
- 챔피언별 due_date가 현재 주에 해당하는 마일스톤만 필터링된다
- 부서명이 nowrap으로 처리된다

**우선순위**: P1

---

### TC-RPT-02: 주간 리포트 — 주차 네비게이션

**IF**
- 어드민이 `/admin/reports`를 보고 있는 상태

**WHEN**
- "이전 주" 또는 "다음 주" 네비게이션 버튼 클릭

**THEN**
- 해당 주의 Sunday~Saturday 날짜 범위가 헤더에 표시된다
- 해당 주의 due_date를 가진 마일스톤으로 필터링된다
- 데이터가 없는 주에는 빈 상태가 표시된다

**우선순위**: P1

---

### TC-RPT-03: 주간 리포트 PDF 인쇄

**IF**
- 어드민이 특정 주차의 리포트를 보고 있는 상태

**WHEN**
- SVG 인쇄 버튼 클릭 (또는 브라우저 인쇄 단축키)

**THEN**
- `@media print` 스타일이 적용된다
- 불필요한 UI 요소(네비게이션, 버튼 등)가 숨겨진다
- 리포트 내용이 인쇄 가능한 레이아웃으로 렌더링된다

**우선순위**: P2

---

## [DEL] 지연 신고

### TC-DEL-01: 챔피언 지연 신고 제출

**IF**
- 챔피언이 주간 체크인에서 "지연 신고" 액션 선택
- bottleneck_type 및 설명 입력 완료

**WHEN**
- "신고 제출" 버튼 클릭

**THEN**
- `milestones.bottleneck_type`이 업데이트된다
- `milestones.status = 'delayed'`로 재계산된다
- 어드민에게 이메일 E7이 발송된다

**우선순위**: P1

---

### TC-DEL-02: 어드민 지연 신고 검토 목록

**IF**
- 지연 신고된 마일스톤이 존재

**WHEN**
- 어드민이 `/admin/delay-reports`에 접속

**THEN**
- 지연 신고된 마일스톤 목록이 표시된다
- 챔피언명, 마일스톤명, bottleneck 내용이 확인 가능하다

**우선순위**: P1

---

### TC-DEL-03: 어드민 지연 신고 답변 및 확인 완료

**IF**
- 어드민이 `/admin/delay-reports`에서 특정 지연 신고를 보고 있는 상태

**WHEN**
- 텍스트 답변 입력 후 "확인 완료" 버튼 클릭

**THEN**
- `bottleneck_replies` 테이블에 어드민 답변이 저장된다
- 해당 지연 신고가 "처리됨" 상태로 변경된다
- 챔피언의 마일스톤 카드에 어드민 답변이 인카드로 표시된다

**우선순위**: P1

---

### TC-DEL-04: 지연신고 이메일 링크 검증

**IF**
- 챔피언이 지연 신고를 제출하여 어드민에게 E7 이메일이 발송된 상태

**WHEN**
- 어드민이 이메일의 CTA 링크 클릭

**THEN**
- `/admin/delay-reports`로 이동한다 (구 `/admin/requests` 아님)
- 해당 지연 신고 항목을 바로 확인할 수 있다

**우선순위**: P1

---

## [EMAIL] 이메일 알림

### TC-EMAIL-01: E1 — 최종 제출 어드민 알림

**IF**
- 챔피언이 최종 제출 완료

**WHEN**
- `POST /api/submissions` 처리 완료

**THEN**
- `ADMIN_NOTIFICATION_EMAIL`로 이메일이 발송된다
- 제목에 챔피언명·과제명이 포함된다
- 이메일 내 CTA 링크가 `/admin/kanban`으로 연결된다

**우선순위**: P0

---

### TC-EMAIL-02: E2 — 기한변경 요청 어드민 알림

**IF**
- 챔피언이 기한변경 요청 제출

**WHEN**
- `POST /api/deadline-requests` 처리 완료

**THEN**
- 어드민에게 이메일이 발송된다
- 기존 due_date와 requested_due_date가 본문에 포함된다

**우선순위**: P1

---

### TC-EMAIL-03: E3/E5 — 챔피언 댓글 시 어드민 알림

**IF**
- 챔피언이 제출물 또는 Charter에 댓글 작성

**WHEN**
- 댓글 등록 API 처리 완료

**THEN**
- 어드민에게 `notifyNewComment` 이메일이 발송된다
- 댓글 내용 미리보기와 CTA 링크가 포함된다

**우선순위**: P1

---

### TC-EMAIL-04: E4/E6 — 어드민 댓글 시 챔피언 알림

**IF**
- 어드민이 제출물 또는 Charter에 댓글/답글 작성

**WHEN**
- 댓글 등록 API 처리 완료

**THEN**
- 해당 챔피언에게 `notifyNewComment` 이메일이 발송된다
- 챔피언의 이메일 주소(`users.email`)로 발송된다

**우선순위**: P1

---

### TC-EMAIL-05: E7 — 지연 신고 어드민 알림

**IF**
- 챔피언이 지연 신고(bottleneck) 제출

**WHEN**
- `PATCH /api/milestones/[id]` (bottleneck_type 업데이트) 처리 완료

**THEN**
- 어드민에게 `notifyBottleneck` 이메일이 발송된다
- 지연 유형과 챔피언명이 포함된다

**우선순위**: P1

---

### TC-EMAIL-06: E9 — no_charter Nudge 이메일 내용 검증

**IF**
- 어드민이 charter 미제출 챔피언에게 Nudge 발송

**WHEN**
- `POST /api/admin/nudge` (`nudgeType: 'no_charter'`) 처리 완료

**THEN**
- 챔피언 이메일로 subject `[AX] 과제정의서 제출을 기다리고 있습니다 🙏` 발송
- 본문에 쿠션어 포함 ("바쁜 일정 속에서도...")
- CTA 버튼이 `{APP_BASE_URL}/my-project/charter`로 연결

**우선순위**: P1

---

### TC-EMAIL-07: E9 — no_milestone Nudge 이메일 내용 검증

**IF**
- 어드민이 마일스톤 미등록 챔피언에게 Nudge 발송

**WHEN**
- `POST /api/admin/nudge` (`nudgeType: 'no_milestone'`) 처리 완료

**THEN**
- subject `[AX] 마일스톤 등록을 기다리고 있습니다 🙏` 발송
- CTA 버튼이 `{APP_BASE_URL}/my-project/milestones`로 연결

**우선순위**: P1

---

### TC-EMAIL-08: E9 — delayed_milestone Nudge 이메일 내용 검증

**IF**
- 어드민이 delayed 마일스톤 바를 클릭하여 Nudge 발송

**WHEN**
- `POST /api/admin/nudge` (`nudgeType: 'delayed_milestone', milestoneTitle: '...'`) 처리 완료

**THEN**
- subject `[AX] '{{마일스톤 제목}}' 마일스톤을 확인해주세요 🙏`에 마일스톤 제목이 정확히 삽입
- CTA 버튼이 `/my-project/milestones`로 연결
- `milestoneTitle`이 없으면 API가 400을 반환

**우선순위**: P1

---

### TC-EMAIL-09: 이메일 발송 실패 시 API 응답

**IF**
- SMTP 서버 연결이 불안정하거나 잘못된 이메일 주소

**WHEN**
- 이메일 발송 트리거 이벤트 발생

**THEN**
- 이메일 발송 실패가 API 응답에 영향을 주지 않는다 (fire-and-forget)
- 단, 서버 로그에 에러가 기록된다
- 이메일 실패로 인해 데이터 저장이 롤백되지 않는다

**우선순위**: P0

---

## [HOT] 핫라인

### TC-HOT-01: 챔피언 핫라인 메시지 전송

**IF**
- 챔피언이 로그인한 상태

**WHEN**
- 화면 우측 하단 HotlineFAB 클릭 → Tiptap 에디터에 내용 입력 → 전송

**THEN**
- `POST /api/hotline/messages`가 호출된다
- `hotline_messages` 테이블에 `sender_role = 'champion'`, `read_by_admin = false`로 저장된다
- 어드민에게 hotline 알림 이메일이 발송된다 (`notifyHotlineMessage`)
- 챔피언 화면에 전송된 메시지가 즉시 표시된다

**우선순위**: P1

---

### TC-HOT-02: 어드민 핫라인 인박스 — 스레드 목록 및 안 읽음 배지

**IF**
- 챔피언이 핫라인 메시지를 전송한 상태 (`read_by_admin = false`)

**WHEN**
- 어드민이 `/admin/hotline`에 접속

**THEN**
- 챔피언별 스레드 목록이 표시된다
- 안 읽은 메시지가 있는 스레드에 unread_count 배지가 표시된다
- 스레드 클릭 시 해당 챔피언과의 전체 메시지 이력이 표시된다
- 스레드 조회 시 `read_by_admin = true`로 자동 업데이트된다

**우선순위**: P1

---

### TC-HOT-03: 핫라인 파일 첨부

**IF**
- 챔피언 또는 어드민이 핫라인 메시지 작성 중

**WHEN**
- 파일 첨부 버튼 클릭 → 파일(이미지·문서 등 허용 MIME) 선택

**THEN**
- `POST /api/hotline/upload`가 호출된다
- 파일이 Supabase Storage `hotline` 버킷에 업로드된다
- 이미지인 경우 1년 TTL 서명 URL이 반환되어 메시지에 인라인으로 표시된다
- 50MB 초과 파일 업로드 시 `413` 응답이 반환된다
- 첨부 파일이 칩(chip) 형태로 에디터 하단에 표시된다

**우선순위**: P2

---

### TC-HOT-04: 어드민 → 챔피언 답장

**IF**
- 어드민이 `/admin/hotline`에서 특정 챔피언의 스레드를 보고 있는 상태

**WHEN**
- Tiptap 에디터에 내용 입력 후 전송

**THEN**
- `POST /api/admin/hotline/messages`가 호출된다
- `sender_role = 'admin'`, `read_by_champion = false`로 저장된다
- 챔피언의 HotlineFAB 또는 알림을 통해 답장을 확인할 수 있다

**우선순위**: P1

---

## [SEC] 보안·API

### TC-SEC-01: 미인증 API 호출 차단

**IF**
- Authorization 헤더 없이 API 호출

**WHEN**
- `GET /api/milestones`, `POST /api/charter/submissions` 등 JWT 필요 API 직접 호출

**THEN**
- `401 Unauthorized` 반환
- 데이터가 노출되지 않는다

**우선순위**: P0

---

### TC-SEC-02: 챔피언이 어드민 API 호출 시도

**IF**
- `is_admin = false`인 챔피언 JWT 보유

**WHEN**
- `POST /api/admin/nudge`, `PATCH /api/admin/submissions/[id]` 등 어드민 전용 API 직접 호출

**THEN**
- `403 Forbidden` 반환
- 데이터가 변경되지 않는다

**우선순위**: P0

---

### TC-SEC-03: 다른 챔피언의 데이터 접근 시도

**IF**
- 챔피언 A가 본인 JWT로 로그인

**WHEN**
- 챔피언 B의 `milestone_id`를 포함한 API 호출 (`GET /api/milestones/[B의 milestone_id]`)

**THEN**
- `403 Forbidden` 또는 `404 Not Found` 반환
- 챔피언 B의 데이터가 노출되지 않는다

**우선순위**: P0

---

### TC-SEC-04: Storage 파일 직접 URL 접근 차단

**IF**
- `submissions` 버킷의 파일 path를 알고 있는 상태

**WHEN**
- 서명 URL 없이 Supabase Storage 공개 URL로 파일 직접 접근 시도

**THEN**
- 접근이 차단된다 (RLS DENY ALL)
- 서명 URL(60s TTL)을 통해서만 다운로드 가능

**우선순위**: P0

---

### TC-SEC-05: Supabase 직접 DB 접근 차단

**IF**
- Supabase anon key를 보유한 클라이언트

**WHEN**
- anon key로 Supabase DB에 직접 SELECT/INSERT/UPDATE 시도

**THEN**
- RLS DENY ALL 정책에 의해 모든 쿼리가 차단된다
- 데이터가 반환되거나 변경되지 않는다

**우선순위**: P0

---

## [MOB] 모바일 UX

### TC-MOB-01: 챔피언 모바일 — BottomTabBar 표시

**IF**
- 챔피언이 모바일 브라우저(viewport width < 768px)로 접속

**WHEN**
- 챔피언 레이아웃 내 임의의 페이지 방문

**THEN**
- 하단에 BottomTabBar가 고정 표시된다
- 현재 활성 탭이 시각적으로 구분된다
- 탭 간 이동이 정상 동작한다

**우선순위**: P2

---

### TC-MOB-02: 어드민 모바일 — BottomTabBar 및 배지

**IF**
- 어드민이 모바일 브라우저로 접속

**WHEN**
- 어드민 레이아웃 내 페이지 방문

**THEN**
- 어드민용 BottomTabBar가 표시된다
- 처리 대기 중인 항목이 있으면 배지(숫자)가 표시된다

**우선순위**: P2

---

### TC-MOB-03: 챔피언 내 업무 현황 — 모바일 카드 레이아웃

**IF**
- 챔피언이 모바일 브라우저로 `/my-project/milestones`에 접속

**WHEN**
- 마일스톤 목록 확인

**THEN**
- 마일스톤이 테이블 대신 카드 형태로 표시된다
- 각 카드에 마일스톤명·상태·기한이 표시된다

**우선순위**: P2

---

### TC-MOB-04: 데스크톱 전용 페이지 — DesktopOnlyNotice

**IF**
- 챔피언 또는 어드민이 모바일 브라우저로 접속

**WHEN**
- 최종 제출 페이지 등 데스크톱 전용으로 지정된 페이지에 접근

**THEN**
- 컨텐츠 대신 `DesktopOnlyNotice` 컴포넌트가 표시된다
- "데스크톱에서 접근해 주세요" 안내 메시지가 표시된다

**우선순위**: P2

---

### TC-MOB-05: 어드민 리포트 — 모바일 카드 레이아웃

**IF**
- 어드민이 모바일 브라우저로 `/admin/reports`에 접속

**WHEN**
- 주간 리포트 페이지 확인

**THEN**
- 리포트가 테이블 대신 카드 형태로 렌더링된다
- PDF 인쇄 버튼은 표시되거나 숨겨질 수 있음 (UX 판단)

**우선순위**: P2

---

## [SESS] 1-on-1 세션

### TC-SESS-01: 세션 생성 — 클릭 시점 날짜·시각 자동 기록

**IF**
- 어드민이 로그인한 상태 (`is_admin = true`)
- 챔피언 상세 페이지(`/admin/champions/[userId]`)에서 [1-on-1 세션] 탭을 보고 있음

**WHEN**
- "세션 만들기" (또는 [생성]) 버튼 클릭

**THEN**
- `POST /api/sessions`가 호출된다
- `check_up_sessions.session_date`가 클릭 시점의 KST 날짜로 자동 저장된다
- `check_up_sessions.session_time`이 클릭 시점의 KST HH:mm으로 자동 저장된다
- 날짜·시각 수동 입력 UI가 표시되지 않는다
- 생성된 세션이 목록 상단에 즉시 노출되고 `날짜 HH:mm` 형식으로 표시된다

**우선순위**: P0

---

### TC-SESS-02: 세션 생성 — admin 전용 권한

**IF**
- `is_admin = false`인 챔피언 JWT 보유

**WHEN**
- `POST /api/sessions` 직접 호출 시도

**THEN**
- `403 Forbidden`이 반환된다
- `check_up_sessions` 테이블에 레코드가 생성되지 않는다

**우선순위**: P0

---

### TC-SESS-03: 오디오 파일 업로드 — 허용 형식 검증

**IF**
- 어드민이 세션 상세 페이지에서 오디오 업로드 영역을 보고 있음

**WHEN**
- wav, mp3, m4a, webm 파일을 각각 파일 선택기 또는 drag/drop으로 업로드

**THEN**
- 4개 형식 모두 업로드가 허용된다
- 파일 선택 후 업로드 진행 상태가 표시된다
- Supabase Storage `check-up-sessions` 버킷 경로 `sessions/{id}/audio.{ext}`에 저장된다

**우선순위**: P0

---

### TC-SESS-04: 오디오 파일 업로드 — 25MB 초과 차단

**IF**
- 어드민이 오디오 업로드 영역에서 파일을 선택

**WHEN**
- 25MB를 초과하는 오디오 파일 업로드 시도

**THEN**
- 클라이언트 또는 서버에서 업로드가 차단된다
- "파일 크기가 25MB를 초과합니다" 또는 동등한 오류 메시지가 표시된다
- `check_up_sessions.audio_file_path`가 업데이트되지 않는다

**우선순위**: P1

---

### TC-SESS-05: 오디오 파일 업로드 — drag/drop

**IF**
- 어드민이 세션 상세 페이지의 오디오 업로드 영역을 보고 있음

**WHEN**
- 허용된 형식(wav/mp3/m4a/webm)의 파일을 드래그하여 업로드 영역에 드롭

**THEN**
- 드롭 이벤트가 인식되어 파일이 업로드된다
- 드래그 중 업로드 영역에 hover 피드백(테두리 색상 변경 등)이 표시된다
- 파일 선택기를 통한 업로드와 동일하게 처리된다

**우선순위**: P1

---

### TC-SESS-06: 직접 업로드(서명 URL)로 대용량 파일 413 회귀 방지

**IF**
- 어드민이 30분 이상 녹음된 오디오 파일(4.5MB 초과)을 업로드하려는 상태

**WHEN**
- 오디오 파일을 업로드 (내부적으로 `POST /api/sessions/[id]/upload-url` 서명 URL 발급 → 클라이언트가 Supabase Storage에 직접 PUT)

**THEN**
- Vercel 함수 본문 4.5MB 한도(413 오류)가 발생하지 않는다
- 파일이 Supabase Storage에 직접 업로드된다
- 업로드 완료 후 `audio_file_path`만 서버 함수로 전달된다
- 25MB 이하 대용량 파일도 정상 업로드된다

**우선순위**: P0

---

### TC-SESS-07: 오디오 처리(STT+요약) — 정상 완료

**IF**
- 세션에 `audio_file_path`가 설정된 상태
- `processing_status = 'idle'`

**WHEN**
- `POST /api/sessions/[id]/process` 호출 (경로 JSON 전달)

**THEN**
- `processing_status`가 `transcribing → summarizing → done` 순으로 전이된다
- `raw_transcript`에 Whisper STT 결과가 저장된다
- `check_up_sessions.notes`에 LLM 요약 결과(markdown 형식)가 저장된다
- `session_action_items` 테이블에 AI가 추출한 액션 아이템이 생성된다
- 처리 완료 후 세션 상세 UI가 노트·액션아이템을 표시한다

**우선순위**: P0

---

### TC-SESS-08: 처리 락 — 동시 처리 시 409

**IF**
- 세션 `processing_status`가 `transcribing` 또는 `summarizing` 상태

**WHEN**
- `POST /api/sessions/[id]/process` 또는 `POST /api/sessions/[id]/reprocess`를 동시에 또는 재호출

**THEN**
- `409 Conflict`가 반환된다
- 이미 진행 중인 처리가 중단되거나 중복 실행되지 않는다
- 에러 응답에 "이미 처리 중입니다" 또는 동등한 메시지가 포함된다

**우선순위**: P0

---

### TC-SESS-09: LLM 노트 구조 — 수기 노트 보존 + AI 요약 추가

**IF**
- 어드민이 세션 노트 편집 화면에서 수기 내용을 작성하고 저장한 상태
- 이후 오디오 처리 또는 재처리를 실행

**WHEN**
- `POST /api/sessions/[id]/process` 또는 `/reprocess` 완료

**THEN**
- 기존 수기 노트 내용이 보존된다
- 구분선(`---`)과 "🤖 AI 요약" 헤딩이 삽입된다
- 구분선 아래에 AI 요약 내용이 추가된다
- 재처리 시 AI 요약 부분만 교체되고 수기 노트는 변경되지 않는다
- 재처리를 반복해도 AI 요약 섹션이 중첩되지 않는다

**우선순위**: P1

---

### TC-SESS-10: 미팅 노트 편집 토글 — 첫 세션 편집뷰 기본 열림

**IF**
- 세션이 생성되어 있고 `notes`가 비어 있는 상태 (녹음 중 또는 처리 전)

**WHEN**
- 어드민이 세션 상세 페이지에 진입

**THEN**
- 미팅 노트 영역이 편집 뷰(tiptap 에디터)로 기본 열린다
- [수정] 버튼이 표시되지 않는다

**우선순위**: P1

---

### TC-SESS-11: 미팅 노트 편집 토글 — 저장 후 read-only 복귀

**IF**
- 어드민이 세션 노트를 편집 중인 상태

**WHEN**
- 내용 작성 후 [저장] 버튼 클릭

**THEN**
- `PATCH /api/sessions/[id]`가 `{ notes, expectedUpdatedAt }` body로 호출된다
- 저장 성공 후 노트 영역이 read-only 뷰(react-markdown 렌더)로 전환된다
- [수정] 버튼이 표시된다
- [수정] 버튼 클릭 시 다시 편집 뷰가 열린다

**우선순위**: P1

---

### TC-SESS-12: 미팅 노트 markdown 포매팅 툴바

**IF**
- 어드민이 세션 노트 편집 뷰에 있는 상태

**WHEN**
- 툴바의 굵게/기울임/취소선/제목(H1·H2·H3)/글머리·번호 목록/인용/코드 버튼 클릭

**THEN**
- 각 서식이 에디터에 즉시 적용되어 WYSIWYG으로 표시된다
- 저장 시 markdown 형식(`**bold**`, `*italic*`, `## heading` 등)으로 DB에 저장된다
- 저장 후 read-only 뷰에서 react-markdown으로 정상 렌더링된다

**우선순위**: P2

---

### TC-SESS-13: 미팅 노트 낙관적 동시성 — 다른 관리자 수정 시 409

**IF**
- 어드민 A가 세션 노트를 편집 중인 상태
- 그 사이 어드민 B가 동일 세션 노트를 먼저 저장하여 `updated_at`이 변경됨

**WHEN**
- 어드민 A가 [저장] 버튼 클릭 (stale `expectedUpdatedAt` 전송)

**THEN**
- `PATCH /api/sessions/[id]`가 `409 Conflict`를 반환한다
- "다른 관리자가 먼저 수정했습니다" 또는 동등한 안내 메시지가 표시된다
- 어드민 A의 내용이 강제 덮어쓰기되지 않는다

**우선순위**: P1

---

### TC-SESS-14: 액션 아이템 인라인 편집 (admin)

**IF**
- 세션에 AI 생성 또는 수동 생성 액션 아이템이 존재
- 어드민이 로그인한 상태

**WHEN**
- 액션 아이템 텍스트 클릭 → 내용 수정 → 저장

**THEN**
- `PATCH /api/sessions/[id]/action-items/[itemId]`가 호출된다
- 수정된 텍스트가 `session_action_items.body`에 저장된다
- 저장 후 인라인 편집 모드가 종료되고 수정 내용이 표시된다

**우선순위**: P1

---

### TC-SESS-15: 액션 아이템 완료 토글 (champion)

**IF**
- Champion이 본인 세션의 상세 페이지를 보고 있음
- 완료되지 않은 액션 아이템이 존재

**WHEN**
- 액션 아이템 완료 체크박스 클릭

**THEN**
- `PATCH /api/sessions/[id]/action-items/[itemId]`가 `{ is_completed: true }` body로 호출된다
- `session_action_items.is_completed = true`, `completed_at`이 현재 시각으로 저장된다
- UI에서 해당 아이템이 완료 상태로 표시(취소선 등)된다
- Champion은 body 텍스트 수정이 불가하다 (403 또는 UI 비노출)

**우선순위**: P1

---

### TC-SESS-16: 세션 댓글 작성 — admin/champion 성공 (500 회귀 방지)

**IF**
- 어드민 또는 챔피언이 세션 상세 페이지에서 댓글 입력란을 보고 있음

**WHEN**
- 댓글 내용 입력 후 [등록] 버튼 클릭

**THEN**
- `POST /api/sessions/[id]/comments`가 호출된다
- `session_comments`에 `author_role = 'admin'` 또는 `'champion'`으로 저장된다
- 댓글이 화면에 즉시 표시된다
- admin이 댓글을 작성할 때 `public.users` 조인으로 인한 500 오류가 발생하지 않는다
- 작성자가 표시될 때 author_role 기반 fallback("관리자"/"챔피언")이 적용된다

**우선순위**: P0

---

### TC-SESS-17: Champion 세션 목록·상세 — 본인 세션만 조회 (RLS)

**IF**
- Champion A와 Champion B 각각의 세션이 존재

**WHEN**
- Champion A가 `GET /api/sessions` 또는 세션 목록 페이지(`/(champion)/my-project/sessions`) 접근

**THEN**
- Champion A 본인의 세션만 반환된다
- Champion B의 세션이 목록에 노출되지 않는다
- Champion A가 Champion B의 `session_id`로 `GET /api/sessions/[id]` 직접 호출 시 `403` 또는 `404`가 반환된다
- RLS 정책에 의해 DB 수준에서 차단된다

**우선순위**: P0

---

### TC-SESS-18: Admin 개별 계정 로그인·귀속

**IF**
- 개별 admin 계정(`admin_alex@`, `admin_claud@`, `admin_jennifer@dreamus.io`) 3개가 프로비저닝된 상태

**WHEN**
- 각 계정으로 로그인 후 세션 생성, 노트 수정, 댓글 작성 수행

**THEN**
- `check_up_sessions.admin_user_id`, 노트 수정 로그, `session_comments.author_id`에 각 계정의 개별 UUID가 저장된다
- 동시에 두 어드민이 로그인하여 각자 작업해도 서로의 작업이 덮어쓰이지 않는다

**우선순위**: P1

---

### TC-SESS-19: 기존 공유 admin 계정 비활성화 (로그인 차단)

**IF**
- 기존 공유 계정 `admin@dreamus.io`가 비활성화(ban + is_admin=false)된 상태

**WHEN**
- `admin@dreamus.io` 계정으로 로그인 시도

**THEN**
- 로그인이 차단된다 (Supabase ban 적용)
- 어드민 UI에 접근할 수 없다
- 계정이 DB에서 삭제되지 않아 기존 FK(세션·댓글 등)는 유지된다

**우선순위**: P0

---

### TC-SESS-20: UI — 과제정의서 기본 탭·컴팩트 헤더·마일스톤 tooltip

**IF**
- 어드민이 챔피언 상세 페이지(`/admin/champions/[userId]`)에 처음 진입

**WHEN**
- 페이지 초기 로딩 및 스크롤 다운

**THEN**
- 기본 선택 탭이 [과제정의서]로 표시된다
- 스크롤 다운 시 챔피언 이름·팀·프로젝트 3줄 헤더가 [챔피언 | 프로젝트] 컴팩트 고정 바로 전환된다
- 컴팩트 바는 스크롤 위치와 무관하게 화면 상단에 고정된다
- 마일스톤 이름이 긴 경우 hover 시 tooltip으로 전체 이름이 표시된다

**우선순위**: P2

---

### TC-SESS-21: 저장된 세션 — 녹음/업로드 패널 비노출

**IF**
- 세션에 `audio_file_path`가 설정된 상태 (이미 녹음·업로드 완료)

**WHEN**
- 어드민이 해당 세션 상세 페이지에 진입

**THEN**
- 녹음 시작(마이크) 버튼, 파일 올리기 버튼, 녹음 관련 UI가 표시되지 않는다
- 다운로드 영역(녹음 파일·전사·AI 요약)이 대신 표시된다
- 신규 세션(`audio_file_path = null`)은 기존 녹음/업로드 패널이 정상 표시된다

**우선순위**: P1

---

### TC-SESS-22: 오디오 파일 다운로드

**IF**
- 세션에 `audio_file_path`가 설정된 상태
- 어드민이 세션 상세 페이지의 다운로드 영역을 보고 있음

**WHEN**
- "녹음 파일" 다운로드 버튼 클릭

**THEN**
- `GET /api/sessions/[sessionId]/audio-url`가 호출된다
- 서버가 Supabase Storage 서명 URL을 반환한다
- 브라우저에서 오디오 파일이 다운로드된다
- champion 또는 미인증 사용자가 호출 시 `403`을 반환한다

**우선순위**: P1

---

### TC-SESS-23: 전사(transcript) 다운로드 — raw_transcript 존재 시

**IF**
- 세션의 `raw_transcript`가 존재하는 상태 (STT 처리 완료)

**WHEN**
- 어드민이 "전사" 다운로드 버튼 클릭

**THEN**
- `raw_transcript` 텍스트를 클라이언트에서 `.txt` Blob으로 생성한다
- 브라우저에서 `.txt` 파일이 다운로드된다
- 파일 내용이 Whisper 전사 원문과 일치한다

**우선순위**: P1

---

### TC-SESS-24: 전사(transcript) 다운로드 — raw_transcript 없을 때 안내

**IF**
- 세션의 `raw_transcript`가 null 또는 빈 문자열인 상태

**WHEN**
- 어드민이 전사 다운로드 영역 확인

**THEN**
- 전사 다운로드 버튼이 표시되지 않거나 비활성화된다
- "전사 결과 없음" 또는 동등한 안내 문구가 표시된다
- 다운로드를 시도할 수 없다

**우선순위**: P1

---

### TC-SESS-25: AI 요약 다운로드 (.md)

**IF**
- 세션의 `notes`(markdown)가 존재하는 상태

**WHEN**
- 어드민이 "AI 요약" 다운로드 버튼 클릭

**THEN**
- `notes` 값을 클라이언트에서 `.md` Blob으로 생성한다
- 브라우저에서 `.md` 파일이 다운로드된다
- 파일 내용이 DB의 `notes` 컬럼과 동일하다

**우선순위**: P2

---

### TC-SESS-26: 세션 제목 인라인 수정 — 성공

**IF**
- 어드민이 세션 상세 페이지를 보고 있음

**WHEN**
- 제목 옆 연필(✏️) 버튼 클릭 → 새 제목 입력 → 저장

**THEN**
- `PATCH /api/sessions/[sessionId]`가 `{ title, expectedUpdatedAt }` body로 호출된다
- `check_up_sessions.title`이 새 제목으로 저장된다
- 인라인 편집 모드가 종료되고 변경된 제목이 즉시 표시된다
- 세션 목록 화면에서도 수정된 제목이 반영된다

**우선순위**: P1

---

### TC-SESS-27: 세션 제목 인라인 수정 — 동시 수정 409

**IF**
- 어드민 A가 세션 제목을 편집 중인 상태
- 그 사이 어드민 B가 동일 세션을 먼저 수정하여 `updated_at`이 변경됨

**WHEN**
- 어드민 A가 저장 버튼 클릭 (stale `expectedUpdatedAt` 전송)

**THEN**
- `PATCH /api/sessions/[sessionId]`가 `409 Conflict`를 반환한다
- "다른 관리자가 먼저 수정했습니다" 또는 동등한 안내 메시지가 표시된다
- 어드민 A의 제목 변경이 강제 적용되지 않는다

**우선순위**: P1

---

## TC 커버리지 요약

| 영역 | TC 수 | P0 | P1 | P2 |
|---|:---:|:---:|:---:|:---:|
| AUTH 인증·권한 | 6 | 3 | 2 | 1 |
| CHARTER 과제정의서 | 9 | 0 | 4 | 5 |
| MS 마일스톤·WBS | 12 | 0 | 10 | 2 |
| SUB 제출·칸반 | 8 | 3 | 5 | 0 |
| DRAFT 임시저장 | 4 | 1 | 3 | 0 |
| ADMIN 대시보드 | 8 | 0 | 5 | 3 |
| NUDGE 넛지 | 5 | 1 | 3 | 1 |
| RPT 리포트 | 3 | 0 | 1 | 2 |
| DEL 지연 신고 | 4 | 0 | 4 | 0 |
| EMAIL 이메일 | 9 | 2 | 7 | 0 |
| HOT 핫라인 | 4 | 0 | 3 | 1 |
| SEC 보안·API | 5 | 5 | 0 | 0 |
| MOB 모바일 UX | 5 | 0 | 0 | 5 |
| SESS 1-on-1 세션 | 27 | 7 | 15 | 5 |
| **합계** | **109** | **22** | **62** | **25** |
