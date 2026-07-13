import { describe, it, expect, vi } from 'vitest'
import type { OAuth2Client } from 'googleapis-common'
import { enableMeetAutoArtifacts } from '@/lib/one-on-one/meet'

describe('enableMeetAutoArtifacts', () => {
  it('GET을 meetingCode 별칭 URL로 호출한다', async () => {
    const request = vi.fn().mockResolvedValue({ data: { name: 'spaces/XYZ123' } })
    const auth = { request } as unknown as OAuth2Client

    await enableMeetAutoArtifacts(auth, 'abc-mnop-xyz')

    expect(request).toHaveBeenNthCalledWith(1, {
      url: 'https://meet.googleapis.com/v2/spaces/abc-mnop-xyz',
      method: 'GET',
    })
  })

  it('조회한 정식 리소스 이름으로 PATCH해 자동 아티팩트를 켠다', async () => {
    const request = vi.fn().mockResolvedValue({ data: { name: 'spaces/XYZ123' } })
    const auth = { request } as unknown as OAuth2Client

    await enableMeetAutoArtifacts(auth, 'abc-mnop-xyz')

    const updateMask =
      'config.artifactConfig.transcriptionConfig,config.artifactConfig.smartNotesConfig'
    expect(request).toHaveBeenNthCalledWith(2, {
      url: `https://meet.googleapis.com/v2/spaces/XYZ123?updateMask=${encodeURIComponent(updateMask)}`,
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
  })

  it('name이 없으면 reject된다', async () => {
    const request = vi.fn().mockResolvedValue({ data: {} })
    const auth = { request } as unknown as OAuth2Client

    await expect(enableMeetAutoArtifacts(auth, 'abc-mnop-xyz')).rejects.toThrow(
      'Meet space 조회 실패: abc-mnop-xyz'
    )
  })
})
