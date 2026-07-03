import { createClient } from '@supabase/supabase-js'

/**
 * 기존 admin 계정의 app_metadata.is_admin 을 채운다.
 *
 * 배경: admin 판별을 user_metadata.is_admin → app_metadata.is_admin 으로 이전하면서,
 * 이미 존재하는 admin 계정은 app_metadata 에 플래그가 없으므로 코드 배포 전에
 * 이 스크립트로 백필해야 락아웃을 방지할 수 있다.
 *
 * 동작: user_metadata.is_admin === true 인 계정을 찾아 app_metadata.is_admin=true 세팅.
 * idempotent — 이미 app_metadata 가 세팅된 계정은 건너뛴다.
 *
 * 실행: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY 세팅 후
 *   bun --bun scripts/backfill-admin-app-metadata.ts
 */
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY 필요')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  let page = 1
  let migrated = 0
  let skipped = 0
  let total = 0

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    if (data.users.length === 0) break

    for (const u of data.users) {
      total++
      const userMetaAdmin = (u.user_metadata as { is_admin?: boolean } | null)?.is_admin === true
      const appMetaAdmin = (u.app_metadata as { is_admin?: boolean } | null)?.is_admin === true

      if (!userMetaAdmin) continue // admin 대상 아님
      if (appMetaAdmin) { skipped++; continue } // 이미 백필됨

      const { error: updErr } = await supabase.auth.admin.updateUserById(u.id, {
        app_metadata: { ...u.app_metadata, is_admin: true },
      })
      if (updErr) { console.error(`백필 실패 ${u.email}: ${updErr.message}`); continue }
      migrated++
      console.log(`migrated: ${u.email}`)
    }

    if (data.users.length < 1000) break
    page++
  }

  console.log(`done. scanned=${total} migrated=${migrated} already-set=${skipped}`)
}

main().catch(err => { console.error(err); process.exit(1) })
