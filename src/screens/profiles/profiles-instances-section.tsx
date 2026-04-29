import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon,
  Clock01Icon,
  PlayIcon,
  Refresh01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogRoot,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  useHermesInstances,
  type HermesInstanceSummary,
} from '@/hooks/use-hermes-instances'
import {
  getHermesInstanceDotClassName,
  getHermesInstanceStatusLabel,
  getHermesInstanceStatusToneClassName,
  summarizeHermesInstances,
} from '@/lib/hermes-instance-ui'
import {
  buildHermesInstanceFreshnessLabel,
  buildHermesInstanceStartFailureDisplay,
  buildHermesInstanceStartLogPath,
  buildHermesInstanceStartPath,
  getHermesInstanceStartButtonState,
  type HermesInstanceStartFailurePayload,
} from './profiles-instance-start'

type StartInstanceResponse = {
  ok?: boolean
  message?: string
  error?: string
  diagnostic?: HermesInstanceStartFailurePayload['diagnostic']
  logSummary?: HermesInstanceStartFailurePayload['logSummary']
}

type StartLogResponse = {
  ok?: boolean
  summary?: HermesInstanceStartFailurePayload['logSummary']
  error?: string
}

function InstanceMetric({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-lg border border-primary-200 bg-primary-100/60 px-2.5 py-1 text-xs text-primary-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
      <span className="font-semibold text-primary-900 dark:text-neutral-100">
        {value}
      </span>{' '}
      {label}
    </div>
  )
}

