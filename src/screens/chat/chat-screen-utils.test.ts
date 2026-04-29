import { describe, expect, it } from 'vitest'

import {
  advanceStickyStreamingText,
  getLastSessionStorageKey,
  getThinkingLevelStorageKey,
  resolveGatewayModel,
} from './chat-screen-utils'

describe('advanceStickyStreamingText', () => {
  it('preserves the last non-empty streaming text when a tool phase temporarily reports empty text', () => {
    const afterText = advanceStickyStreamingText({
      isStreaming: true,
      runId: 'run-1',
      rawText: 'Working through the task',
      smoothedText: 'Working through the task',
      previousState: { runId: null, text: '' },
    })

    const afterToolPhase = advanceStickyStreamingText({
      isStreaming: true,
      runId: 'run-1',
      rawText: '',
      smoothedText: '',
      previousState: afterText,
    })

    expect(afterToolPhase).toEqual({
      runId: 'run-1',
      text: 'Working through the task',
    })
  })

  it('resets sticky text when a new run starts', () => {
    const next = advanceStickyStreamingText({
      isStreaming: true,
      runId: 'run-2',
      rawText: '',
      smoothedText: '',
      previousState: { runId: 'run-1', text: 'Old stream text' },
    })

    expect(next).toEqual({ runId: 'run-2', text: '' })
  })

  it('clears sticky text when streaming ends', () => {
    const next = advanceStickyStreamingText({
      isStreaming: false,
      runId: null,
      rawText: '',
      smoothedText: '',
      previousState: { runId: 'run-1', text: 'Old stream text' },
    })

    expect(next).toEqual({ runId: null, text: '' })
  })
})

describe('chat screen scoped storage keys', () => {
  it('keeps default last-session and thinking state on legacy keys', () => {
    expect(getLastSessionStorageKey('default')).toBe('hermes-last-session')
    expect(getLastSessionStorageKey('')).toBe('hermes-last-session')
    expect(getThinkingLevelStorageKey('abc123', 'default')).toBe(
      'hermes-thinking-abc123',
    )
    expect(getThinkingLevelStorageKey('', '')).toBe('hermes-thinking-new')
  })

  it('scopes non-default last-session and thinking state by Hermes instance', () => {
    expect(getLastSessionStorageKey('hermes2')).toBe(
      'hermes-last-session-hermes2',
    )
    expect(getThinkingLevelStorageKey('abc123', 'hermes3')).toBe(
      'hermes-thinking-hermes3-abc123',
    )
  })
})

describe('resolveGatewayModel', () => {
  it('does not crash while the active Hermes instance is still loading', () => {
    expect(resolveGatewayModel('', undefined)).toBe('')
  })

  it('prefers the session status model over the active instance model', () => {
    expect(resolveGatewayModel('status-model', { model: 'instance-model' })).toBe(
      'status-model',
    )
  })

  it('falls back to the active instance model', () => {
    expect(resolveGatewayModel('', { model: 'instance-model' })).toBe(
      'instance-model',
    )
  })
})
