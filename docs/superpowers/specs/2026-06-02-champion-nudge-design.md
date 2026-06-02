# Champion Nudging Userflow 디자인

## 목적

어드민이 대시보드에서 특정 챔피언을 직접 넛지(nudge)할 수 있는 기능.
이메일 한 번으로 행동을 촉진하되, 받는 사람이 부담을 느끼지 않도록 쿠션어를 포함한다.

**Admin view 전용** — 챔피언 뷰(`/(champion)/`)에서는 이 기능이 노출되지 않는다.

---

## 트리거 2가지

### 트리거 1 — "확인 요함" 칩 클릭
- 위치: `ChampionGanttView` 상단 "확인 요함" 섹션의 챔피언 chip
- 조건: `isAdmin === true`일 때만 클릭 가능
- 넛지 유형: 칩이 속한 서브섹션에 따라 결정
  - "과제정의서 미제출" 섹션 → `nudgeType: 'no_charter'`
  - "마일스톤 미등록" 섹션 → `nudgeType: 'no_milestone'`

### 트리거 2 — Gantt delayed 바 클릭
- 위치: `ChampionGanttView` gantt 차트 내 `status === 'delayed'` 태스크 바
- 조건: `isAdmin === true`이고, 클릭된 task가 delayed 상태일 때만 popover 표시
- 넛지 유형: `nudgeType: 'delayed_milestone'`
- milestone title은 task ID → GanttMilestone 역조회로 확보

---

## Popover UI

앵커 방식: 클릭 위치 기준으로 fixed-positioned div를 렌더링한다.

- "확인 요함" 칩: `getBoundingClientRect()`로 chip 위치 계산 → 칩 아래 20px 오프셋
- Gantt 바: gantt container에 `onMouseMove`로 마지막 마우스 좌표 트래킹 → 해당 위치 기준

```
┌──────────────────────┐
│  황인성(Alex)         │  ← 챔피언 이름
│  과제정의서 미제출    │  ← 이슈 유형 레이블
│                      │
│  [  찌르기  📧 ]     │  ← amber CTA 버튼
└──────────────────────┘
```

**상태 흐름:**
1. 기본 → 찌르기 버튼 활성
2. 발송 중 → 버튼 disabled + loading spinner
3. 성공 → popover 닫힘 + `sonner` toast "📧 넛지 메일을 발송했습니다"
4. 실패 → toast error + 버튼 재활성

**닫기:** 외부 클릭(mousedown) 시 dismiss. 발송 중에는 dismiss 불가.

---

## API

### `POST /api/admin/nudge`

**인증:** `verifyJWT` + `user.user_metadata?.is_admin` 확인 (admin이 아니면 403)

**Request body:**
```typescript
{
  userId: string
  nudgeType: 'no_charter' | 'no_milestone' | 'delayed_milestone'
  milestoneTitle?: string  // delayed_milestone 타입일 때 필수
}
```

**처리 흐름:**
1. users 테이블에서 `{ id, email, name }` 조회
2. `nudgeChampion()` 호출 (notifications.ts)
3. `{ ok: true }` 반환

**에러:**
- 400: `userId` 없음 또는 `delayed_milestone` 타입인데 `milestoneTitle` 없음
- 403: 비어드민
- 404: 유저 없음
- 500: 이메일 발송 실패

---

## 이메일

### 공통 쿠션어

> 바쁜 일정 속에서도 AX 프로젝트를 함께해 주셔서 진심으로 감사드립니다.
> 번거로우시겠지만, 잠깐만 아래 내용을 확인해 주시면 정말 감사하겠습니다.

### Type A — `no_charter`

- **Subject:** `[AX] 과제정의서 제출을 기다리고 있습니다 🙏`
- **본문:** 쿠션어 + "AX Champion 과제정의서를 제출해주세요."
- **CTA 링크:** `{APP_BASE_URL}/my-project/charter` → 버튼 텍스트 "과제정의서 작성하기"

### Type B — `no_milestone`

- **Subject:** `[AX] 마일스톤 등록을 기다리고 있습니다 🙏`
- **본문:** 쿠션어 + "과제정의서에 마일스톤을 등록해주세요."
- **CTA 링크:** `{APP_BASE_URL}/my-project/milestones` → 버튼 텍스트 "마일스톤 등록하기"

### Type C — `delayed_milestone`

- **Subject:** `[AX] '{{milestoneTitle}}' 마일스톤을 확인해주세요 🙏`
- **본문:** 쿠션어 + "{{milestoneTitle}} 마일스톤을 완료해주세요. 혹시 병목이 생긴다면 [내 업무 현황] > [이슈 보고/도움 요청]을 해 주세요."
- **CTA 링크:** `{APP_BASE_URL}/my-project/milestones` → 버튼 텍스트 "마일스톤 확인하기"

### 이메일 HTML 스타일
기존 `notifications.ts` 패턴 그대로 사용 (inline style, max-width 560px, `-apple-system` font).

---

## 변경 파일 목록

| 파일 | 유형 | 역할 |
|------|------|------|
| `components/NudgePopover.tsx` | 신규 | 앵커 popover + 찌르기 버튼 UI |
| `app/api/admin/nudge/route.ts` | 신규 | 넛지 이메일 발송 API |
| `lib/notifications.ts` | 수정 | `nudgeChampion()` 함수 추가 |
| `components/ChampionGanttView.tsx` | 수정 | `isAdmin` prop, 클릭 핸들러, NudgePopover 연결 |
| `app/admin/page.tsx` | 수정 | `<ChampionGanttView isAdmin />` |

---

## 범위 밖 (이번 구현에서 제외)

- 넛지 발송 이력 기록 (DB 저장)
- 동일 챔피언 재발송 제한 (rate limiting)
- 챔피언 view에서의 넛지 노출
