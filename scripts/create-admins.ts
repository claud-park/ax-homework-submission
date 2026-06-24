import { createClient } from '@supabase/supabase-js'
import { parseAdminConfig } from '../lib/admin/adminConfig'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY 필요')
    process.exit(1)
  }

  const { accounts, oldAdminEmail } = parseAdminConfig(process.env)
  if (accounts.length === 0) {
    console.warn('생성할 admin 계정 env가 없습니다. (ADMIN_<NAME>_EMAIL/_PASSWORD 확인)')
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  async function findUserByEmail(email: string) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw error
    return data.users.find(u => u.email?.toLowerCase() === email.toLowerCase()) ?? null
  }

  for (const acc of accounts) {
    const existing = await findUserByEmail(acc.email)
    if (existing) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        password: acc.password,
        user_metadata: { ...existing.user_metadata, is_admin: true, name: acc.name },
      })
      if (error) { console.error(`update 실패 ${acc.email}: ${error.message}`); continue }
      console.log(`updated: ${acc.email} (${acc.name})`)
    } else {
      const { error } = await supabase.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { is_admin: true, name: acc.name },
      })
      if (error) { console.error(`create 실패 ${acc.email}: ${error.message}`); continue }
      console.log(`created: ${acc.email} (${acc.name})`)
    }
  }

  if (oldAdminEmail) {
    const old = await findUserByEmail(oldAdminEmail)
    if (old) {
      const { error } = await supabase.auth.admin.updateUserById(old.id, {
        ban_duration: '876000h',
        user_metadata: { ...old.user_metadata, is_admin: false },
      })
      if (error) { console.error(`비활성화 실패 ${oldAdminEmail}: ${error.message}`) } else {
      console.log(`deactivated(old shared): ${oldAdminEmail}`) }
    } else {
      console.warn(`OLD_ADMIN_EMAIL 계정을 찾지 못함: ${oldAdminEmail}`)
    }
  }

  console.log('done.')
}

main().catch(err => { console.error(err); process.exit(1) })
