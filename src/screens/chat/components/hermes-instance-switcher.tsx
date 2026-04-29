import { useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import type { HermesInstanceSummary } from '@/hooks/use-hermes-instances'
import {
  buildHermesInstanceMenuItems,
  getHermesInstanceDotClassName,
  getHermesInstanceStatusToneClassName,
} from '@/lib/hermes-instance-ui'

type HermesInstanceSwitcherProps = {
  instances: Array<HermesInstanceSummary>
  activeInstanceId: string
  onSelectInstance?: (instanceId: string) => void
}

export function HermesInstanceSwitcher({
  instances,
  activeInstanceId,
  onSelectInstance,
}: HermesInstanceSwitcherProps) {
  const items = useMemo(
    () => buildHermesInstanceMenuItems(instances, activeInstanceId),
    [activeInstanceId, instances],
  )
  if (items.length <= 1) return null

  const activeItem =
    items.find((item) => item.selected) ||
    items.find((item) => item.isDefault) ||
    items[0]

  return (
    <MenuRoot>
      <MenuTrigger
        type="button"
        className={cn(
          'mr-3 inline-flex h-8 max-w-[210px] shrink-0 items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/90 px-2.5 text-xs font-semibold text-primary-800 shadow-sm transition-colors',
          'hover:border-primary-300 hover:bg-primary-100 aria-expanded:border-accent-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900',
        )}
        aria-label="Switch Hermes agent"
        title="Switch Hermes agent"
      >
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            getHermesInstanceDotClassName(activeItem.status),
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 truncate">{activeItem.label}</span>
        <span
          className={cn(
            'hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] leading-none sm:inline-flex',
            getHermesInstanceStatusToneClassName(activeItem.status),
          )}
        >
          {activeItem.statusLabel}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={1.8}
          className="shrink-0 text-primary-500"
        />
      </MenuTrigger>
      <MenuContent side="bottom" align="start" className="min-w-[270px] p-1.5">
        {items.map((item) => (
          <MenuItem
            key={item.id}
            onClick={() => {
              if (item.selected) return
              onSelectInstance?.(item.id)
            }}
            className={cn(
              'items-center rounded-lg px-2.5 py-2 text-left',
              item.selected &&
                'bg-primary-100 dark:bg-neutral-900 [&_span[data-instance-label]]:text-primary-950',
            )}
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                getHermesInstanceDotClassName(item.status),
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span
                data-instance-label
                className="block truncate text-sm font-semibold text-primary-900 dark:text-neutral-100"
              >
                {item.label}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-primary-500 dark:text-neutral-400">
                {item.description || item.profileName}
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none',
                getHermesInstanceStatusToneClassName(item.status),
              )}
            >
              {item.statusLabel}
            </span>
            {item.selected ? (
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={15}
                strokeWidth={1.8}
                className="shrink-0 text-emerald-600 dark:text-emerald-300"
              />
            ) : null}
          </MenuItem>
        ))}
      </MenuContent>
    </MenuRoot>
  )
}
