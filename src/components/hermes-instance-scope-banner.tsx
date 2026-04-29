import { HugeiconsIcon } from '@hugeicons/react'
import { Link01Icon } from '@hugeicons/core-free-icons'
import type { HermesInstanceSummary } from '@/hooks/use-hermes-instances'
import type { HermesScopeKind } from '@/lib/hermes-instance-ui'
import {
  buildHermesScopeSummary,
  getHermesInstanceDotClassName,
  getHermesInstanceStatusToneClassName,
} from '@/lib/hermes-instance-ui'
import { cn } from '@/lib/utils'

type HermesInstanceScopeBannerProps = {
  instance?: HermesInstanceSummary
  scopeKind: HermesScopeKind
  title: string
  detail: string
  className?: string
}

export function HermesInstanceScopeBanner({
  instance,
  scopeKind,
  title,
  detail,
  className,
}: HermesInstanceScopeBannerProps) {
  const summary = buildHermesScopeSummary(instance, scopeKind)

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2 text-xs text-primary-700 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <HugeiconsIcon
          icon={Link01Icon}
          size={16}
          strokeWidth={1.7}
          className="mt-0.5 shrink-0 text-primary-500 dark:text-neutral-400"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-primary-900 dark:text-neutral-100">
              {title}
            </span>
            <span className="rounded-full border border-primary-200 bg-primary-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
              {summary.scopeLabel}
            </span>
          </div>
          <div className="mt-1 text-primary-500 dark:text-neutral-400">
            {detail}
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              getHermesInstanceDotClassName(instance?.status),
            )}
            aria-hidden="true"
          />
          <span className="truncate font-semibold text-primary-900 dark:text-neutral-100">
            {summary.instanceLabel}
          </span>
        </span>
        <span
          className={cn(
            'rounded-full border px-2 py-1 text-[11px] font-semibold leading-none',
            getHermesInstanceStatusToneClassName(instance?.status),
          )}
        >
          {summary.statusLabel}
        </span>
        <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-1 font-mono text-[11px] text-primary-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400">
          {summary.endpointLabel}
        </span>
      </div>
    </div>
  )
}
