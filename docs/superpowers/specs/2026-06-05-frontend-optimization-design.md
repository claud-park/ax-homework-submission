# Frontend Performance Optimization — Design Spec

**Date:** 2026-06-05  
**Branch:** feature/optimization  
**Author:** claud-park  

---

## 1. Problem Statement

현재 AX Champions' League 앱은 세 가지 레이어에서 성능 병목이 발생하고 있다.

### 1-1. 페이지 전환 — Full Page Reload
`app/(champion)/layout.tsx`의 사이드바 네비게이션이 `<Link>` 대신 `<a href>`를 사용한다.
Next.js App Router에서 `<a href>`는 SPA 클라이언트 라우팅을 무시하고 전체 페이지를 다시 로드한다.
모든 네비게이션이 브라우저 hard navigate를 유발 → JS 번들 재파싱, 레이아웃 재마운트, 모든 데이터 재요청.

### 1-2. 데이터 로딩 — Client-side Waterfall
모든 페이지(`app/(champion)/`, `my-project/*`, `admin/*`)가 `'use client'` + `useEffect` 패턴으로 데이터를 fetch한다.
```
유저가 페이지 진입
→ HTML 수신 (데이터 없음, 빈 화면)
→ JS 번들 파싱 & React hydration
→ useEffect 실행
→ apiFetch() → getToken() → getSession() [async]
→ fetch('/api/...') → API Route → Supabase [async]
→ setState → re-render
→ 유저가 데이터를 봄
```
유저는 최소 2-3 async round trip 동안 빈 화면 또는 스피너를 본다.

### 1-3. 번들 크기 — Eager Loading
아래 라이브러리들이 모든 페이지 초기 번들에 포함된다:

| 라이브러리 | 실제 사용 위치 | 추정 크기 |
|---|---|---|
| `gantt-task-react` | 전체현황(데스크톱), admin 대시보드 | ~200KB |
| `@tiptap/*` (5개 패키지) | charter 페이지 에디터 | ~150KB |
| `jspdf` + `html2canvas` | charter PDF 내보내기 버튼 | ~400KB |
| `docx` | charter Word 내보내기 버튼 | ~150KB |

합계 ~900KB가 불필요하게 모든 페이지 로드 시 파싱된다.

### 1-4. 폰트 로딩 — Render-Blocking CDN
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
```
외부 CDN CSS가 렌더 블로킹을 유발하고, CDN 레이턴시만큼 FCP가 지연된다.

---

## 2. Goals

- **FCP (First Contentful Paint)** < 1.0s (현재 추정 2.5s+)
- **LCP (Largest Contentful Paint)** < 2.5s
- **TTFB (Time To First Byte)** < 200ms
- **페이지 전환** 딜레이 없이 즉각 반응 (SPA 라우팅)
- **JS 초기 번들** 30%+ 감소

---

## 3. Architecture Decision

### 결정: Server Components Migration (Option B)

**검토한 대안들:**

| 옵션 | 장점 | 단점 | 결정 |
|---|---|---|---|
| A. SWR + 코드스플리팅 | 리스크 낮음, 빠른 적용 | 근본 waterfall 미해결, 캐싱 무효화 복잡도 | 기각 |
| **B. Server Components 전환** | **근본 문제 해결, 서버 HTML에 데이터 포함** | **인증 패턴 변경 필요, 파일 분리 작업** | **채택** |
| C. 점진적 하이브리드 | 균형 | 중간 상태가 오래 지속될 수 있음 | 기각 |

**B를 선택한 이유:**
1. 데이터가 HTML에 포함되어 전달되므로 hydration 즉시 화면이 완성된 상태
2. Next.js 14 App Router가 Server Components를 기본으로 설계됨 — 현재 코드가 오히려 의도를 역행하는 구조
3. `@supabase/ssr`이 이미 서버 클라이언트를 지원하고, `middleware.ts`도 이미 서버에서 auth 검증 중
4. 장기적으로 캐싱 전략(`fetch` cache, `revalidate`) 추가가 용이

### 핵심 원칙

```
Read  (조회): Server Component → Supabase 직접 쿼리 (API route bypass)
Write (변경): Client Component → 기존 API route 유지 (auth 로직 재사용)
Interactive : Client Component ('use client'), data는 props로 전달
Heavy libs  : dynamic import (lazy load)
```

---

## 4. Component Structure

### 4-1. 파일 분리 패턴

모든 데이터 fetch가 있는 페이지는 아래 패턴으로 분리:

```
app/(champion)/my-project/milestones/
  page.tsx             ← Server Component (fetch + auth check)
  MilestonesClient.tsx ← 'use client' (기존 interactive 로직)
