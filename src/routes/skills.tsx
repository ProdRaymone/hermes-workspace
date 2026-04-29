import { createFileRoute } from '@tanstack/react-router'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason } from '@/lib/feature-gates'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { useHermesInstances } from '@/hooks/use-hermes-instances'
import { SkillsScreen } from '@/screens/skills/skills-screen'

export const Route = createFileRoute('/skills')({
  ssr: false,
  component: SkillsRoute,
})

function SkillsRoute() {
  usePageTitle('Skills')
  const { activeInstanceId } = useHermesInstances()
  const skillsAvailable = useFeatureAvailable('skills', activeInstanceId)

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