function InstanceField({
  label,
  value,
  mono,
  muted,
}: {
  label: string
  value: string
  mono?: boolean
  muted?: boolean
}) {
  return (
    <div className="min-w-0 rounded-lg border border-primary-200 bg-primary-50/70 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-400 dark:text-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 truncate text-sm text-primary-900 dark:text-neutral-100',
          mono && 'font-mono text-xs',
          muted && 'text-primary-400 dark:text-neutral-500',
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

export function HermesInstancesSection() {
  const queryClient = useQueryClient()
  const { activeInstanceId, instances, instancesQuery } = useHermesInstances()
  const [startTarget, setStartTarget] =
    useState<HermesInstanceSummary | null>(null)
  const [startingInstanceId, setStartingInstanceId] = useState<string | null>(
    null,
  )
  const [startFailures, setStartFailures] = useState<
    Record<string, HermesInstanceStartFailurePayload>
  >({})
  const summary = useMemo(
    () => summarizeHermesInstances(instances),
    [instances],
  )
  const freshnessLabel = buildHermesInstanceFreshnessLabel(
    instancesQuery.dataUpdatedAt,
    instancesQuery.isFetching,
  )

  async function refreshInstanceState() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hermes', 'instances'] }),
      queryClient.invalidateQueries({ queryKey: ['hermes', 'connection-status'] }),
      queryClient.invalidateQueries({ queryKey: ['gateway-status'] }),
    ])
  }

  async function handleConfirmStart() {
    if (!startTarget || startingInstanceId) return

    const target = startTarget
    setStartingInstanceId(target.id)
    try {
      const response = await fetch(buildHermesInstanceStartPath(target.id), {
        method: 'POST',
      })
      const payload = (await response.json().catch(() => ({}))) as StartInstanceResponse
      if (!response.ok || payload.ok === false) {
        const failure = {
          error: payload.error || `Start failed (${response.status})`,
          diagnostic: payload.diagnostic,
          logSummary: payload.logSummary,
        }
        setStartFailures((current) => ({
          ...current,
          [target.id]: failure,
        }))
        const display = buildHermesInstanceStartFailureDisplay(failure)
        throw new Error(`${display.title}: ${display.message}`)
      }

      toast(payload.message || `Starting ${target.label} on :${target.port}`, {
        type: 'success',
      })
      setStartFailures((current) => {
        const next = { ...current }
        delete next[target.id]
        return next
      })
      setStartTarget(null)
      await refreshInstanceState()
      window.setTimeout(() => {
        void refreshInstanceState()
      }, 2500)
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : `Failed to start ${target.label}`,
        { type: 'error' },
      )
    } finally {
      setStartingInstanceId(null)
    }
  }

  async function refreshStartLog(instance: HermesInstanceSummary) {
    try {
      const response = await fetch(buildHermesInstanceStartLogPath(instance.id))
      const payload = (await response.json().catch(() => ({}))) as StartLogResponse
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `Log refresh failed (${response.status})`)
      }

      setStartFailures((current) => ({
        ...current,
        [instance.id]: {
          ...(current[instance.id] || {}),
          logSummary: payload.summary,
        },
      }))
      toast(`Refreshed ${instance.label} start log summary`, {
        type: 'info',
      })
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : `Failed to refresh ${instance.label} start log`,
        { type: 'error' },
      )
    }
  }

  return (
    <section className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={UserGroupIcon} size={20} strokeWidth={1.7} />
            <h2 className="text-base font-semibold text-primary-900 dark:text-neutral-100">
              Hermes Agents / Instances
            </h2>
          </div>
          <p className="mt-1 text-sm text-primary-600 dark:text-neutral-400">
            WSL profiles mapped to local Hermes gateway ports.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex flex-wrap gap-2 md:justify-end">
            <InstanceMetric label="total" value={summary.total} />
            <InstanceMetric label="live" value={summary.running} />
            <InstanceMetric label="stopped" value={summary.stopped} />
            {summary.unknown > 0 ? (
              <InstanceMetric label="checking" value={summary.unknown} />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-primary-500 dark:text-neutral-500">
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon
                icon={Clock01Icon}
                size={12}
                strokeWidth={1.7}
              />
              {freshnessLabel}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={instancesQuery.isFetching}
              onClick={() => void refreshInstanceState()}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <HugeiconsIcon
                icon={Refresh01Icon}
                size={13}
                strokeWidth={1.8}
              />
              {instancesQuery.isFetching ? 'Refreshing' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {instancesQuery.isLoading ? (
        <div className="mt-4 flex min-h-[96px] items-center justify-center rounded-xl border border-primary-200 bg-primary-50/60 text-sm text-primary-500 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
          Loading Hermes instances...
        </div>
      ) : instancesQuery.isError ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          Failed to load Hermes instances.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {instances.map((instance) => {
            const active = instance.id === activeInstanceId
            const startButtonState = getHermesInstanceStartButtonState(
              instance,
              startingInstanceId === instance.id,
            )
            const startFailure = startFailures[instance.id]
            const failureDisplay = startFailure
              ? buildHermesInstanceStartFailureDisplay(startFailure)
              : null
            return (
              <article
                key={instance.id}
                className={cn(
                  'rounded-xl border border-primary-200 bg-primary-50 p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70',
                  active && 'border-accent-300 ring-1 ring-accent-300/60',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          getHermesInstanceDotClassName(instance.status),
                        )}
                        aria-hidden="true"
                      />
                      <h3 className="truncate text-sm font-bold text-primary-900 dark:text-neutral-100">
                        {instance.label}
                      </h3>
                      {active ? (
                        <HugeiconsIcon
                          icon={CheckmarkCircle02Icon}
                          size={15}
                          strokeWidth={1.8}
                          className="shrink-0 text-emerald-600 dark:text-emerald-300"
                        />
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-primary-500 dark:text-neutral-400">
                      {instance.profileName}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        getHermesInstanceStatusToneClassName(instance.status),
                      )}
                    >
                      {getHermesInstanceStatusLabel(instance.status)}
                    </span>
                    {startButtonState.visible ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={startButtonState.disabled}
                        onClick={() => setStartTarget(instance)}
                        className="h-7 gap-1.5 px-2 text-xs"
                      >
                        <HugeiconsIcon
                          icon={PlayIcon}
                          size={13}
                          strokeWidth={1.8}
                        />
                        {startButtonState.label}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <InstanceField
                    label="Port"
                    value={String(instance.port)}
                    mono
                  />
                  <InstanceField
                    label="Gateway"
                    value={instance.gatewayUrl}
                    mono
                  />
                  <InstanceField
                    label="Model"
                    value={instance.model || 'Not set'}
                    muted={!instance.model}
                  />
                  <InstanceField
                    label="Provider"
                    value={instance.provider || 'Not set'}
                    muted={!instance.provider}
                  />
                </div>

                <div className="mt-3 flex items-center gap-1.5 truncate text-xs text-primary-500 dark:text-neutral-500">
                  <HugeiconsIcon
                    icon={Clock01Icon}
                    size={12}
                    strokeWidth={1.7}
                  />
                  <span
                    className="truncate font-mono"
                    title={instance.profilePath}
                  >
                    {instance.profilePath}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-primary-400 dark:text-neutral-500">
                  {freshnessLabel}
                </div>
                {failureDisplay ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
                    <div className="font-semibold">{failureDisplay.title}</div>
                    <div className="mt-1 break-words">
                      {failureDisplay.message}
                    </div>
                    {failureDisplay.hint ? (
                      <div className="mt-1 text-red-600 dark:text-red-300">
                        {failureDisplay.hint}
                      </div>
                    ) : null}
                    {failureDisplay.logLines.length ? (
                      <pre className="mt-2 max-h-32 overflow-auto rounded border border-red-200/70 bg-white/70 p-2 font-mono text-[11px] leading-relaxed text-red-900 dark:border-red-900/60 dark:bg-neutral-950/80 dark:text-red-100">
                        {failureDisplay.logLines.join('\n')}
                      </pre>
                    ) : null}
                    {failureDisplay.truncated ? (
                      <div className="mt-1 text-red-500 dark:text-red-300">
                        Showing latest redacted lines.
                      </div>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void refreshStartLog(instance)}
                      className="mt-2 h-7 gap-1.5 border-red-200 px-2 text-xs text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:text-red-200 dark:hover:bg-red-950/40"
                    >
                      <HugeiconsIcon
                        icon={Refresh01Icon}
                        size={13}
                        strokeWidth={1.8}
                      />
                      Refresh log
                    </Button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}

      <AlertDialogRoot
        open={Boolean(startTarget)}
        onOpenChange={(open) => {
          if (!open) setStartTarget(null)
        }}
      >
        <AlertDialogContent>
          <div className="p-4">
            <AlertDialogTitle className="mb-1">
              Start {startTarget?.label}
            </AlertDialogTitle>
            <AlertDialogDescription className="mb-4">
              This starts only {startTarget?.label} on port {startTarget?.port}.
              Hermes1/default stays untouched.
            </AlertDialogDescription>
            {startTarget ? (
              <div className="mb-4 grid gap-2 rounded-lg border border-primary-200 bg-primary-50/70 p-3 text-xs text-primary-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400">
                <div className="flex justify-between gap-3">
                  <span>Profile</span>
                  <span className="min-w-0 truncate font-mono text-primary-900 dark:text-neutral-100">
                    {startTarget.profileName}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Gateway</span>
                  <span className="min-w-0 truncate font-mono text-primary-900 dark:text-neutral-100">
                    {startTarget.gatewayUrl}
                  </span>
                </div>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <AlertDialogCancel disabled={Boolean(startingInstanceId)}>
                Cancel
              </AlertDialogCancel>
              <Button
                onClick={() => void handleConfirmStart()}
                disabled={Boolean(startingInstanceId)}
              >
                <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
                {startingInstanceId ? 'Starting...' : 'Start Instance'}
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialogRoot>
    </section>
  )
}
