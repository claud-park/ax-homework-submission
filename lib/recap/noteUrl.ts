/** 공백만 있거나 비어 있는 env 값은 미설정으로 취급한다(`vercel env add`의 줄바꿈/공백 방지). */
export function trimEnv(value: string | undefined | null): string | undefined {
  const t = value?.trim()
  return t ? t : undefined
}

export function resolveBaseUrl(override?: string): string {
  return trimEnv(override) ?? trimEnv(process.env.APP_BASE_URL) ?? 'http://localhost:3000'
}

/** 챔피언도 열 수 있는 세션 노트 링크. 초안·DM·모달 override가 모두 이 함수를 쓴다. */
export function buildNoteUrl(input: { baseUrl: string; sessionId: string }): string {
  return `${input.baseUrl.replace(/\/+$/, '')}/my-project/sessions/${input.sessionId}`
}
