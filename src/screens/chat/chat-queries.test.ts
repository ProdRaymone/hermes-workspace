import { afterEach, describe, expect, it, vi } from 'vitest'

import { chatQueryKeys, fetchHistory, fetchSessions } from './chat-queries'

describe('chat query instance routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('scopes session query keys by Hermes instance', () => {
    expect(chatQueryKeys.sessionsFor('hermes2')).toEqual([
      'chat',
      'sessions',
      'hermes2',
    ])
    expect(chatQueryKeys.history('main', 'main', 'hermes2')).toEqual([
      'chat',
      'history',
      'hermes2',
      'main',
      'main',
    ])
  })

  it('passes the selected instance to session and history fetches', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/sessions')) {
        return Response.json({ sessions: [] })
      }
      if (url.startsWith('/api/history')) {
        return Response.json({ sessionKey: 'main', messages: [] })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchSessions('hermes2')
    await fetchHistory({
      sessionKey: 'main',
      friendlyId: 'main',
      instanceId: 'hermes2',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions?instance=hermes2')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/history?limit=1000&sessionKey=main&friendlyId=main&instance=hermes2',
    )
  })
})
