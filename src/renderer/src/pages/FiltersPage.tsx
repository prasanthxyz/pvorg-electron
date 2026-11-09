import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { FilterItem, FilterKey, FiltersState } from '../api/types'
import { counted, matches } from '../app/format'
import { usePageCommands } from '../app/shortcuts'
import { Button, IconButton, SearchField } from '../components/controls'
import { PageHeader } from '../components/feedback'
import { Icon } from '../components/Icon'
import { openMenuAt } from '../components/Menu'
import { Thumbnail } from '../components/Thumbnail'
import { dataVersion, showError } from '../state/feedback'
import { createStore, useStore } from '../state/store'

interface SectionSpec {
  key: FilterKey
  title: string
  mode: 'include' | 'require'
  explanation: string
  emptyMessage: string
}

const SECTIONS: SectionSpec[] = [
  {
    key: 'galleries',
    title: 'Galleries',
    mode: 'include',
    explanation: 'Videos are paired only with the galleries you include.',
    emptyMessage: 'No gallery folders were found.'
  },
  {
    key: 'studios',
    title: 'Studios',
    mode: 'include',
    explanation: 'Only videos from the studios you include are shown.',
    emptyMessage: 'No videos were found.'
  },
  {
    key: 'tags',
    title: 'Tags',
    mode: 'require',
    explanation: 'Only videos marked Yes for every selected tag in Tag Mapping are shown.',
    emptyMessage: 'No tags are defined in pvorg.json.'
  },
  {
    key: 'cast',
    title: 'Cast',
    mode: 'require',
    explanation: 'Only videos featuring everyone selected are shown.',
    emptyMessage: 'No cast names were found in video filenames.'
  }
]

const PREVIEW_KEY = 'pvorg.filters.preview'
const previewShown = createStore(localStorage.getItem(PREVIEW_KEY) !== 'hidden')
previewShown.subscribe(() =>
  localStorage.setItem(PREVIEW_KEY, previewShown.get() ? 'shown' : 'hidden')
)

export default function FiltersPage() {
  const version = useStore(dataVersion)
  const showPreview = useStore(previewShown)
  const [filters, setFilters] = useState<FiltersState | null>(null)
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)

  usePageCommands((command) => {
    if (command.type !== 'find') return false
    search.current?.focus()
    search.current?.select()
    return true
  })

  useEffect(() => {
    document.title = 'Filters – PP Video Organizer'
    let cancelled = false
    api
      .filters()
      .then((f) => !cancelled && setFilters(f))
      .catch((e) => showError('Couldn’t Load Filters', e))
    return () => {
      cancelled = true
    }
  }, [version])

  const update = async (key: FilterKey, selected: string[]) => {
    if (!filters) return
    // Optimistic: chips respond instantly, then the server's result replaces it.
    setFilters({
      ...filters,
      sections: { ...filters.sections, [key]: { ...filters.sections[key], selected } }
    })
    try {
      setFilters(await api.setFilters({ [key]: selected }))
    } catch (error) {
      showError('Couldn’t Change Filters', error)
      setFilters(await api.filters())
    }
  }

  const reset = async () => {
    try {
      setFilters(await api.resetFilters())
    } catch (error) {
      showError('Couldn’t Reset Filters', error)
    }
  }

  return (
    <div className="filters">
      <PageHeader
        title="Filters"
        subtitle={filters ? counted(filters.count, 'combination') : ''}
        actions={
          <>
            <SearchField
              ref={search}
              value={query}
              onChange={setQuery}
              placeholder="Filter Names"
              label="Filter names"
            />
            <Button
              icon="refresh"
              disabled={!filters || filters.isDefault}
              onClick={reset}
              title="Include every gallery and studio and clear required tags and cast"
            >
              Reset Filters
            </Button>
            <IconButton
              icon="sidebarRight"
              className="filters__preview-toggle"
              label={showPreview ? 'Hide Preview' : 'Show Preview'}
              aria-pressed={showPreview}
              onClick={() => previewShown.set(!showPreview)}
            />
          </>
        }
      />
      <div className={`filters__body${showPreview ? '' : ' filters__body--no-preview'}`}>
        <div className="filters__sections">
          {filters &&
            SECTIONS.map((spec) => (
              <FilterSection
                key={spec.key}
                spec={spec}
                items={filters.sections[spec.key].items}
                selected={filters.sections[spec.key].selected}
                query={query}
                onChange={(next) => void update(spec.key, next)}
              />
            ))}
        </div>
        {filters && showPreview && <PreviewPanel filters={filters} />}
      </div>
    </div>
  )
}

