import { createClient } from '@supabase/supabase-js'
import type { BrowserContext } from '@playwright/test'

const MAX_CHUNK_SIZE = 3180

function chunkString(str: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size))
  }
  return chunks
}

export async function injectChampionSession(context: BrowserContext): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_CHAMPION_EMAIL!,
    password: process.env.TEST_CHAMPION_PASSWORD!,
  })

  if (error || !data.session) {
    throw new Error(`Champion sign-in failed: ${error?.message ?? 'no session'}`)
  }

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const sessionStr = JSON.stringify(data.session)
  const chunks = chunkString(sessionStr, MAX_CHUNK_SIZE)

  const cookies = chunks.map((chunk, i) => ({
    name: chunks.length === 1
      ? `sb-${projectRef}-auth-token`
      : `sb-${projectRef}-auth-token.${i}`,
    value: chunk,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  }))

  await context.addCookies(cookies)
}
