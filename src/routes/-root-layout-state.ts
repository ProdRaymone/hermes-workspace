export type RootSurfaceState = {
  showOnboarding: boolean
  showWorkspaceShell: boolean
  showPostOnboardingOverlays: boolean
}

export type OnboardingConnectionStatus = {
  instance?: string
  status?: string
  chatReady?: boolean
  modelConfigured?: boolean
  capabilities?: Record<string, unknown>
}

export function shouldAutoCompleteOnboarding(
  connectionStatus: OnboardingConnectionStatus | null | undefined,
): boolean {
  if (!connectionStatus || connectionStatus.status === 'disconnected') {
    return false
  }
  if (connectionStatus.instance && connectionStatus.instance !== 'default') {
    return false
  }

  const capabilities = connectionStatus.capabilities ?? {}
  const chatReady =
    connectionStatus.chatReady === true ||
    capabilities.chatCompletions === true
  if (!chatReady) return false

  if (connectionStatus.modelConfigured === true) return true

  return (
    capabilities.dashboard === true ||
    capabilities.sessions === true ||
    capabilities.skills === true ||
    capabilities.config === true
  )
}

export function getRootSurfaceState(
  onboardingComplete: boolean | null,
  backendSetupDetected = false,
): RootSurfaceState {
  if (onboardingComplete !== true && !backendSetupDetected) {
    return {
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    }
  }

  return {
    showOnboarding: false,
    showWorkspaceShell: true,
    showPostOnboardingOverlays: true,
  }
}
