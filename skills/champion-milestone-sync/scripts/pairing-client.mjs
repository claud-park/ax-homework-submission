#!/usr/bin/env node
// skills/champion-milestone-sync/scripts/pairing-client.mjs
//
// Dependency-free Node client for the ax-homework-submission pairing + milestone-log API.
// Requires Node 18+ (global fetch) and the AX_MILESTONE_SYNC_API_URL env var.

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_DIR = join(homedir(), '.ax-milestone-sync')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')
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

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return null
  }
}

function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
  chmodSync(CONFIG_PATH, 0o600)
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestPairingCode() {
  const res = await fetch(`${apiUrl()}/api/pairing/request`, { method: 'POST' })
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

async function ensurePaired() {
  const existing = loadConfig()
  if (existing?.token) {
    console.log(JSON.stringify({ paired: true, alreadyPaired: true }))
    return
  }

  const { code, expires_at } = await requestPairingCode()
  const pairingUrl = `${apiUrl()}/pairing?code=${code}`
  console.log(
    JSON.stringify({
      paired: false,
      code,
      pairingUrl,
      expiresAt: expires_at,
      instructions: `${pairingUrl} 를 열고 "이 기기 연결하기"를 눌러주세요. (코드: ${code}, 10분 내 만료)`,
    }),
  )

  const token = await pollPairing(code, Date.now() + POLL_TIMEOUT_MS)
  saveConfig({ token, apiUrl: apiUrl() })
  console.log(JSON.stringify({ paired: true, alreadyPaired: false }))
}

async function authedFetch(path, options = {}) {
  const config = loadConfig()
  if (!config?.token) throw new Error('not paired yet — run "ensure-paired" first')
  const res = await fetch(`${apiUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
      ...options.headers,
    },
  })
  if (res.status === 401) {
    // Token was revoked on the site — clear it so the next ensure-paired call re-pairs.
    saveConfig({})
    throw new Error('token no longer valid — run "ensure-paired" again')
  }
  if (!res.ok) throw new Error(`request failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function listMilestones() {
  // GET /api/milestones returns a bare array (not wrapped in an object) and, for a
  // non-admin caller, includes drafts too — filter to published here.
  const milestones = await authedFetch('/api/milestones')
  const published = (Array.isArray(milestones) ? milestones : []).filter(
    (m) => m.publish_status === 'published',
  )
  console.log(JSON.stringify(published))
}

async function logMilestone(id, note, opts) {
  const result = await authedFetch(`/api/milestones/${id}/log`, {
    method: 'POST',
    body: JSON.stringify({
      note,
      log_date: opts.date,
      mark_in_progress: opts.inProgress,
      mark_completed: opts.complete,
    }),
  })
  console.log(JSON.stringify(result))
}

async function listMilestoneLog(id) {
  const result = await authedFetch(`/api/milestones/${id}/log`)
  console.log(JSON.stringify(result))
}

async function createMilestone(title, opts) {
  const result = await authedFetch('/api/milestones', {
    method: 'POST',
    body: JSON.stringify({
      title,
      description: opts.description,
      publish_status: 'published',
    }),
  })
  console.log(JSON.stringify(result))
}

async function deleteMilestone(id) {
  const result = await authedFetch(`/api/milestones/${id}`, { method: 'DELETE' })
  console.log(JSON.stringify(result))
}

function parseLogArgs(argv) {
  const [id, note, ...rest] = argv
  if (!id || !note) {
    console.error('usage: log-milestone <milestone_id> <note> [--date=YYYY-MM-DD] [--in-progress] [--complete]')
    process.exit(1)
  }
  const opts = { inProgress: false, complete: false, date: undefined }
  for (const arg of rest) {
    if (arg === '--in-progress') opts.inProgress = true
    else if (arg === '--complete') opts.complete = true
    else if (arg.startsWith('--date=')) opts.date = arg.slice('--date='.length)
  }
  return { id, note, opts }
}

function parseCreateMilestoneArgs(argv) {
  const [title, ...rest] = argv
  if (!title) {
    console.error('usage: create-milestone <title> [--description="..."]')
    process.exit(1)
  }
  const opts = { description: undefined }
  for (const arg of rest) {
    if (arg.startsWith('--description=')) opts.description = arg.slice('--description='.length)
  }
  return { title, opts }
}

async function main() {
  const [, , command, ...rest] = process.argv
  try {
    if (command === 'ensure-paired') await ensurePaired()
    else if (command === 'list-milestones') await listMilestones()
    else if (command === 'log-milestone') {
      const { id, note, opts } = parseLogArgs(rest)
      await logMilestone(id, note, opts)
    } else if (command === 'milestone-log') {
      const [id] = rest
      if (!id) {
        console.error('usage: milestone-log <milestone_id>')
        process.exit(1)
      }
      await listMilestoneLog(id)
    } else if (command === 'create-milestone') {
      const { title, opts } = parseCreateMilestoneArgs(rest)
      await createMilestone(title, opts)
    } else if (command === 'delete-milestone') {
      const [id] = rest
      if (!id) {
        console.error('usage: delete-milestone <milestone_id>')
        process.exit(1)
      }
      await deleteMilestone(id)
    } else {
      console.error(
        'usage: pairing-client.mjs <ensure-paired|list-milestones|log-milestone|milestone-log|create-milestone|delete-milestone>',
      )
      process.exit(1)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main()
