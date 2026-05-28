# FLO Design System — Web Implementation Guide

**Source:** [FLO Design System 1.0 — Mobile (Figma)](https://www.figma.com/design/PYv3WwkQ8Ro0Z47wW7xwDi/FLO-Design-System-1.0--Mobile-?node-id=15785-10&m=dev)

Stack: **Pretendard** · **Tailwind CSS** · **shadcn/ui (new-york, slate base)** · **CSS Variables**

---

## Font

Pretendard is already imported in `app/layout.tsx`. No additional setup needed.

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
```

Always use `font-sans` Tailwind class (maps to Pretendard → Apple SD Gothic Neo → system-ui).

Available weights: **400** Regular · **500** Medium · **600** Semibold · **700** Bold

---

## Color Palette (Base Tokens)

These raw palette values are referenced by semantic tokens. Do not use directly in components — use semantic tokens below.

### Gray Scale

| Token | Hex |
|---|---|
| `gray_100` | `#f8fafc` |
| `gray_150` | `#f1f5f9` |
| `gray_200` | `#e2e8f0` |
| `gray_250` | `#dce3ec` |
| `gray_300` | `#cbd5e1` |
| `gray_400` | `#94a3b8` |
| `gray_500` | `#64748b` |
| `gray_600` | `#475569` |
| `gray_650` | `#3c4a5e` |
| `gray_700` | `#334155` |
| `gray_750` | `#273347` |
| `gray_800` | `#1e293b` |
| `gray_850` | `#131c2b` |
| `gray_900` | `#0f172a` |

### Blue Scale

| Token | Hex | Note |
|---|---|---|
| `blue_50` | `#eff6ff` | |
| `blue_400` | `#60a5fa` | |
| `blue_500` | `#3b82f6` | |
| `blue_600` | `#2563eb` | `static_accent` — always this value |
| `blue_700` | `#1d4ed8` | |
| `blue_800` | `#1e40af` | `accent` in light mode |
| `blue_900` | `#1e3a8a` | |

### Status

| Token | Hex |
|---|---|
| `red_600` | `#dc2626` |
| `red_700` | `#b91c1c` |
| `sky_blue_600` | `#0284c7` |
| `sky_blue_700` | `#0369a1` |

---

## Semantic Tokens (CSS Variables)

Defined in `app/globals.css`. Automatically switch between light and dark via `.dark` class on `<html>`.

### Surface & Background

| CSS Variable | Light | Dark | FLO Token |
|---|---|---|---|
| `hsl(var(--background))` | `#f8fafc` | `#000000` | `background` |
| `var(--surface-primary)` | `#ffffff` | `#1e293b` | `modal_background` · `surface_secondary` (dark) |
| `var(--surface-secondary)` | `#f1f5f9` | `#131c2b` | `gray_150` · `surface_primary` (dark) |
| `var(--surface-tertiary)` | `#e2e8f0` | `#273347` | `gray_200` · `surface_tertiary` (dark) |
| `var(--surface-minimal)` | `#f8fafc` | `#0f172a` | `surface_minimal` |

### Text

| CSS Variable | Light | Dark | FLO Token |
|---|---|---|---|
| `var(--text-primary)` | `#1e293b` | `#ffffff` | `text_primary` |
| `var(--text-secondary)` | `#475569` | `#94a3b8` | `text_secondary` |
| `var(--text-tertiary)` | `#64748b` | `#64748b` | `text_tertiary` |
| `var(--text-disabled)` | `#94a3b8` | `#475569` | `text_disabled` |

### Interactive / Accent

| CSS Variable | Light | Dark | FLO Token |
|---|---|---|---|
| `var(--accent)` | `#1e40af` | `#2563eb` | `accent` · `button_surface_accent` |
| `var(--blue-600)` | `#2563eb` | `#2563eb` | `static_accent` (always fixed) |

Use `--accent` for primary CTAs and interactive states. Use `--blue-600` for links, inline icons, and static blue elements.

### Border

| CSS Variable | Light | Dark | FLO Token |
|---|---|---|---|
| `var(--border-subtle)` | `#e2e8f0` | `#334155` | `border` |
| `var(--border-faint)` | `#f1f5f9` | `#1e293b` | `border_subtle` |

### Status

| CSS Variable | Light | Dark | FLO Token |
|---|---|---|---|
| `var(--error)` | `#b91c1c` | `#dc2626` | `error` |
| `var(--success)` | `#16a34a` | `#4ade80` | — |
| `var(--amber)` | `#d97706` | `#fbbf24` | — |

---

## Typography

FLO type scale mapped to Tailwind utilities (`text-flo-*`). All classes set `font-size` + `line-height`; add `font-weight` class separately.

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
| `caption1` | 12px | 18px | Medium (500) | `text-flo-caption1 font-medium` |
| `caption1_strong` | 12px | 18px | Semibold (600) | `text-flo-caption1 font-semibold` |
| `caption2` | 10px | 12px | Medium (500) | `text-flo-caption2 font-medium` |
| `caption2_strong` | 10px | 12px | Semibold (600) | `text-flo-caption2 font-semibold` |

---

## Shadows

FLO shadows as CSS variables and Tailwind utilities:

| Variable | Tailwind Class | Value |
|---|---|---|
| `var(--shadow-s)` | `shadow-flo-s` | `0 1px 4px 0 rgba(0,0,0,.08), 0 1px 2px -1px rgba(0,0,0,.10)` |
| `var(--shadow-m)` | `shadow-flo-m` | `0 2px 8px 0 rgba(0,0,0,.12)` |
| `var(--shadow-l)` | `shadow-flo-l` | `0 4px 16px 0 rgba(0,0,0,.12)` |
| `var(--shadow-xl)` | `shadow-flo-xl` | `0 8px 24px 0 rgba(0,0,0,.16)` |

---

## Tailwind Color Class Reference

These Tailwind classes map directly to FLO CSS variables:

```tsx
// Text colors
"text-text-primary"       // var(--text-primary)
"text-text-secondary"     // var(--text-secondary)
"text-text-tertiary"      // var(--text-tertiary)
"text-text-disabled"      // var(--text-disabled)

// Backgrounds
"bg-surface-primary"      // var(--surface-primary)
"bg-surface-secondary"    // var(--surface-secondary)
"bg-surface-tertiary"     // var(--surface-tertiary)
"bg-surface-minimal"      // var(--surface-minimal)

// Borders
"border-border-subtle"    // var(--border-subtle)
"border-border-faint"     // var(--border-faint)

// Accent
"bg-blue-accent"          // var(--blue-600)  ← static blue
"text-blue-accent"

// Status
"text-error"              // var(--error)
"text-success"            // var(--success)
```

---

## Component Patterns

### Page Layout

```tsx
// Page background
<div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>

// Sidebar / panel
<aside style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
```

### Card / Surface

```tsx
<div className="rounded-2xl border shadow-flo-s"
  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
```

### Primary Button (accent)

```tsx
<button className="px-4 py-2.5 rounded-xl text-flo-body2 font-semibold text-white transition-opacity hover:opacity-90"
  style={{ background: 'var(--accent)' }}>
  버튼
</button>
```

### Ghost / Secondary Button

```tsx
<button className="px-3 py-1.5 rounded-lg text-flo-caption1 font-medium border transition-colors hover:bg-surface-secondary"
  style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>
  취소
</button>
```

### Active Nav Item

```tsx
// Use semi-transparent accent background
style={{
  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
  color: 'var(--accent)',
}}
```

### Text Hierarchy Example

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

---

## Token Naming Convention (FLO)

```
{element}_{variant}_{state}

Elements:  background · surface · text · icon · border · button_surface
Variants:  primary · secondary · tertiary · minimal · subtle · alt · inverse
States:    active · inactive · enabled · disabled · pressed · focus
```

---

## Dark Mode

Dark mode uses Tailwind's `class` strategy — add `.dark` to `<html>`.
All FLO tokens have dark overrides defined in `app/globals.css`.
Currently the app runs light-mode only; dark tokens are ready to activate.

---

## File Map

| File | Purpose |
|---|---|
| `app/globals.css` | All CSS variables (FLO tokens + shadcn hsl vars) |
| `tailwind.config.ts` | Token mappings, FLO type scale, shadows |
| `app/layout.tsx` | Pretendard CDN import |
| `components.json` | shadcn config (new-york, slate base, cssVariables) |
