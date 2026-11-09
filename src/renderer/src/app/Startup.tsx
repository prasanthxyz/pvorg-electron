import { api } from '../api/client'
import type { Status } from '../api/types'
import { Button } from '../components/controls'
import { ProgressBar } from '../components/feedback'
import { Icon } from '../components/Icon'
import { MissingToolsCallout } from '../components/MissingTools'
import { showError } from '../state/feedback'
import { reloadLibrary, revealLabel } from '../state/status'

/** Startup progress (SPEC §6.6). The detail line is always reserved so the layout never jumps. */
export function StartupProgress({ status }: { status: Status | null }) {
  const title = status?.step ?? 'Starting Up'
  return (
    <div className="startup" role="status" aria-live="polite">
      <Icon name="clapper" size={48} className="startup__glyph" />
      <h1 className="startup__title">{title}</h1>
      <ProgressBar value={status?.fraction ?? null} label={title} />
      <p className="startup__detail truncate tabular">{status?.detail || ' '}</p>
      <div className="startup__callout">
        {!!status?.missingTools.length && <MissingToolsCallout tools={status.missingTools} />}
      </div>
    </div>
  )
}

/** Startup error (SPEC §6.7): what failed, where pvorg looks, and Try Again. */
export function StartupError({ status }: { status: Status }) {
  return (
    <div className="startup" role="alert">
      <Icon name="warning" size={48} className="startup__glyph startup__glyph--warning" />
      <h1 className="startup__title">Couldn’t Load Your Library</h1>
      <p className="startup__message">{status.error}</p>
      <p className="startup__hint">
        pvorg reads its configuration from <code>{status.configPath}</code>.
      </p>
      <div className="startup__actions">
        <Button variant="primary" icon="refresh" autoFocus onClick={() => void reloadLibrary()}>
          Try Again
        </Button>
        {status.configExists && (
          <Button icon="folder" onClick={() => void api.reveal({ kind: 'config' })}>
            {revealLabel()}
          </Button>
        )}
        <Button
          icon="folder"
          onClick={() =>
            void api
              .chooseLibraryFile()
              .catch((error) => showError('Couldn’t Choose a Library', error))
          }
        >
          Choose Library File…
        </Button>
      </div>
    </div>
  )
}
