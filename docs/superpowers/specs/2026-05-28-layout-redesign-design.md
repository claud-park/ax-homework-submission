# Layout System Redesign — Design Spec

> ax-homework-submission · 2026-05-28  
> Branch: `feature/layout-redesign`  
> Approach: Single PR covering 4 layout files

---

## Overview

Full visual redesign of the app's layout chrome — sidebar, topbar, and login pages — using FLO Design System 1.0 tokens defined in `DESIGN.md`. Target: clean minimal aesthetic aligned with FLO's web dashboard style. No new features; pure visual/token migration.

**In scope:** `app/(champion)/layout.tsx` · `app/admin/layout.tsx` · `app/login/page.tsx` · `app/admin/login/page.tsx`  
**Out of scope:** Core data components (Gantt, Table, Panel), admin page content areas

---

## 1. Page Layer Structure

```
<html>  bg: hsl(var(--background)) = gray_100 (#f8fafc)
  └── <aside>  sidebar
        bg: var(--surface-primary) white
        border-right: 1px var(--border-subtle)
        box-shadow: var(--shadow-s) [right edge only]
        width: 220px  ← from 176px (w-44 → w-[220px])
  └── <div>  content area (flex-1)
        └── <header>  topbar
              bg: var(--surface-primary) white
              border-bottom: 1px var(--border-subtle)
              box-shadow: var(--shadow-s)
              height: 52px fixed
        └── <main>
              padding: 24px
              overflow-y: auto
```

**Token mapping:**

| Role | CSS Variable | Value (light) |
|---|---|---|
| Sidebar/topbar bg | `--surface-primary` | `#ffffff` |
| Page bg | `hsl(--background)` | `#f8fafc` |
| Border | `--border-subtle` | `#e2e8f0` |
| Shadow | `--shadow-s` | `0 1px 4px rgba(0,0,0,.08)` |

---

## 2. Sidebar

### Structure
```
<aside className="w-[220px] flex flex-col gap-0 px-3 py-5 border-r"
  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)',
           boxShadow: 'var(--shadow-s)' }}>

  [Brand header]       ← px-3 pb-4 mb-2
  [Nav items]          ← gap-0.5
  [Spacer flex-1]
  [Divider]            ← 1px var(--border-faint) mx-3
  [User / logout]      ← mt-2
```

### Brand header
```tsx
<div className="px-3 pb-4 mb-2">
  <span className="text-flo-body1 font-semibold" style={{ color: 'var(--text-primary)' }}>
    AX Homework  {/* or "관리자" */}
  </span>
  {/* admin only: role badge */}
  <span className="text-flo-caption2 font-semibold ml-2 px-1.5 py-0.5 rounded"
    style={{ background: 'var(--surface-secondary)', color: 'var(--text-disabled)',
             letterSpacing: '0.06em' }}>
    ADMIN
  </span>
</div>
```

### Nav item (active / inactive)
```tsx
<a className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-flo-body2 font-medium
              transition-colors relative"
  style={{
    background: active
      ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
      : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
  }}>

  {/* Active indicator bar */}
  {active && (
    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
      style={{ background: 'var(--accent)' }} />
  )}

  <item.icon className="h-4 w-4 flex-shrink-0" />
  {item.label}
</a>
```

Hover (inactive): `bg: var(--surface-secondary)`

### User / logout section
```tsx
<div className="mt-2 px-3">
  {/* Divider */}
  <div className="h-px mb-3" style={{ background: 'var(--border-faint)' }} />

  {/* Logout button */}
  <button className="flex items-center gap-2 w-full px-0 py-1.5
                     text-flo-caption1 font-medium transition-colors hover:opacity-70"
    style={{ color: 'var(--text-disabled)', background: 'none', border: 'none' }}>
    <LogOut className="h-3.5 w-3.5" />
    로그아웃
  </button>
</div>
```

---

## 3. Topbar

```tsx
<header className="flex items-center px-6 flex-shrink-0 border-b"
  style={{
    height: 52,
    background: 'var(--surface-primary)',
    borderColor: 'var(--border-subtle)',
    boxShadow: 'var(--shadow-s)',
  }}>

  {/* Mobile: hamburger + brand */}
  <div className="flex items-center gap-3 md:hidden">
    <button onClick={() => setDrawerOpen(true)} style={{ color: 'var(--text-secondary)' }}>
      <Menu className="h-5 w-5" />
    </button>
    <span className="text-flo-body2 font-semibold" style={{ color: 'var(--text-primary)' }}>
      AX Homework
    </span>
  </div>

  {/* Right: avatar + name */}
  {userName && (
    <div className="ml-auto flex items-center gap-2">
      {/* Avatar initial circle */}
      <div className="flex items-center justify-center rounded-full text-flo-caption2 font-semibold"
        style={{
          width: 24, height: 24,
          background: 'var(--surface-secondary)',
          color: 'var(--text-tertiary)',
        }}>
        {userName[0]}
      </div>
      <span className="text-flo-caption1 font-medium" style={{ color: 'var(--text-secondary)' }}>
        {userName}
      </span>
    </div>
  )}
</header>
```

