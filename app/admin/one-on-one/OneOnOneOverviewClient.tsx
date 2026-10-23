'use client'
import { Fragment, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { DesktopOnlyNotice } from '@/components/DesktopOnlyNotice'
import { filterRows, sortRows, type OverviewChip, type OverviewRow, type TimelineEvent } from '@/lib/one-on-one/overview'
import type { Season } from '@/lib/types'
import { RecapChannelCell } from './RecapChannelCell'

interface Props {
  seasons: Season[]
  season: Season | null
  rows: OverviewRow[]
  startDateMissing: boolean
}

const CHIPS: { key: OverviewChip; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기 있음' },
  { key: 'upcoming', label: '예정 있음' },
  { key: 'zero', label: '0회' },
  { key: 'missing', label: '누락 의심' },
]

const KST = 'Asia/Seoul'

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fmtSessionDate(date: string, time: string | null): string {
  return time ? `${date} ${time.slice(0, 5)}` : date
}

const TH: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '10px 12px', color: 'var(--text-primary)', verticalAlign: 'top' }
const BADGE: React.CSSProperties = {
  fontSize: 11, padding: '2px 8px', borderRadius: 4, display: 'inline-block', whiteSpace: 'nowrap',
}

function describeEvent(e: TimelineEvent): { label: string; detail: string } {
  switch (e.kind) {
    case 'booking_requested':
      return { label: '신청', detail: `미팅 ${fmtDateTime(e.slotStart)}` }
    case 'booking_confirmed':
      return { label: '확정', detail: `미팅 ${fmtDateTime(e.slotStart)}` }
    case 'booking_cancelled':
      return { label: '취소', detail: `미팅 ${fmtDateTime(e.slotStart)}` }
    case 'session':
      return { label: `${e.number}회차 세션`, detail: `${fmtSessionDate(e.sessionDate, e.sessionTime)} · ${e.title}` }
  }
}

export function OneOnOneOverviewClient({ seasons, season, rows, startDateMissing }: Props) {
  const router = useRouter()
  const [chip, setChip] = useState<OverviewChip>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // 저장 후 서버 재조회 없이 반영(필터 전환으로 행이 다시 그려져도 유지된다).
  const [channelOverrides, setChannelOverrides] = useState<Record<string, string | null>>({})

  const visible = sortRows(filterRows(rows, chip))
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div>
      <DesktopOnlyNotice />
      <div className="hidden md:block">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>1-on-1 현황</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              챔피언별 미팅 회차, 대기 중인 신청, 예정된 미팅을 한눈에 확인해요.
            </p>
          </div>
          {seasons.length > 0 && (
            <label className="text-xs flex items-center gap-2" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              시즌
              <select
                value={season?.id ?? ''}
                onChange={(e) => router.push(`/admin/one-on-one?season=${e.target.value}`)}
                style={{
                  fontSize: 13, padding: '4px 8px', borderRadius: 6,
                  border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)',
                }}
              >
                {!season && <option value="">선택</option>}
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {startDateMissing && (
          <div
            role="status"
            className="mb-4 text-xs"
            style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(217,119,6,0.1)', color: 'var(--amber)' }}
          >
            이 시즌에는 시작일이 없어서 예약을 시즌별로 나누지 못했어요. 모든 기간의 예약이 함께 표시돼요.
          </div>
        )}

        {!season ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>표시할 시즌이 없어요.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>이 시즌에 등록된 챔피언이 없어요.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {CHIPS.map((c) => {
                const count = filterRows(rows, c.key).length
                const active = chip === c.key
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setChip(c.key)}
                    style={{
                      fontSize: 12, padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer',
                      border: '1px solid var(--border-subtle)',
                      background: active ? 'var(--blue-600)' : 'transparent',
                      color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
                    }}
                  >
                    {c.label} {count}
                  </button>
                )
              })}
            </div>

            {visible.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>조건에 맞는 챔피언이 없어요.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
                      <th scope="col" style={{ ...TH, width: 28 }} aria-label="펼치기" />
                      {['부서', '이름', '회차', '마지막 미팅', '다음 미팅', '대기 중 신청', '취소 건수', '최근 신청', '플래그', 'recap 채널'].map((h) => (
                        <th key={h} scope="col" style={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const open = expanded.has(r.userId)
                      const next = r.nextBooking
                      return (
                        <Fragment key={r.userId}>
                          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={TD}>
                              <button
                                type="button"
                                aria-expanded={open}
                                aria-label={`${r.name} 상세 ${open ? '접기' : '펼치기'}`}
                                onClick={() => toggle(r.userId)}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}
                              >
                                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </td>
                            <td style={{ ...TD, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.department || '—'}</td>
                            <td style={{ ...TD, whiteSpace: 'nowrap', fontWeight: 600 }}>{r.name}</td>
                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.sessionCount}회</td>
                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                              {r.lastSession ? fmtSessionDate(r.lastSession.session_date, r.lastSession.session_time) : '기록 없음'}
                            </td>
                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                              {next ? (
                                <>
                                  {fmtDateTime(next.slot_start)}
                                  {next.confirmed_by && (
                                    <span style={{ color: 'var(--text-secondary)' }}> · {next.confirmed_by} 확정</span>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                              {r.pendingBooking ? `${fmtDateTime(r.pendingBooking.slot_start)} 희망` : '—'}
                            </td>
                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.cancelledCount}건</td>
                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.latestRequestAt ? fmtDateTime(r.latestRequestAt) : '—'}</td>
                            <td style={TD}>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {r.flags.zeroMeetings && (
                                  <span style={{ ...BADGE, background: 'rgba(100,116,139,0.1)', color: 'var(--text-secondary)' }}>미팅 0회</span>
                                )}
                                {r.flags.missingRecord && (
                                  <span style={{ ...BADGE, background: 'rgba(217,119,6,0.1)', color: 'var(--amber)' }}>기록 누락 의심</span>
                                )}
                              </div>
                            </td>
                            <td style={TD}>
                              <RecapChannelCell
                                userId={r.userId}
                                name={r.name}
                                channelId={r.userId in channelOverrides ? channelOverrides[r.userId] : r.recapChannelId}
                                onSaved={(id) => setChannelOverrides((prev) => ({ ...prev, [r.userId]: id }))}
                              />
                            </td>
                          </tr>
                          {open && (
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-secondary)' }}>
                              <td />
                              <td colSpan={10} style={{ padding: '12px' }}>
                                {r.timeline.length === 0 ? (
                                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>아직 신청이나 세션 기록이 없어요.</p>
                                ) : (
                                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {r.timeline.map((e, i) => {
                                      const d = describeEvent(e)
                                      return (
                                        <li key={i} className="text-xs" style={{ display: 'flex', gap: 12, color: 'var(--text-primary)' }}>
                                          <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', minWidth: 120 }}>{fmtDateTime(e.at)}</span>
                                          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{d.label}</span>
                                          <span style={{ color: 'var(--text-secondary)' }}>{d.detail}</span>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                                <Link
                                  href={`/admin/champions/${r.userId}`}
                                  className="text-xs"
                                  style={{ display: 'inline-block', marginTop: 10, color: 'var(--blue-600)', fontWeight: 600, whiteSpace: 'nowrap' }}
                                >
                                  챔피언 상세 보기
                                </Link>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
