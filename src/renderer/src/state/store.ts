import { useSyncExternalStore } from 'react'

/** A minimal observable value, for state that must outlive any one page. */
export interface Store<T> {
  get(): T
  set(next: T | ((previous: T) => T)): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(value) : next
      if (Object.is(resolved, value)) return
      value = resolved
      listeners.forEach((listener) => listener())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
