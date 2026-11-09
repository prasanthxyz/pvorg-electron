import { appInfo } from '../state/status'
import { useStore } from '../state/store'
import { Callout } from './feedback'

function installHint(platform: string | undefined): string {
  if (platform === 'darwin')
    return 'Install it with Homebrew (brew install ffmpeg), then reload the library.'
  if (platform === 'win32')
    return 'Install it with winget (winget install ffmpeg), then restart pvorg.'
  return 'Install it with your package manager (for example, sudo apt install ffmpeg), then reload the library.'
}

/** Names the missing preview tools and how to install them (optional capability, SPEC §6.8). */
export function MissingToolsCallout({ tools }: { tools: string[] }) {
  const info = useStore(appInfo)
  const names = new Intl.ListFormat('en', { type: 'conjunction' }).format(tools)
  return (
    <Callout tone="warning" title={`${names} ${tools.length === 1 ? 'isn’t' : 'aren’t'} installed`}>
      Contact sheets and video details can’t be generated without{' '}
      {tools.length === 1 ? 'it' : 'them'}. {installHint(info?.platform)}
    </Callout>
  )
}
