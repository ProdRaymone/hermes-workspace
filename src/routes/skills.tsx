import { createFileRoute } from '@tanstack/react-router'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason } from '@/lib/feature-gates'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { useHermesInstances } from '@/hooks/use-hermes-instances'
import { isDefaultHermesInstance } from '@/lib/hermes-instance-scope'
import { SkillsScreen } from '@/screens/skills/skills-screen'

export const Route = createFileRoute('/skills')({
  ssr: false,
  component: SkillsRoute,
})

function SkillsRoute() {
  usePageTitle('Skills')
  const { activeInstanceId, activeInstance } = useHermesInstances()
  const isDefaultInstance = isDefaultHermesInstance(activeInstanceId)
  const skillsAvailable = useFeatureAvailable('skills', activeInstanceId)

  if (!isDefaultInstance) {
    return (
      <BackendUnavailableState
        feature="Skills"
        description={`${activeInstance?.label ?? activeInstanceId} is selected. Skills inventory is still default-profile scoped in V1, so it is hidden here until the skills API is instance-scoped.`}
      />
    )
  }

  if (!skillsAvailable) {
    return (
      <BackendUnavailableState
        feature="Skills"
        description={getUnavailableReason('Skills')}
      />
    )
  }
  return <SkillsScreen />
}
