/**
 * 로그인 전 `next` 쿼리 파라미터는 인증 전 사용자가 임의로 넣을 수 있으므로,
 * 같은 오리진의 상대 경로("/xxx")만 허용하고 그 외(//evil.com, https://evil.com,
 * javascript: 등)는 전부 "/"로 되돌려 open redirect를 막는다.
 *
 * WHATWG URL 파서는 (a) 문자열 전체에서 ASCII tab/CR/LF를 제거하고 (b) 특수
 * 스킴(http/https)에서 백슬래시를 슬래시와 동일하게 취급한다. 이 정규화를 검사
 * "전에" 적용하지 않으면 "/\evil.com", "/\t/evil.com" 같은 입력이 검사는
 * 통과하고 브라우저에서는 "//evil.com"(프로토콜 상대 URL)으로 해석되어
 * 오프사이트로 리다이렉트되는 우회가 가능하다.
 */
export function sanitizeRedirectPath(next: string | null | undefined): string {
  if (!next) return '/'
  const normalized = next.replace(/[\t\r\n]/g, '').replace(/\\/g, '/')
  if (!normalized.startsWith('/')) return '/'
  if (normalized.startsWith('//')) return '/'
  return normalized
}
