import { NextRequest, NextResponse } from 'next/server'

// data.go.kr 한국천문연구원_특일 정보 API
// API 키: HOLIDAY_API_KEY 환경변수 필요 (data.go.kr에서 발급)
// 키 없으면 빈 객체 반환 → DateRangePicker가 하드코딩 fallback 사용

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear())
  const apiKey = process.env.HOLIDAY_API_KEY

  if (!apiKey) {
    return NextResponse.json({}, { status: 200 })
  }

  const holidays: Record<string, string> = {}

  await Promise.all(
    Array.from({ length: 12 }, (_, i) => i + 1).map(async (month) => {
      const solMonth = String(month).padStart(2, '0')
      const url =
        `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo` +
        `?ServiceKey=${encodeURIComponent(apiKey)}` +
        `&solYear=${year}&solMonth=${solMonth}&_type=json&numOfRows=50`

      try {
        const res = await fetch(url, { next: { revalidate: 86400 } })
        if (!res.ok) return

        const data = await res.json()
        const raw = data?.response?.body?.items?.item
        if (!raw) return

        const items = Array.isArray(raw) ? raw : [raw]
        for (const item of items) {
          if (item.isHoliday !== 'Y') continue
          const d = String(item.locdate)
          const key = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
          holidays[key] = item.dateName
        }
      } catch {
        // 개별 월 fetch 실패는 무시 — 부분 결과라도 반환
      }
    })
  )

  return NextResponse.json(holidays, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
  })
}
