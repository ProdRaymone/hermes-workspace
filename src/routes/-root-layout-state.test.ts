import { describe, expect, it } from 'vitest'
import {
  getRootSurfaceState,
  shouldAutoCompleteOnboarding,
} from './-root-layout-state'

describe('root layout surface state', () => {
  it('shows fullscreen onboarding until onboarding is complete', () => {
    expect(getRootSurfaceState(false)).toEqual({
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    })

    expect(getRootSurfaceState(null)).toEqual({
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    })
  })

  it('shows workspace shell and post-onboarding overlays after completion', () => {
    expect(getRootSurfaceState(true)).toEqual({
      showOnboarding: false,
      showWorkspaceShell: true,
      showPostOnboardingOverlays: true,
    })
  })

  it('shows workspace shell when backend setup is already auto-detected', () => {
    expect(getRootSurfaceState(false, true)).toEqual({
      showOnboarding: false,
      showWorkspaceShell: true,
      showPostOnboardingOverlays: true,
    })
  })

  it('auto-completes onboarding for a ready Hermes gateway even without a local model flag', () => {
    expect(
      shouldAutoCompleteOnboarding({
        status: 'enhanced',
        chatReady: true,
        modelConfigured: false,
        capabilities: {
          chatCompletions: true,
          dashboard: true,
          config: true,
          sessions: true,
        },
      }),
    ).toBe(true)
  })

  it('keeps onboarding for a generic chat endpoint when no model is configured', () => {
    expect(
      shouldAutoCompleteOnboarding({
        status: 'partial',
        chatReady: true,
        modelConfigured: false,
        capabilities: {
          chatCompletions: true,
        },
      }),
    ).toBe(false)
  })

  it('auto-completes onboarding when the default backend has an active model configured', () => {
    expect(
      shouldAutoCompleteOnboarding({
        status: 'connected',
        chatReady: true,
        modelConfigured: true,
        capabilities: {
          chatCompletions: true,
        },
      }),
    ).toBe(true)
  })

  it('does not auto-complete onboarding from a non-default instance status', () => {
    expect(
      shouldAutoCompleteOnboarding({
        instance: 'hermes2',
        status: 'enhanced',
        chatReady: true,
        modelConfigured: true,
        capabilities: {
          chatCompletions: true,
          dashboard: true,
          config: true,
          sessions: true,
        },
      }),
    ).toBe(false)
  })
})
