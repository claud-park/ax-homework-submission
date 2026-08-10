#!/usr/bin/env node
// skills/obsidian-session-sync/scripts/mcp-connect.mjs
//
// One-time setup: pairs this machine with ax-homework-submission and registers
// its MCP server (app/api/mcp/route.ts) with Claude Code via `claude mcp add`.
// Requires Node 18+ (global fetch), the `claude` CLI on PATH, and the
// AX_MILESTONE_SYNC_API_URL env var (shared with champion-milestone-sync).

import { execFileSync } from 'child_process'

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

function apiUrl() {
  const url = process.env.AX_MILESTONE_SYNC_API_URL
  if (!url) {
    console.error(
      'AX_MILESTONE_SYNC_API_URL 환경변수가 설정되어 있지 않습니다. ax-homework-submission 배포 주소를 설정해주세요.',
    )
    process.exit(1)
  }
  return url.replace(/\/$/, '')
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestPairingCode(scope) {
  const res = await fetch(`${apiUrl()}/api/pairing/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  })
  if (!res.ok) throw new Error(`pairing request failed: ${res.status}`)
  return res.json()
}

async function pollPairing(code, deadline) {
  while (Date.now() < deadline) {
    const res = await fetch(`${apiUrl()}/api/pairing/poll?code=${encodeURIComponent(code)}`)
    const body = await res.json()
    if (body.status === 'approved') return body.token
    if (body.status === 'expired') throw new Error('pairing code expired before approval')
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('pairing timed out waiting for approval')
}

function registerMcpServer(serverName, token) {
  // --scope user: available across all local projects, not just this repo checkout.
  execFileSync(
    'claude',
    [
      'mcp',
      'add',
      '--transport',
      'http',
      serverName,
      `${apiUrl()}/api/mcp`,
      '--header',
      `Authorization: Bearer ${token}`,
      '-s',
      'user',
    ],
    { stdio: 'inherit' },
  )
}

async function main() {
  const args = process.argv.slice(2)
  const isAdmin = args.includes('--admin')
  const serverNameArg = args.find((a) => a.startsWith('--server-name='))
  const serverName = serverNameArg ? serverNameArg.slice('--server-name='.length) : 'ax-sessions'
  const scope = isAdmin ? 'admin' : 'champion'

  const { code, expires_at } = await requestPairingCode(scope)
  const pairingUrl = `${apiUrl()}/pairing?code=${code}`
  console.log(
    JSON.stringify({
      code,
      pairingUrl,
      expiresAt: expires_at,
      scope,
      instructions: `${pairingUrl} 를 열고 ${isAdmin ? '관리자 계정으로 로그인한 상태에서 ' : ''}"이 기기 연결하기"를 눌러주세요. (코드: ${code}, 10분 내 만료)`,
    }),
  )

  const token = await pollPairing(code, Date.now() + POLL_TIMEOUT_MS)
  registerMcpServer(serverName, token)
  console.log(JSON.stringify({ connected: true, serverName, scope }))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
