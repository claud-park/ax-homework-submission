import type { OAuth2Client } from 'googleapis-common'

// Meet REST API v2로 스페이스의 자동 아티팩트(Gemini 회의록 + 녹취록) 생성을 켠다.
// 호출자는 미팅 주최자여야 하며 meetings.space.settings 스코프가 필요하다.
export async function enableMeetAutoArtifacts(
  auth: OAuth2Client,
  meetingCode: string
): Promise<void> {
  // meetingCode 별칭으로 조회해 정식 리소스 이름(spaces/{space})을 얻는다
  const { data: space } = await auth.request<{ name?: string }>({
    url: `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(meetingCode)}`,
    method: 'GET',
  })
  if (!space.name) throw new Error(`Meet space 조회 실패: ${meetingCode}`)

  const updateMask =
    'config.artifactConfig.transcriptionConfig,config.artifactConfig.smartNotesConfig'
  await auth.request({
    url: `https://meet.googleapis.com/v2/${space.name}?updateMask=${encodeURIComponent(updateMask)}`,
    method: 'PATCH',
    data: {
      config: {
        artifactConfig: {
          transcriptionConfig: { autoTranscriptionGeneration: 'ON' },
          smartNotesConfig: { autoSmartNotesGeneration: 'ON' },
        },
      },
    },
  })
}
