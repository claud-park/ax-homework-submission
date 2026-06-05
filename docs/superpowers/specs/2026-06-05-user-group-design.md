# User Group (권한) 관리 설계

> **버전** 1.0 · **작성일** 2026-06-05 · **작성자** yr.park@dreamus.io

---

## 목표

챔피언뷰에 가입한 사용자를 세 그룹(`champion` / `partner` / `admin`)으로 구분하고, `champion` 그룹에게만 과제 제출(Charter + Milestone)을 추적한다. Admin view에 "유저 권한 관리" 페이지를 추가해 admin이 각 사용자의 그룹을 변경할 수 있도록 한다.

---

## 그룹 정의

| 그룹 | 설명 | 과제 추적 | 관리자 변경 가능 |
|---|---|---|---|
| `champion` | 과제 수행 대상자. 기본값. | ✅ | ✅ (→ partner) |
| `partner` | 과제 제출 불필요한 참관/협력자 | ❌ | ✅ (→ champion) |
| `admin` | Admin view 접근 권한 보유자. `is_admin=true`에서 파생 | ❌ | ❌ (읽기전용) |

---

## DB 변경

### `users` 테이블 — `user_group` 컬럼 추가

```sql
ALTER TABLE users
  ADD COLUMN user_group TEXT NOT NULL DEFAULT 'champion'
  CHECK (user_group IN ('champion', 'partner'));
```

- 기존 모든 rows → `DEFAULT 'champion'` 자동 적용
- `admin` 값은 저장하지 않음 — Supabase Auth `user_metadata.is_admin`에서 런타임 파생
- CHECK constraint는 `champion`/`partner` 두 값만 허용

---

## API

### `GET /api/admin/users`

전체 champion-view 사용자 목록 반환. Admin 전용 (`verifyAdmin`).

응답 shape:
```ts
{
  id: string
  name: string
  email: string
  userGroup: 'champion' | 'partner' | 'admin'  // admin = is_admin=true에서 파생
  createdAt: string
}[]
```

구현:
1. `supabase.from('users').select('id, name, created_at')` — champion-view 사용자 전체
2. `supabase.auth.admin.listUsers()` — `user_metadata.is_admin` 조회
3. 두 결과를 `id`로 조인. `is_admin=true`면 `userGroup = 'admin'`, 아니면 `users.user_group`을 그대로 사용
4. `auth.admin.listUsers()`에서 `email` 추출

### `PATCH /api/admin/users/[userId]`

특정 사용자의 `user_group` 변경. Admin 전용.

요청 body:
```ts
{ userGroup: 'champion' | 'partner' }
```

- `admin` 그룹으로 변경 불가 (400 반환)
- `is_admin=true` 사용자 변경 시도 → 400 반환 ("admin 유저의 그룹은 변경할 수 없습니다")
- 성공 시 업데이트된 user row 반환

---

## 필터링 변경

`champion` 그룹만 과제 추적 대상이므로 다음 두 API에서 필터를 추가한다.

| API | 변경 내용 |
|---|---|
| `GET /api/champions` | `users` 쿼리에 `.eq('user_group', 'champion')` 추가 |
| `GET /api/champions/gantt` | 동일 |

칸반, 주간 리포트, 지연 신고 등 나머지 admin 페이지는 현행 유지 (별도 요구 없음).

---

## Admin UI

### 사이드바 메뉴 추가

`app/admin/layout.tsx`의 `NAV` 배열에 항목 추가:

```ts
{ icon: UserCog, label: '유저 권한 관리', href: '/admin/users' }
```

위치: "챔피언 리스트" 바로 아래.

### `/admin/users` 페이지

**레이아웃**: 페이지 헤더 + 사용자 테이블

**테이블 컬럼**:
| 컬럼 | 내용 |
|---|---|
| 이름 | `parseName(name).displayName` |
| 부서 | `parseName(name).department` |
| 이메일 | Supabase Auth에서 조회 |
| 가입일 | `created_at` |
| 권한 | 배지 + 드롭다운 |

**권한 배지 & 드롭다운**:
- `CHAMPION` — 파란색 배지. 드롭다운에서 `partner`로 변경 가능
- `PARTNER` — 회색 배지. 드롭다운에서 `champion`으로 변경 가능
- `ADMIN` — 보라색 배지. 드롭다운 비활성화 (변경 불가)

변경 즉시 `PATCH /api/admin/users/[userId]` 호출 → 낙관적 업데이트 없이 응답 후 반영.

---

## 문서 업데이트 범위

| 문서 | 변경 내용 |
|---|---|
| `docs/ERD.md` | `users` 테이블에 `user_group` 컬럼 추가, 관계도 업데이트 |
| `docs/PRD-KO.md` | 사용자 그룹 개념 섹션 추가, 진척도 테이블 업데이트 |

---

## 에러 처리

| 케이스 | 응답 |
|---|---|
| `admin` 그룹으로 변경 시도 | 400 `"admin 그룹은 이 API로 변경할 수 없습니다"` |
| `is_admin=true` 유저 변경 시도 | 400 `"admin 유저의 그룹은 변경할 수 없습니다"` |
| 존재하지 않는 userId | 404 |
| DB 에러 | 500 |

---

## 구현 범위 요약

1. Supabase migration: `users.user_group` 컬럼 추가
2. `GET /api/admin/users` 신규
3. `PATCH /api/admin/users/[userId]` 신규
4. `GET /api/champions` 필터 추가
5. `GET /api/champions/gantt` 필터 추가
6. `app/admin/users/page.tsx` 신규
7. `app/admin/layout.tsx` 사이드바 메뉴 추가
8. `docs/ERD.md` 업데이트
9. `docs/PRD-KO.md` 업데이트
