import { createSupabaseBrowserClient } from './supabase/client'

const supabase = createSupabaseBrowserClient()

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return session.access_token
}

/** 폴링 등 non-throwing 컨텍스트용: 미인증 시 null 반환. */
export async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function errorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'fields' in (body as Record<string, unknown>)) {
    // Preserve full payload for validation_failed responses so callers can render inline errors.
    return JSON.stringify(body)
  }
  if (body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)) {
    return String((body as { error: unknown }).error)
  }
  return 'API error'
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(errorMessage(body))
  }
  if (res.status === 204) return {} as T
  return res.json()
}

export async function apiUpload<T>(path: string, body: FormData): Promise<T> {
  const token = await getToken()
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(errorMessage(errBody))
  }
  return res.json()
}