function FilterSection({
  spec,
  items,
  selected,
  query,
  onChange
}: {
  spec: SectionSpec
  items: FilterItem[]
  selected: string[]
  query: string
  onChange: (selected: string[]) => void
}) {
  const chosen = useMemo(() => new Set(selected), [selected])
  const visible = items.filter((item) => matches(query, [item.label]))
  const all = items.map((i) => i.value)
  const titleId = `filters-${spec.key}`

  const summary =
    spec.mode === 'include'
      ? chosen.size === items.length
        ? `All ${items.length}`
        : `${chosen.size} of ${items.length}`
      : chosen.size === 0
        ? 'Any'
        : `${chosen.size} required`

  const toggle = (value: string) =>
    onChange(chosen.has(value) ? selected.filter((v) => v !== value) : [...selected, value])

  return (
    <section className="filter-section" aria-labelledby={titleId}>
      <div className="filter-section__header">
        <div>
          <h2 id={titleId} className="filter-section__title">
            {spec.title} <span className="filter-section__summary tabular">{summary}</span>
          </h2>
          <p className="filter-section__explanation">{spec.explanation}</p>
        </div>
        {items.length > 0 && (
          <div className="filter-section__actions">
            {spec.mode === 'include' ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={chosen.size === items.length}
                  onClick={() => onChange(all)}
                >
                  Include All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={chosen.size === 0}
                  onClick={() => onChange([])}
                >
                  Include None
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={chosen.size === 0}
                onClick={() => onChange([])}
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="filter-section__note">{spec.emptyMessage}</p>
      ) : visible.length === 0 ? (
        <p className="filter-section__note">No matches</p>
      ) : (
        <ul className="chips" aria-label={spec.title}>
          {visible.map((item) => {
            const on = chosen.has(item.value)
            return (
              <li key={item.value}>
                <button
                  type="button"
                  className={`chip${on ? ' is-selected' : ''}`}
                  aria-pressed={on}
                  title={item.label}
                  onClick={() => toggle(item.value)}
                  onContextMenu={(e) =>
                    openMenuAt(
                      e,
                      item.label,
                      spec.mode === 'include'
                        ? [
                            {
                              label: `Include Only “${item.label}”`,
                              onSelect: () => onChange([item.value])
                            },
                            {
                              label: `Include All Except “${item.label}”`,
                              onSelect: () => onChange(all.filter((v) => v !== item.value))
                            }
                          ]
                        : [
                            {
                              label: `Require Only “${item.label}”`,
                              onSelect: () => onChange([item.value])
                            }
                          ]
                    )
                  }
                >
                  <Icon name={on ? 'checkCircle' : 'circle'} size={16} className="chip__icon" />
                  <span className="chip__label">{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function PreviewPanel({ filters }: { filters: FiltersState }) {
  const navigate = useNavigate()
  const open = async (index?: number) => {
    try {
      if (index !== undefined) await api.goto(index)
      navigate('/')
    } catch (error) {
      showError('Couldn’t Open the Viewer', error)
    }
  }
  return (
    <aside className="preview-panel" aria-labelledby="preview-panel-title">
      <h2 id="preview-panel-title" className="preview-panel__label">
        Combinations
      </h2>
      <p className="preview-panel__count tabular" aria-live="polite">
        {filters.count.toLocaleString()}
      </p>
      <p className="preview-panel__breakdown">
        {counted(filters.videoCount, 'video')} ·{' '}
        {counted(filters.galleryCount, 'gallery', 'galleries')}
      </p>
      <Button
        variant="primary"
        icon="play"
        className="preview-panel__open"
        disabled={!filters.count}
        onClick={() => void open()}
      >
        Open Viewer
      </Button>
      <h3 className="preview-panel__label preview-panel__label--section">Up Next</h3>
      {filters.upNext.length === 0 ? (
        <p className="preview-panel__note">Nothing matches the current filters.</p>
      ) : (
        <ol className="up-next">
          {filters.upNext.map((item) => (
            <li key={`${item.index}`}>
              <button
                type="button"
                className="up-next__item"
                onClick={() => void open(item.index)}
                aria-label={`${item.title} with ${item.gallery}`}
                title="Show in Viewer"
              >
                <Thumbnail src={item.thumbUrl} className="up-next__thumb" />
                <span className="up-next__text">
                  <span className="up-next__title truncate">{item.title}</span>
                  <span className="up-next__gallery truncate">{item.gallery}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
