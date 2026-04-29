export const REDACTED_SECRET_VALUE = '<redacted>'

const SECRET_KEY_PATTERN =
  /(^authorization$)|(^key$)|(^|[_-])(api[_-]?key|apikey|token|secret|password|credential|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)([_-]|$)/i

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
}

function isSecretLikeString(value: string): boolean {
  const trimmed = value.trim()
  return (
    /^Bearer\s+\S+/i.test(trimmed) ||
    /^sk-[A-Za-z0-9_-]{8,}/.test(trimmed)
  )
}

export function redactSecretValues(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    return isSecretKey(key) || isSecretLikeString(value)
      ? REDACTED_SECRET_VALUE
      : value
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return isSecretKey(key) ? REDACTED_SECRET_VALUE : value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSecretValues(entry))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([entryKey, entryValue]) => [
          entryKey,
          redactSecretValues(entryValue, entryKey),
        ],
      ),
    )
  }

  return value
}

export function redactStringRecord(
  value: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!value) return undefined
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      String(redactSecretValues(entry, key)),
    ]),
  )
}
