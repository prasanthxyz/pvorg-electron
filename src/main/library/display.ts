/** Presentation rules shared by every page (SPEC §2). */

/** `jane_doe` → `Jane Doe`. Raw values remain the identifiers everywhere else. */
export function humanize(token: string): string {
  const words = token.replace(/_/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return token
  return words
    .map((word) => {
      const [first, ...rest] = Array.from(word)
      return first.toUpperCase() + rest.join('')
    })
    .join(' ')
}

export function displayTitle(title: string, filename: string): string {
  const trimmed = title.trim()
  return trimmed ? humanize(trimmed) : filename
}

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

export function joinList(items: string[]): string {
  return listFormat.format(items)
}

/** "Studio · Cast". */
export function credits(studio: string, cast: string[]): string {
  return [humanize(studio), joinList(cast.map(humanize))].filter(Boolean).join(' · ')
}

/** Case- and diacritic-insensitive comparison form. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

export function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Humanized title (case-insensitive, locale-aware), then filename. */
export function compareTitles(
  a: { displayTitle: string; filename: string },
  b: { displayTitle: string; filename: string }
): number {
  return (
    collator.compare(fold(a.displayTitle), fold(b.displayTitle)) ||
    collator.compare(fold(a.filename), fold(b.filename)) ||
    compareCodePoints(a.filename, b.filename)
  )
}

/** Chip lists sort by displayed name. */
export function compareLabels(a: string, b: string): number {
  return collator.compare(fold(a), fold(b)) || compareCodePoints(a, b)
}
