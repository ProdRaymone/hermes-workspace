import { describe, expect, it } from 'vitest'

import {
  buildChatPanelSessionsPath,
  buildChatPanelSessionsQueryKey,
} from './chat-panel-scope'

describe('chat panel instance scope', () => {
  it('scopes the side-panel session list to the selected Hermes instance', () => {
    expect(buildChatPanelSessionsPath('hermes2')).toBe(
      '/api/sessions?instance=hermes2',
    )
    expect(buildChatPanelSessionsQueryKey('hermes2')).toEqual([
      'chat',
      'sessions',
      'hermes2',
    ])
  })
})