```

```typescript
// page.tsx (Server Component)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { MilestonesClient } from './MilestonesClient'

export default async function MilestonesPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: milestones }, { data: charter }] = await Promise.all([
    supabase.from('milestones').select('*').eq('user_id', user.id).order('display_order'),
    supabase.from('charter_submissions').select('id, admin_approved_at').eq('user_id', user.id).single(),
  ])

  return <MilestonesClient initialMilestones={milestones ?? []} charterApproved={!!charter?.admin_approved_at} />
}
```

### 4-2. Layout 분리

`app/(champion)/layout.tsx` 전체를 Server Component로 변환:

```
ChampionLayout (Server Component)
  ├── 유저 이름: 서버에서 supabase.auth.getUser()로 가져옴
  ├── <Link> 사용 (SPA 라우팅)
  └── SidebarDrawer (Client Component) — 모바일 drawer 열림/닫힘만 관리
```

### 4-3. Dynamic Import 대상

```typescript
// 1. ChampionGanttView — 데스크톱 전체현황, admin 대시보드
const ChampionGanttView = dynamic(
  () => import('@/components/ChampionGanttView'),
  { loading: () => <GanttSkeleton />, ssr: false }
)

// 2. TipTap 에디터 — charter 페이지
const RichEditor = dynamic(
  () => import('@/components/RichEditor'),
  { loading: () => <EditorSkeleton />, ssr: false }
)

// 3. PDF/Word 내보내기 — 버튼 클릭 시 on-demand
async function handleExportPDF() {
  const { exportToPDF } = await import('@/lib/export-pdf')
  await exportToPDF(content)
}
```

---

## 5. Font Optimization

**현재:**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
```

**변경:**
```typescript
// app/layout.tsx
import localFont from 'next/font/local'

const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-pretendard',
  weight: '100 900',
})
```

- `PretendardVariable.woff2` (~500KB)를 `public/fonts/`에 추가
- CDN 의존 제거, 렌더 블로킹 제거
- `display: swap` → FOUT 허용, 레이아웃 시프트 없음

---

## 6. Metrics

### Before (baseline) — 구현 전 측정

| 지표 | 측정 방법 | 측정값 |
|---|---|---|
| FCP | Lighthouse (Incognito, throttled 4G) | TBD |
| LCP | Lighthouse | TBD |
| TTFB | Chrome DevTools Network | TBD |
| 페이지 전환 (전체현황→과제정의서) | DevTools Navigation timing | TBD |
| JS 초기 번들 | `next build` First Load JS | TBD |

### After (목표)

| 지표 | 목표값 |
|---|---|
| FCP | < 1.0s |
| LCP | < 2.5s |
| TTFB | < 200ms |
| 페이지 전환 | < 300ms (full reload → SPA) |
| JS 번들 감소 | 30%+ |

---

## 7. Implementation Phases

### Phase 1 — 네비게이션 & 폰트 (즉각 체감)
- `<a href>` → `<Link>` 전환 (layout.tsx)
- Layout을 Server Component로 변환
- Pretendard → `next/font/local`

### Phase 2 — Server Components 전환 (데이터 로딩)
- `app/(champion)/page.tsx`
- `app/(champion)/my-project/milestones/page.tsx`
- `app/(champion)/my-project/charter/page.tsx`
- `app/(champion)/my-project/submission/page.tsx`
- Admin pages

### Phase 3 — Bundle 최적화 (번들 크기)
- `ChampionGanttView` dynamic import
- TipTap dynamic import + 에디터 분리
- jsPDF + html2canvas + docx on-demand import

---

## 8. Risks & Mitigations

| 리스크 | 대응 |
|---|---|
| Server Component에서 auth 컨텍스트 손실 | `@supabase/ssr` cookies() 패턴 사용, middleware와 동일 |
| `useEffect` 의존 로직 깨짐 | Client Component에 그대로 유지, initialData props 추가 |
| Dynamic import로 인한 CLS | Skeleton UI로 placeholder 처리 |
| 폰트 woff2 파일 크기 | Variable font 단일 파일 사용, preload 힌트 추가 |
