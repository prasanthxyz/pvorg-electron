import type { Bridge } from '../src/shared/api'

declare global {
  interface Window {
    pvorg: Bridge
  }
}
