'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

interface Device {
  id: string
  label: string | null
  last_used_at: string | null
  created_at: string
  scope: 'champion' | 'admin'
}

export default function AdminDevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { devices } = await apiFetch<{ devices: Device[] }>('/api/devices')
    setDevices(devices)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function revoke(id: string) {
    await apiFetch(`/api/devices?id=${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-flo-h400 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        연결된 기기
      </h1>
      <p className="text-flo-body2 mb-8" style={{ color: 'var(--text-secondary)' }}>
        MCP 도구/Claude Code 스킬이 연결된 기기 목록입니다. 특히 관리자 권한 기기는 다른 챔피언의
        데이터를 읽고 쓸 수 있으니, 더 이상 쓰지 않는 기기는 바로 연결을 해제하세요.
      </p>

      {loading && <p className="text-flo-body2" style={{ color: 'var(--text-secondary)' }}>불러오는 중...</p>}

      {!loading && devices.length === 0 && (
        <p className="text-flo-body2" style={{ color: 'var(--text-secondary)' }}>
          연결된 기기가 없습니다.
        </p>
      )}

      <ul className="space-y-3">
        {devices.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between p-4 rounded-xl border"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-flo-body2 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {d.label ?? '이름 없는 기기'}
                </p>
                {d.scope === 'admin' && (
                  <span
                    className="text-flo-caption1 font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(248,113,113,0.12)', color: 'var(--red-600, #dc2626)' }}
                  >
                    관리자 권한
                  </span>
                )}
              </div>
              <p className="text-flo-caption1" style={{ color: 'var(--text-secondary)' }}>
                마지막 사용: {d.last_used_at ? new Date(d.last_used_at).toLocaleString('ko-KR') : '사용 기록 없음'}
              </p>
            </div>
            <button
              onClick={() => revoke(d.id)}
              className="text-flo-caption1 font-semibold px-3 py-2 rounded-lg"
              style={{ color: 'var(--red-600, #dc2626)' }}
            >
              연결 해제
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
