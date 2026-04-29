export type RootSurfaceState = {
  showLogin: boolean
  showOnboarding: boolean
  showWorkspaceShell: boolean
  showPostOnboardingOverlays: boolean
}

export type RootAuthStatus = {
  authRequired: boolean
  authenticated: boolean
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
  authStatus: RootAuthStatus | null = null,
  backendSetupDetected = false,
): RootSurfaceState {
  if (authStatus?.authRequired && !authStatus.authenticated) {
    return {
      showLogin: true,
      showOnboarding: false,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    }
  }

  if (onboardingComplete !== true && !backendSetupDetected) {
    return {
      showLogin: false,
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    }
  }

  return {
    showLogin: false,
    showOnboarding: false,
    showWorkspaceShell: true,
    showPostOnboardingOverlays: true,
  }
}
