import { createFileRoute, redirect } from '@tanstack/react-router'
import { getActiveHermesInstanceId } from '@/hooks/use-hermes-instances'
import { getLastSessionStorageKey } from '@/screens/chat/chat-screen-utils'

export const Route = createFileRoute('/chat/')({
  ssr: false,
  beforeLoad: () => {
    // Try to restore last active session from localStorage
    let lastSession = 'new'
    try {
      const stored =
        typeof window !== 'undefined'
          ? localStorage.getItem(
              getLastSessionStorageKey(getActiveHermesInstanceId()),
            )
          : null
      if (stored && stored !== 'main') lastSession = stored
    } catch {}
    throw redirect({
      to: '/chat/$sessionKey',
      params: { sessionKey: lastSession },
      replace: true,
    })
  },
  component: function ChatIndexRoute() {
    return null
  },
})