---

## 4. Login Page

### Page wrapper
```tsx
<div className="min-h-screen flex items-center justify-center px-4"
  style={{ background: 'hsl(var(--background))' }}>
```

### Card
```tsx
<div className="w-full max-w-[360px] p-10 rounded-3xl border"
  style={{
    background: 'var(--surface-primary)',
    borderColor: 'var(--border-subtle)',
    boxShadow: 'var(--shadow-l)',        // ← was missing
  }}>
```

### Card interior
```tsx
  {/* Icon mark */}
  <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-6"
    style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
    <span className="text-flo-body1 font-bold" style={{ color: 'var(--accent)' }}>A</span>
  </div>

  {/* Title */}
  <h1 className="text-flo-h400 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
    AX Homework
  </h1>
  <p className="text-flo-body2 mb-8" style={{ color: 'var(--text-secondary)' }}>
    챔피언 로그인
  </p>

  {/* CTA button */}
  <button className="w-full flex items-center justify-center gap-2.5 rounded-xl
                     text-flo-body2 font-semibold text-white transition-opacity hover:opacity-90"
    style={{ height: 48, background: 'var(--accent)' }}>   {/* ← var(--accent) not --blue-600 */}
    {/* Google "G" SVG — inline, white fill */}
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="white" fillOpacity=".9"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="white" fillOpacity=".9"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="white" fillOpacity=".9"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="white" fillOpacity=".9"/>
    </svg>
    Google로 계속하기
  </button>

  {/* Footer */}
  <p className="text-center mt-6 text-flo-caption1" style={{ color: 'var(--text-disabled)' }}>
    관리자는 <a style={{ color: 'var(--blue-600)' }}>여기서 로그인</a>
  </p>
```

### Admin login difference
Same card structure. Title: "관리자 로그인" / subtitle: "Dreamus 어드민 계정으로 로그인하세요"  
Inputs (email + password): `rounded-xl border border-subtle h-11 px-4 text-flo-body2`  
Button label: "로그인"

---

## 5. Mobile Drawer

Behavior unchanged from current implementation:
- Mobile overlay (`bg-black/40 fixed inset-0 z-40`)
- Sidebar slides in with `transition-transform duration-200`
- Close button (X) in brand header, mobile only
- `drawerOpen` state in layout component

---

## 6. Responsive Breakpoints

| Breakpoint | Sidebar | Topbar brand |
|---|---|---|
| `md` and above | Static, always visible | Hidden (brand in sidebar) |
| Below `md` | Off-canvas drawer (translateX) | Visible (hamburger + brand) |

No changes to current breakpoint logic — only visual tokens updated.

---

## 7. Files & Changes Summary

| File | Change type | Key diffs |
|---|---|---|
| `app/(champion)/layout.tsx` | Visual overhaul | sidebar 220px, shadow-s, active indicator, topbar 52px, avatar |
| `app/admin/layout.tsx` | Visual overhaul | same + ADMIN badge in brand header |
| `app/login/page.tsx` | Visual overhaul | shadow-l, rounded-3xl, icon mark, accent button, 48px CTA |
| `app/admin/login/page.tsx` | Visual overhaul | same card structure, email/pw inputs, 로그인 button |

No API changes. No new dependencies. No DB migrations.

---

## 8. Token Usage Reference

All inline `style={}` props use CSS variables. No hardcoded hex or rgba values.

| Pattern to remove | Replace with |
|---|---|
| `rgba(37,99,235,0.15)` | `color-mix(in srgb, var(--accent) 12%, transparent)` |
| `rgba(37,99,235,0.1)` | `color-mix(in srgb, var(--accent) 10%, transparent)` |
| `color: 'var(--blue-600)'` (active nav) | `color: 'var(--accent)'` |
| `background: 'var(--blue-600)'` (CTA btn) | `background: 'var(--accent)'` |
| `fontSize: 12` / `text-xs` | `text-flo-caption1` |
| `fontSize: 13` / `text-sm` | `text-flo-body2` |
| `fontWeight: 600` | `font-semibold` |
