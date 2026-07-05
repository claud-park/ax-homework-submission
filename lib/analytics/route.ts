// 동적 세그먼트를 [param] 으로 치환해 카디널리티 억제.
// 순수 함수 — 클라이언트 의존성 없음(테스트 용이).
// 예: /my-project/charter/abc123 -> /my-project/charter/[id]
//     /champions/uuid           -> /champions/[userId]
//     /my-project/sessions/xyz  -> /my-project/sessions/[sessionId]
export function normalizeRoute(pathname: string): string {
  return pathname
    .replace(/^\/champions\/[^/]+/, '/champions/[userId]')
    .replace(/^\/my-project\/charter\/[^/]+/, '/my-project/charter/[id]')
    .replace(/^\/my-project\/sessions\/[^/]+/, '/my-project/sessions/[sessionId]')
}
