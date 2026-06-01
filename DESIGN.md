# FLO Design System — Web Implementation Guide

> **Source:** [FLO Design System 1.0 — Mobile (Figma)](https://www.figma.com/design/PYv3WwkQ8Ro0Z47wW7xwDi/FLO-Design-System-1.0--Mobile-?node-id=811-1832&m=dev)  
> **Nodes:** `811:1832` (Foundations) · `812:9072` (Resources)  
> **Environment:** **Web — Light Mode 우선**  
> **Stack:** Pretendard · Tailwind CSS · shadcn/ui (new-york, slate base) · CSS Variables  
> **Generated:** 2026-06-01

---

## Overview

**Web 환경에서는 Light 모드를 기본(default)으로 사용**하며, 다크 모드는 `<html>` 에 `.dark` 클래스를 추가하는 Tailwind class strategy로 전환한다. 현재 앱은 Light 모드만 동작 중이며, Dark 토큰은 준비 완료 상태다.

브랜드 컬러는 단일 액센트인 **Blue (`#3f3fff`)** 이며, 라이트 모드 기준으로 흰 배경 위에 진한 텍스트와 Blue 액센트 포인트로 구성된다. 타이포그래피는 **Pretendard**를 사용하며, 폰트 스케일은 `h50`(40px)부터 `caption2`(10px)까지 9단계로 정의된다.

**시스템의 핵심 특성:**
- **단일 액센트 컬러:** Blue (`{colors.accent}` — **#3f3fff** Light 기본 / #5868ff Dark). 프라이머리 버튼, 활성 상태, 인터랙티브 요소 전반에 사용.
- **라이트 모드 우선 (Light-first):** Web 기본값은 Light 모드. 토큰의 Light 값이 CSS 변수 초기값으로 설정되고, Dark는 `.dark` 클래스 override로 적용.
- **Pretendard 타입 패밀리:** Regular / Medium / Semibold / Bold 4개 웨이트 사용.
- **4px 기반 스페이싱 시스템:** 0, 2, 4, 8, 16, 20, 24, 32, 40, 48, 56, 64px.
- **원형 반지름 스케일:** 0, 4, 6, 8, 16, 20, 24, Circle(9999px).
- 음악 특화 컴포넌트: 미니플레이어, 플로팅 플레이어, 리스트 뷰, 차트 뷰, 태그 시스템.

---

## Font

Pretendard는 `app/layout.tsx`에 이미 import되어 있음. 추가 설정 불필요.

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
```

Tailwind에서는 항상 `font-sans` 클래스 사용 (Pretendard → Apple SD Gothic Neo → system-ui 순 폴백).

| 플랫폼 | 폰트 | 웨이트 |
|---|---|---|
| Web / AOS | **Pretendard** | 400 Regular · 500 Medium · 600 Semibold · 700 Bold |
| iOS | **System Font** (SF Pro) | 동일 웨이트 적용 |

---

## Color Palette (Base Tokens)

컴포넌트에서 직접 사용 금지 — 아래 Semantic Token을 통해서만 참조.

### Blue Scale (브랜드 메인)

| Token | Hex | 비고 |
|---|---|---|
| `blue_50` | `#f3f4fe` | Alt surface 배경 |
| `blue_400` | `#9aaaff` | |
| `blue_500` | `#768eff` | |
| `blue_600` | `#5868ff` | `static_accent` · Dark 모드 accent |
| `blue_700` | `#4356fe` | Dark 모드 accent pressed |
| `blue_800` | `#3f3fff` | **Light 모드 accent (Web 기본)** |
| `blue_900` | `#3634a3` | |

### Gray Scale (표면 계층)

Web Light 모드 기준, 밝은 쪽에서 어두운 쪽 순서:

| Token | Hex |
|---|---|
| `white` | `#ffffff` |
| `gray_f7` | `#f7f7f9` |
| `gray_f2` | `#f2f2f5` |
| `gray_eb` | `#ebebee` |
| `gray_e0` | `#e0e1e5` |
| `gray_d8` | `#d8d8dc` |
| `gray_bc` | `#bcbcc0` |
| `gray_8e` | `#8e8e93` |
| `gray_6c` | `#6c6c70` |
| `gray_56` | `#565658` |
| `gray_48` | `#48484a` |
| `gray_3a` | `#3a3a3c` |
| `gray_2c` | `#2c2c2e` |
| `gray_23` | `#232325` |
| `gray_1c` | `#1c1c1e` |
| `gray_18` | `#181818` |
| `black` | `#000000` |

### Status

| Token | Hex | 용도 |
|---|---|---|
| `red_light` | `#e5172f` | Error — Light 모드 |
| `red_dark` | `#ff334b` | Error — Dark 모드 |
| `info_light` | `#028af4` | Info — Light 모드 |
| `info_dark` | `#2b9df4` | Info — Dark 모드 |

---

## Semantic Tokens (CSS Variables)

`app/globals.css`에 정의. `<html>`에 `.dark` 클래스 추가 시 Dark 값으로 자동 전환.

```css
:root {
  color-scheme: light;
  /* Surface */
  --background:            #ffffff;
  --surface-primary:       #f2f2f5;
  --surface-secondary:     #f2f2f5;
  --surface-tertiary:      #f2f2f5;
  --surface-minimal:       #f7f7f9;
  --surface-alt:           #f3f4fe;
  /* Text */
  --text-primary:          #232325;
  --text-secondary:        #565658;
  --text-tertiary:         #8e8e93;
  --text-disabled:         #bcbcc0;
  --text-inverse:          #ffffff;
  /* Icon */
  --icon-enabled:          #232325;
  --icon-subtle:           #8e8e93;
  --icon-inactive:         #8e8e93;
  --icon-disabled:         #bcbcc0;
  /* Border */
  --border:                #ebebee;
  --border-subtle:         #f2f2f5;
  --border-selected:       #232325;
  /* Accent */
  --accent:                #3f3fff;
  --accent-pressed:        #5868ff;
  --accent-disabled:       #e0e1e5;
  --static-accent:         #5868ff;   /* always fixed — never changes */
  /* Status */
  --error:                 #e5172f;
  --info:                  #028af4;
  /* Component */
  --modal-background:      #ffffff;
  --toast-background:      #2c2c2e;   /* always fixed */
  --button-neutral:        #f2f2f5;
  --button-neutral-pressed:#e0e1e5;
  --loading-primary:       #d8d8dc;
  --loading-secondary:     #f2f2f5;
}

.dark {
  color-scheme: dark;
  /* Surface */
  --background:            #000000;
  --surface-primary:       #1c1c1e;
  --surface-secondary:     #232325;
  --surface-tertiary:      #2c2c2e;
  --surface-minimal:       #181818;
  --surface-alt:           #2c2c2e;
  /* Text */
  --text-primary:          #ffffff;
  --text-secondary:        #bcbcc0;
  --text-tertiary:         #8e8e93;
  --text-disabled:         #565658;
  --text-inverse:          #000000;
  /* Icon */
  --icon-enabled:          #ffffff;
  --icon-subtle:           #8e8e93;
  --icon-inactive:         #8e8e93;
  --icon-disabled:         #565658;
  /* Border */
  --border:                #48484a;
  --border-subtle:         #232325;
  --border-selected:       #ffffff;
  /* Accent */
  --accent:                #5868ff;
  --accent-pressed:        #4356fe;
  --accent-disabled:       #2c2c2e;
  /* Status */
  --error:                 #ff334b;
  --info:                  #2b9df4;
  /* Component */
  --modal-background:      #232325;
  --button-neutral:        #3a3a3c;
  --button-neutral-pressed:#565658;
  --loading-primary:       #1c1c1e;
  --loading-secondary:     #6c6c70;
}
```

### Surface & Background

| CSS Variable | **Light (기본)** | Dark | FLO Token |
|---|---|---|---|
| `var(--background)` | `#ffffff` | `#000000` | `background` |
| `var(--surface-primary)` | `#f2f2f5` | `#1c1c1e` | `surface_primary` |
| `var(--surface-secondary)` | `#f2f2f5` | `#232325` | `surface_secondary` |
| `var(--surface-tertiary)` | `#f2f2f5` | `#2c2c2e` | `surface_tertiary` |
| `var(--surface-minimal)` | `#f7f7f9` | `#181818` | `surface_minimal` |
| `var(--surface-alt)` | `#f3f4fe` | `#2c2c2e` | `surface_alt` |
| `var(--modal-background)` | `#ffffff` | `#232325` | `modal_background` |
| `var(--toast-background)` | `#2c2c2e` | `#2c2c2e` | `toast_background` (always fixed) |

### Text

| CSS Variable | **Light (기본)** | Dark | FLO Token |
|---|---|---|---|
| `var(--text-primary)` | `#232325` | `#ffffff` | `text_primary` |
| `var(--text-secondary)` | `#565658` | `#bcbcc0` | `text_secondary` |
| `var(--text-tertiary)` | `#8e8e93` | `#8e8e93` | `text_tertiary` |
| `var(--text-disabled)` | `#bcbcc0` | `#565658` | `text_disabled` |
| `var(--text-inverse)` | `#ffffff` | `#000000` | `text_inverse` |

### Interactive / Accent

| CSS Variable | **Light (기본)** | Dark | FLO Token |
|---|---|---|---|
| `var(--accent)` | `#3f3fff` | `#5868ff` | `accent` · `button_surface_accent` |
| `var(--accent-pressed)` | `#5868ff` | `#4356fe` | `button_surface_accent_pressed` |
| `var(--accent-disabled)` | `#e0e1e5` | `#2c2c2e` | `button_surface_accent_disabled` |
| `var(--static-accent)` | `#5868ff` | `#5868ff` | `static_accent` (always fixed) |

`--accent` → 프라이머리 CTA, 인터랙티브 상태.  
`--static-accent` → 인라인 링크, 정적 블루 요소.

### Icon

| CSS Variable | **Light (기본)** | Dark | FLO Token |
|---|---|---|---|
| `var(--icon-enabled)` | `#232325` | `#ffffff` | `icon_enabled` · `icon_active` |
| `var(--icon-subtle)` | `#8e8e93` | `#8e8e93` | `icon_subtle` · `icon_inactive` |
| `var(--icon-disabled)` | `#bcbcc0` | `#565658` | `icon_disabled` · `icon_pressed` |

### Border

| CSS Variable | **Light (기본)** | Dark | FLO Token |
|---|---|---|---|
| `var(--border)` | `#ebebee` | `#48484a` | `border` |
| `var(--border-subtle)` | `#f2f2f5` | `#232325` | `border_subtle` |
| `var(--border-selected)` | `#232325` | `#ffffff` | `border_selected` |

### Status

| CSS Variable | **Light (기본)** | Dark | FLO Token |
|---|---|---|---|
| `var(--error)` | `#e5172f` | `#ff334b` | `error` |
| `var(--info)` | `#028af4` | `#2b9df4` | `info` |

### Static (Always — 모드 무관)

| Token | 값 | 용도 |
|---|---|---|
| `static_white` | `#ffffff` | 항상 흰색 (프라이머리 버튼 레이블 등) |
| `static_black` | `#000000` | 항상 검정 |
| `var(--static-accent)` | `#5868ff` | 항상 Blue (다크 기준 고정) |
| `var(--toast-background)` | `#2c2c2e` | 항상 다크 토스트 배경 |

### Overlay / Gradation

| Token | 값 | 용도 |
|---|---|---|
| `overlay_70` | `rgba(0,0,0,0.7)` | 강한 딤 — 풀스크린 플레이어 |
| `overlay_50` | `rgba(0,0,0,0.5)` | 표준 모달 스크림 |
| `overlay_30` | `rgba(0,0,0,0.3)` | 약한 오버레이 |
| `overlay_10` | `rgba(0,0,0,0.1)` | 미세 딤 |
| `gradation_to_blue_subtle` | `#3f3fff` | Blue 서브틀 그라데이션 |

---

## Tailwind Color Class Reference

`tailwind.config.ts`에서 CSS Variable을 Tailwind 유틸리티로 매핑:

```tsx
// Text
"text-text-primary"        // var(--text-primary)
"text-text-secondary"      // var(--text-secondary)
"text-text-tertiary"       // var(--text-tertiary)
"text-text-disabled"       // var(--text-disabled)

// Backgrounds
"bg-background"            // var(--background)
"bg-surface-primary"       // var(--surface-primary)
"bg-surface-secondary"     // var(--surface-secondary)
"bg-surface-tertiary"      // var(--surface-tertiary)
"bg-surface-minimal"       // var(--surface-minimal)
"bg-surface-alt"           // var(--surface-alt)

// Borders
"border-border"            // var(--border)
"border-border-subtle"     // var(--border-subtle)
"border-border-selected"   // var(--border-selected)

// Accent
"bg-accent"                // var(--accent)
"text-accent"              // var(--accent)
"bg-static-accent"         // var(--static-accent)  ← static blue
"text-static-accent"

// Status
"text-error"               // var(--error)
"text-info"                // var(--info)
```

---

## Typography

FLO 타입 스케일을 Tailwind 유틸리티 (`text-flo-*`)로 매핑. 각 클래스는 `font-size` + `line-height`를 설정하며, font-weight는 별도 클래스로 지정.

| FLO Style | Size | Line Height | Default Weight | Tailwind Class |
|---|---|---|---|---|
| `h50` | 40px | 48px | Bold (700) | `text-flo-h50 font-bold` |
| `h100` | 28px | 36px | Bold (700) | `text-flo-h100 font-bold` |
| `h200` | 24px | 32px | Bold (700) | `text-flo-h200 font-bold` |
| `h300` | 20px | 28px | Bold (700) | `text-flo-h300 font-bold` |
| `h400` | 18px | 24px | Semibold (600) | `text-flo-h400 font-semibold` |
| `body1` | 16px | 22px | Regular (400) | `text-flo-body1` |
| `body1_strong` | 16px | 22px | Semibold (600) | `text-flo-body1 font-semibold` |
| `body2` | 14px | 20px | Regular (400) | `text-flo-body2` |
| `body2_strong` | 14px | 20px | Semibold (600) | `text-flo-body2 font-semibold` |
| `body2_underline` | 14px | 20px | Regular (400) | `text-flo-body2 underline` |
| `caption1` | 12px | 18px | Medium (500) | `text-flo-caption1 font-medium` |
| `caption1_strong` | 12px | 18px | Semibold (600) | `text-flo-caption1 font-semibold` |
| `caption2` | 10px | 12px | Medium (500) | `text-flo-caption2 font-medium` |
| `caption2_strong` | 10px | 12px | Semibold (600) | `text-flo-caption2 font-semibold` |

**원칙:** h50–h300은 Bold 기본, h400부터 하위는 Semibold로 전환. `body1`이 전체 시스템의 기본 본문 스타일. 캡션 계열은 Medium으로 작은 크기 가독성 확보.

### Font Weight Tokens

| Token | 값 | Tailwind |
|---|---|---|
| `font_weight_regular` | 400 | `font-normal` |
| `font_weight_medium` | 500 | `font-medium` |
| `font_weight_semibold` | 600 | `font-semibold` |
| `font_weight_bold` | 700 | `font-bold` |

---

## Spacing System

| Token | 값 | Tailwind 예시 |
|---|---|---|
| `spacing.0` | 0px | `p-0` |
| `spacing.2` | 2px | `p-0.5` |
| `spacing.4` | 4px | `p-1` |
| `spacing.8` | 8px | `p-2` |
| `spacing.16` | 16px | `p-4` |
| `spacing.20` | 20px | `p-5` |
| `spacing.24` | 24px | `p-6` |
| `spacing.32` | 32px | `p-8` |
| `spacing.40` | 40px | `p-10` |
| `spacing.48` | 48px | `p-12` |
| `spacing.56` | 56px | `p-14` |
| `spacing.64` | 64px | `p-16` |

기본 단위 **4px**. 컴포넌트 내부 패딩 기본 **16px**, 리스트 아이템 간격 0–8px, 섹션 간격 24–32px.

---

## Border Radius

| Token | 값 | Tailwind | 용도 |
|---|---|---|---|
| `radius.0` | 0px | `rounded-none` | 전체 너비 컴포넌트 |
| `radius.4` | 4px | `rounded` | 태그, 인디케이터, 소형 칩 |
| `radius.6` | 6px | `rounded-md` | 소형 버튼 |
| `radius.8` | 8px | `rounded-lg` | 기본 버튼, 인풋 필드 |
| `radius.16` | 16px | `rounded-2xl` | 카드, 모달 |
| `radius.20` | 20px | `rounded-[20px]` | 대형 카드, 썸네일 컨테이너 |
| `radius.24` | 24px | `rounded-3xl` | 풀 모달, 플로팅 컨테이너, 바텀시트 |
| `radius.Circle` | 9999px | `rounded-full` | 아바타, 원형 버튼, FAB |

---

## Shadows

FLO 그림자는 4단계. 다크 모드에서는 그림자 대신 표면 색상 계층(`surface_primary` → `surface_secondary` → `surface_tertiary`)으로 깊이 표현.

| Variable | Tailwind Class | Value | 용도 |
|---|---|---|---|
| `var(--shadow-s)` | `shadow-flo-s` | `0 1px 4px 0 rgba(0,0,0,.08), 0 1px 2px -1px rgba(0,0,0,.10)` | 카드 기본 |
| `var(--shadow-m)` | `shadow-flo-m` | `0 2px 8px 0 rgba(0,0,0,.12)` | 드롭다운, 팝오버 |
| `var(--shadow-l)` | `shadow-flo-l` | `0 4px 16px 0 rgba(0,0,0,.12)` | 모달, 바텀시트 |
| `var(--shadow-xl)` | `shadow-flo-xl` | `0 8px 24px 0 rgba(0,0,0,.16)` | 플로팅 플레이어 |

- **Overlay/Scrim:** 모달에 `overlay_50` (rgba(0,0,0,0.5)), 풀스크린 플레이어에 `overlay_70` 사용.

---

## Component Patterns

### Page Layout

```tsx
// 페이지 배경
<div className="min-h-screen bg-background">

// 사이드바 / 패널
<aside className="border-r border-border"
  style={{ background: 'var(--surface-primary)' }}>
```

### Card / Surface

```tsx
<div className="rounded-2xl border shadow-flo-s"
  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border)' }}>
```

### Primary Button (accent)

```tsx
<button
  className="px-4 py-2.5 rounded-lg text-flo-body2 font-semibold text-white transition-opacity hover:opacity-90"
  style={{ background: 'var(--accent)' }}>
  재생
</button>
```

### Ghost / Secondary Button

```tsx
<button
  className="px-3 py-1.5 rounded-lg text-flo-caption1 font-medium border transition-colors hover:bg-surface-secondary"
  style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
  취소
</button>
```

### Neutral Button

```tsx
<button
  className="px-4 py-2.5 rounded-lg text-flo-body2 font-semibold transition-colors"
  style={{ background: 'var(--button-neutral)', color: 'var(--text-primary)' }}>
  더보기
</button>
```

### Active Nav Item

```tsx
// 반투명 accent 배경
style={{
  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
  color: 'var(--accent)',
}}
```

### Text Hierarchy

```tsx
<h1 className="text-flo-h400 font-semibold" style={{ color: 'var(--text-primary)' }}>
  제목
</h1>
<p className="text-flo-body2" style={{ color: 'var(--text-secondary)' }}>
  본문 텍스트
</p>
<span className="text-flo-caption1 font-medium" style={{ color: 'var(--text-disabled)' }}>
  보조 설명
</span>
```

### Skeleton Loading

```tsx
<div className="rounded-lg animate-pulse"
  style={{ background: 'var(--loading-primary)' }}>
  <div className="h-2 rounded" style={{ background: 'var(--loading-secondary)' }} />
</div>
```

### Music List Item

```tsx
<div className="flex items-center gap-3 px-4 py-2">
  <img className="w-10 h-10 rounded object-cover" src={thumbnail} />
  <div className="flex-1 min-w-0">
    <p className="text-flo-body2 font-medium truncate" style={{ color: 'var(--text-primary)' }}>
      {title}
    </p>
    <p className="text-flo-caption1 font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
      {artist}
    </p>
  </div>
  <button style={{ color: 'var(--icon-subtle)' }}>•••</button>
</div>
```

---

## Components

### Buttons

**`button-accent`** — `var(--accent)` fill, 흰 텍스트, `radius.8`, `body1_strong`. 프라이머리 CTA 전반 (재생, 구독, 확인).

**`button-accent-pressed`** — `var(--accent-pressed)`.

**`button-accent-disabled`** — `var(--accent-disabled)`, `var(--text-disabled)` 텍스트.

**`button-neutral`** — `var(--button-neutral)` fill, `var(--text-primary)` 텍스트. 보조 CTA (취소, 더보기).

**`button-pill`** — `radius.Circle`. 태그 선택, 장르 필터 칩.

**`button-text`** — 배경 없음. `var(--text-secondary)` 텍스트. 인라인 액션 링크.

### Navigation

**`tab-bar`** — 고정 하단 탭바. 아이콘(`24×24px`) + 레이블 구조. 활성 탭은 `var(--icon-enabled)`, 비활성은 `var(--icon-inactive)`.  
아이콘: `com_home` · `com_browse` · `com_search` · `com_library`

**`mini-player`** — 탭바 위 상주. 썸네일 + 곡명/아티스트 + 재생/일시정지 + 다음곡. `shadow-flo-l` 적용.

### Cards

**`music-list-item`** — 썸네일(정사각형, `radius.4`–`radius.8`) + 곡명(`body1`) + 아티스트명(`body2`, `text-secondary`) + 더보기 버튼. 차트 뷰에서 순위 숫자 + `com_rank_up` / `com_rank_down` 추가.

**`album-card`** — 1:1 썸네일, `radius.8` 클리핑. 앨범명 + 아티스트명 2줄.

**`artist-card`** — `radius.Circle` 원형 썸네일. 아티스트명 1줄.

**`playlist-card`** — 1:1 썸네일, `radius.8`. 플레이리스트 이름 + 곡 수.

### Tags (태그 시스템)

콘텐츠 속성을 나타내는 전용 이미지 리소스. **리사이징 불가 — 원본 사이즈 그대로 사용.**

**16px 높이:**
`tag_expiration` · `tag_terms` · `tag_unreleased` · `tag_flac` · `tag_mp3` · `tag_ipod` · `tag_downloaded` · `tag_on_display` · `tag_free` · `tag_main_track` · `tag_new` · `tag_up` · `tag_tip` · `tag_original` · `tag_recommend`

**14px 높이 (리스트 인라인):**
`tag_up_14` · `tag_original_track_14` · `tag_beta_14`

**계정 연동 (40×40px):**
`tag_account_email_40` · `tag_account_mobile_40` · `tag_account_kakao_40` · `tag_account_apple_40` · `tag_account_naver_40` · `tag_account_tid_40`

### Icons

기본 사이즈 `24×24px`, 재생 컨트롤용 `40×40px` 추가.

- **내비게이션:** `com_home` · `com_browse` · `com_search` · `com_library` · `com_notification` · `com_settings`
- **재생 컨트롤:** `com_play` · `com_pause` · `com_skip_next` · `com_skip_previous` · `com_shuffle` · `com_repeat` · `com_repeat_one` · `com_repeat_all` · `com_forward` · `com_replay`
- **유틸리티:** `com_favorite` · `com_favorite_filled` · `com_add` · `com_more_vert` · `com_share` · `com_download` · `com_close_regular` · `com_check` · `com_queue` · `com_queue_add`
- **음악 특화:** `com_lyrics` · `com_equalizer` · `com_timer` · `com_volume_up` · `com_volume_off`
- **SNS/계정:** `com_kakao` · `com_naver` · `com_apple` · `com_email` · `com_phone`

### Player

**`full-player`** — 풀스크린. 앨범아트 중앙 배치, `player_surface_base*` 컬러로 앨범 컬러 적응형 배경. 컨트롤: `com_favorite_filled` · 이전곡 · 재생/정지 · 다음곡 · 재생목록 추가.

**로딩 애니메이션:** `img_play_loading_1`–`_36` (White), `img_play_loading_blue_1`–`_36` (Blue) 프레임 시퀀스.

### Modal / Bottom Sheet

배경 `var(--modal-background)`. 상단 그랩 핸들 + `radius.24` 상단 코너. 내부 표면 `modal_surface_primary` / `modal_surface_secondary`. 스크림 `overlay_50`.

### Empty States

Light / Dark 각각 별도 Artwork 리소스:
`artwork_search` · `artwork_music` · `artwork_like` · `artwork_save` · `artwork_album` · `artwork_following` · `artwork_lyrics` · `artwork_wifi` · `artwork_alarm` 등.

### Loading States

**스켈레톤:** `var(--loading-primary)` 기본 + `var(--loading-secondary)` 시머 애니메이션.

**FLO 로딩:** `img_flo_loading_1`–`_49` 프레임 시퀀스 (Light / Dark 별도).

---

## Service Colors (서드파티)

| Token | 용도 |
|---|---|
| `service.naver` | 네이버 초록 |
| `service.kakao` | 카카오 노랑 |
| `service.tid` | T아이디 |
| `service.nugu` | SKT NUGU |

---

## Token Naming Convention

```
{element}_{variant}_{state}

Elements:  background · surface · text · icon · border · button_surface
Variants:  primary · secondary · tertiary · minimal · subtle · alt · inverse
States:    active · inactive · enabled · disabled · pressed · focus
```

---

## Responsive Behavior

FLO Web은 **데스크톱 / 태블릿 / 모바일 브라우저** 세 환경을 지원한다.

| Breakpoint | Width | 주요 변경 |
|---|---|---|
| Mobile | < 768px | 1열 레이아웃, 하단 고정 미니플레이어, 탭바 하단 |
| Tablet | 768px – 1024px | 2열 그리드, 사이드바 축소 |
| Desktop | > 1024px | 좌측 고정 사이드 내비, 콘텐츠 최대 너비 1280px, 플레이어 하단 고정바 |

**터치 타깃:** 최소 44×44px (모바일 브라우저), 데스크톱 32×32px 허용.

---

## Dark Mode

Tailwind `class` 전략 — `<html>`에 `.dark` 클래스 추가.  
모든 FLO 토큰의 Dark override는 `app/globals.css`에 정의 완료.  
현재 앱은 Light 모드만 동작 중; 다크 토큰은 활성화 준비 상태.

---

## File Map

| 파일 | 역할 |
|---|---|
| `app/globals.css` | 모든 CSS 변수 (FLO 토큰 + shadcn hsl 변수) |
| `tailwind.config.ts` | 토큰 매핑, FLO 타입 스케일, 그림자 정의 |
| `app/layout.tsx` | Pretendard CDN import |
| `components.json` | shadcn 설정 (new-york, slate base, cssVariables) |

---

## Known Gaps

- **Web 전용 컴포넌트 미정의:** 이 시스템은 Mobile 앱 기반. 데스크톱 사이드바, 호버 상태, 포커스 링 등 Web 전용 패턴은 토큰을 재활용해 별도 정의 필요.
- **Hover 상태:** 모바일 원본에 hover 없음. Web에서는 `var(--surface-secondary)` 배경을 hover tint로 활용 권장.
- **Focus ring:** 접근성 대응 시 `var(--accent)` 2px outline 사용.
- **다크 모드 그라데이션:** `player_surface_base*` 토큰의 불투명도 값은 플레이어 배경 컬러에 따라 동적 결정.
- **Animation 스펙:** 로딩 애니메이션 프레임 인터벌 및 이징은 Lottie/JSON 파일에서 별도 관리.
- **Radius 6px:** 토큰으로 존재하나 사용처 제한적 — 소형 버튼 전용.