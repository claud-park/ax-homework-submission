import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { verifyMcpToken, getAuthenticatedIdentity } from '@/lib/mcp/auth'

const handler = createMcpHandler((server) => {
  server.registerTool(
    'whoami',
    {
      title: 'Who Am I',
      description:
        'Returns the identity of the authenticated caller (champion or admin) — use this to sanity-check pairing before calling any other tool.',
    },
    async (ctx) => {
      const identity = getAuthenticatedIdentity(ctx)
      return {
        content: [{ type: 'text', text: JSON.stringify(identity) }],
      }
    },
  )
})

const authHandler = withMcpAuth(handler, verifyMcpToken, { required: true })

export { authHandler as GET, authHandler as POST }
