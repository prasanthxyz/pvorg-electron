import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RevealTarget, Settings } from '../api/types'
import { openCleanup } from '../components/CleanupDialog'
import { Button, IconButton, Kbd, MiddleTruncate, Segmented } from '../components/controls'
import { PageHeader } from '../components/feedback'
import { openImport } from '../components/ImportDialog'
import { MissingToolsCallout } from '../components/MissingTools'
import { appearance, setAppearance, type Appearance } from '../state/appearance'
import { dataVersion, showError } from '../state/feedback'
import { commandKey, reloadLibrary, revealLabel, status } from '../state/status'
import { useStore } from '../state/store'

const SOURCE_NOTE: Record<Settings['configSource'], string> = {
  settings: 'Chosen in Settings',
  environment: 'From the PVORG_CONFIG environment variable',
  default: 'The default location'
}

export default function SettingsPage() {
  const choice = useStore(appearance)
  const version = useStore(dataVersion)
  const revision = useStore(status)?.revision
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    document.title = 'Settings – PP Video Organizer'
    let cancelled = false
    api
      .settings()
      .then((s) => !cancelled && setSettings(s))
      .catch((e) => showError('Couldn’t Load Settings', e))
    return () => {
      cancelled = true
    }
  }, [version, revision])

  const mod = commandKey()
  const mac = mod === '⌘'
  const shortcuts: [string, string[]][] = [
    ['Go to Viewer', ['V']],
    ['Go to Filters', ['C']],
    ['Hide / show sidebar', [mac ? '⌃⌘S' : 'Ctrl+\\']],
    ['Contact sheet / video', ['P']],
    ['Previous / next combination', ['B', 'N']],
    ['Exclude Pairing', ['⌫']],
    ['Play / pause (video)', ['Space']],
    ['Skip back / forward 10 s (video)', ['←', '→']],
    ['Jump to 0%…90% (video)', ['0', '…', '9']],
    ['Volume up / down (video)', ['↑', '↓']],
    ['Mute / full screen (video)', ['M', 'F']],
    ['Undo / redo', [`${mod}Z`, mac ? '⇧⌘Z' : 'Ctrl+Shift+Z']],
    ['Library: select all / deselect all', [`${mod}A`, 'Esc']],
    ['Library: delete selected', [mac ? '⌘⌫' : 'Delete']],
    ['Mapping: save changes', [`${mod}S`]],
    ['Reload Library', [`${mod}R`]]
  ]

  const chooseLibrary = () =>
    void api.chooseLibraryFile().catch((error) => showError('Couldn’t Choose a Library', error))

  return (
    <div className="settings">
      <PageHeader title="Settings" />
      <div className="page-scroll">
        <div className="settings__content">
          <section className="settings-group" aria-labelledby="settings-appearance">
            <h2 id="settings-appearance" className="settings-group__title">
              Appearance
            </h2>
            <div className="settings-row">
              <div className="settings-row__text">
                <span className="settings-row__label" id="appearance-label">
                  Theme
                </span>
                <span className="settings-row__note">
                  The viewer stage stays dark in every appearance.
                </span>
              </div>
              <Segmented<Appearance>
                label="Appearance"
                value={choice}
                onChange={(value) => void setAppearance(value)}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' }
                ]}
              />
            </div>
          </section>

          <section className="settings-group" aria-labelledby="settings-library">
            <h2 id="settings-library" className="settings-group__title">
              Library
            </h2>
            <PathRow
              label="Library file"
              note={settings ? SOURCE_NOTE[settings.configSource] : undefined}
              path={settings?.configPath ?? null}
              target={settings?.configExists ? { kind: 'config' } : null}
            />
            <PathRow
              label="Videos folder"
              path={settings?.videosPath ?? null}
              target={{ kind: 'videos' }}
            />
            <PathRow
              label="Galleries folder"
              path={settings?.galleriesPath ?? null}
              target={{ kind: 'galleries' }}
            />
            <div className="settings-row settings-row--actions">
              <span className="settings-row__note">
                Choose another pvorg.json to switch libraries. PP Video Organizer remembers it.
              </span>
              <span className="settings-row__buttons">
                {settings?.configSource === 'settings' && (
                  <Button
                    onClick={() =>
                      void api
                        .useDefaultLibrary()
                        .catch((error) => showError('Couldn’t Change the Library', error))
                    }
                  >
                    Use Default
                  </Button>
                )}
                <Button icon="folder" onClick={chooseLibrary}>
                  Choose Library File…
                </Button>
              </span>
            </div>
            <div className="settings-row settings-row--actions">
              <span className="settings-row__buttons">
                <Button icon="refresh" onClick={() => void reloadLibrary()}>
                  Reload Library
                </Button>
                <Button icon="cleanup" onClick={openCleanup}>
                  Clean Up Stale Entries…
                </Button>
                <Button icon="import" onClick={() => void openImport()}>
                  Import from pvorg.yml…
                </Button>
              </span>
            </div>
          </section>

          <section className="settings-group" aria-labelledby="settings-tools">
            <h2 id="settings-tools" className="settings-group__title">
              Preview Tools
            </h2>
            <ToolRow name="ffmpeg" path={settings?.tools.ffmpeg} />
            <ToolRow name="ffprobe" path={settings?.tools.ffprobe} />
            {settings && (!settings.tools.ffmpeg || !settings.tools.ffprobe) && (
              <div className="settings-row">
                <MissingToolsCallout
                  tools={(['ffmpeg', 'ffprobe'] as const).filter((t) => !settings.tools[t])}
                />
              </div>
            )}
          </section>

          <section className="settings-group" aria-labelledby="settings-keys">
            <h2 id="settings-keys" className="settings-group__title">
              Keyboard Shortcuts
            </h2>
            <p className="settings-group__note">
              Shortcuts pause while you type in a search field. Every shortcut is also in the menu
              bar.
            </p>
            <dl className="shortcut-list">
              {shortcuts.map(([action, keys]) => (
                <div key={action} className="shortcut-list__row">
                  <dt>{action}</dt>
                  <dd>
                    {keys.map((k) =>
                      k === '…' ? (
                        <span key={k} aria-hidden="true">
                          …
                        </span>
                      ) : (
                        <Kbd key={k}>{k}</Kbd>
                      )
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}

function PathRow({
  label,
  note,
  path,
  target
}: {
  label: string
  note?: string
  path: string | null
  target: RevealTarget | null
}) {
  const reveal = async () => {
    if (!target) return
    const { ok } = await api.reveal(target)
    if (!ok) showError(`Couldn’t Show the ${label}`, new Error(`${path} doesn’t exist.`))
  }
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label">
          {label}
          {note && <span className="settings-row__source"> · {note}</span>}
        </span>
        <span className="settings-row__path">
          <MiddleTruncate text={path ?? '—'} />
        </span>
      </div>
      <IconButton
        icon="folder"
        label={`${revealLabel()}: ${label.toLowerCase()}`}
        disabled={!path || !target}
        onClick={() => void reveal()}
      />
    </div>
  )
}

function ToolRow({ name, path }: { name: string; path: string | null | undefined }) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label">{name}</span>
        <span className="settings-row__path">
          {path === undefined ? '—' : path ? <MiddleTruncate text={path} /> : 'Not found'}
        </span>
      </div>
    </div>
  )
}
