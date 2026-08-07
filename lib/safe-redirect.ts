/**
 * 로그인 전 `next` 쿼리 파라미터는 인증 전 사용자가 임의로 넣을 수 있으므로,
 * 같은 오리진의 상대 경로("/xxx")만 허용하고 그 외(//evil.com, https://evil.com,
 * javascript: 등)는 전부 "/"로 되돌려 open redirect를 막는다.
 */
export function sanitizeRedirectPath(next: string | null | undefined): string {
  if (!next) return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//')) return '/'
  return next
}
