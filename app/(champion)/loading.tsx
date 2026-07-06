import { FullPageSpinner } from '@/components/ui/spinner'

// champion 세그먼트 진입/전환 시 서버 컴포넌트 로딩 동안 표시(빈 화면 깜빡임 방지).
export default function Loading() {
  return <FullPageSpinner />
}
