export interface AdminAccountConfig {
  key: 'alex' | 'claud' | 'jennifer'
  email: string
  password: string
  name: string
}
export interface AdminProvisionConfig {
  accounts: AdminAccountConfig[]
  oldAdminEmail: string | null
}

const SPECS: { key: AdminAccountConfig['key']; name: string; envPrefix: string }[] = [
  { key: 'alex', name: 'Alex', envPrefix: 'ADMIN_ALEX' },
  { key: 'claud', name: 'Claud', envPrefix: 'ADMIN_CLAUD' },
  { key: 'jennifer', name: 'Jennifer', envPrefix: 'ADMIN_JENNIFER' },
]

export function parseAdminConfig(env: Record<string, string | undefined>): AdminProvisionConfig {
  const accounts: AdminAccountConfig[] = []
  for (const spec of SPECS) {
    const email = env[`${spec.envPrefix}_EMAIL`]?.trim()
    const password = env[`${spec.envPrefix}_PASSWORD`]
    if (email && password) {
      accounts.push({ key: spec.key, email, password, name: spec.name })
    }
  }
  const oldAdminEmail = env.OLD_ADMIN_EMAIL?.trim() || null
  return { accounts, oldAdminEmail }
}
