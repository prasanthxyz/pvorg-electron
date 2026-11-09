import { describe, expect, it } from 'vitest'
import { generateCombinations, type Filters } from '../src/main/library/combinations'
import type { AppConfig } from '../src/main/library/config'
import { applyMappingChanges, triState } from '../src/main/library/relations'
import { makeVideo, type Gallery } from '../src/main/library/scanner'
import { seeded } from './helpers'

const config = (videoRelations: AppConfig['videoRelations'] = {}): AppConfig => ({
  videosPath: '/v',
  galleriesPath: '/g',
  tags: ['4k', 'night'],
  videoRelations
})

const galleries: Gallery[] = ['A', 'B', 'C'].map((name) => ({ name, images: [] }))
const names = galleries.map((g) => g.name)

describe('combinations (§3.1)', () => {
  const cfg = config({
    'acme-jane-one.mp4': { excludedGalleries: ['B'], tags: ['4k', 'night'] },
    'acme-sam-two.mp4': { galleries: ['A'], tags: ['4k'], excludedTags: ['night'] },
    'globex-jane-sam-three.mp4': {}
  })
  const videos = Object.keys(cfg.videoRelations).map((f) => makeVideo(f, cfg, names))
  const all = (): Filters => ({
    galleries: new Set(names),
    studios: new Set(['acme', 'globex']),
    tags: new Set(),
    cast: new Set()
  })
  const ids = (filters: Filters): string[] =>
    generateCombinations(videos, galleries, filters, seeded())
      .map((c) => `${c.video.filename}|${c.gallery.name}`)
      .sort()

  it('pairs every video with every gallery it isn’t excluded from (galleries opt-out)', () => {
    expect(ids(all())).toEqual([
      'acme-jane-one.mp4|A',
      'acme-jane-one.mp4|C',
      'acme-sam-two.mp4|A',
      'acme-sam-two.mp4|B',
      'acme-sam-two.mp4|C',
      'globex-jane-sam-three.mp4|A',
      'globex-jane-sam-three.mp4|B',
      'globex-jane-sam-three.mp4|C'
    ])
  })

  it('includes galleries and studios', () => {
    expect(ids({ ...all(), galleries: new Set(['B']), studios: new Set(['acme']) })).toEqual([
      'acme-sam-two.mp4|B'
    ])
  })

  it('requires every selected tag to be Yes (tags opt-in)', () => {
    expect(ids({ ...all(), galleries: new Set(['A']), tags: new Set(['4k']) })).toEqual([
      'acme-jane-one.mp4|A',
      'acme-sam-two.mp4|A'
    ])
    expect(ids({ ...all(), galleries: new Set(['A']), tags: new Set(['4k', 'night']) })).toEqual([
      'acme-jane-one.mp4|A'
    ])
  })

  it('requires every selected cast member', () => {
    expect(ids({ ...all(), galleries: new Set(['A']), cast: new Set(['jane', 'sam']) })).toEqual([
      'globex-jane-sam-three.mp4|A'
    ])
  })

  it('shuffles', () => {
    const order = (seed: number): string[] =>
      generateCombinations(videos, galleries, all(), seeded(seed)).map(
        (c) => `${c.video.filename}|${c.gallery.name}`
      )
    expect(order(1)).not.toEqual(order(2))
  })
})

describe('mapping saves (§3.3)', () => {
  it('writes known names in vocabulary order and keeps unknown values after them', () => {
    const cfg = config({
      'a-b-c.mp4': { galleries: ['Retired', 'C'], excludedGalleries: [], tags: ['night'] }
    })
    applyMappingChanges(
      cfg,
      'galleries',
      { 'a-b-c.mp4': { A: 'yes', B: 'no', C: 'undecided' } },
      names
    )
    expect(cfg.videoRelations['a-b-c.mp4']).toEqual({
      galleries: ['A', 'Retired'],
      excludedGalleries: ['B'],
      tags: ['night'],
      excludedTags: []
    })
  })

  it('moves a name between the lists', () => {
    const cfg = config({ 'a-b-c.mp4': { galleries: ['A'], excludedGalleries: [] } })
    applyMappingChanges(cfg, 'galleries', { 'a-b-c.mp4': { A: 'no' } }, names)
    expect(triState(cfg.videoRelations['a-b-c.mp4'], 'galleries', 'A')).toBe('no')
    applyMappingChanges(cfg, 'galleries', { 'a-b-c.mp4': { A: 'yes' } }, names)
    expect(cfg.videoRelations['a-b-c.mp4'].galleries).toEqual(['A'])
    expect(cfg.videoRelations['a-b-c.mp4'].excludedGalleries).toEqual([])
  })

  it('creates relations with all four arrays and never touches the other pair', () => {
    const cfg = config()
    applyMappingChanges(cfg, 'tags', { 'a-b-c.mp4': { night: 'yes', '4k': 'no' } }, ['4k', 'night'])
    expect(cfg.videoRelations['a-b-c.mp4']).toEqual({
      galleries: [],
      excludedGalleries: [],
      tags: ['night'],
      excludedTags: ['4k']
    })
  })

  it('ignores columns outside the vocabulary', () => {
    const cfg = config()
    applyMappingChanges(cfg, 'galleries', { 'a-b-c.mp4': { Nope: 'yes' } }, names)
    expect(cfg.videoRelations['a-b-c.mp4'].galleries).toEqual([])
  })

  it('reads tri-states', () => {
    const relation = { galleries: ['A'], excludedGalleries: ['B'] }
    expect(triState(relation, 'galleries', 'A')).toBe('yes')
    expect(triState(relation, 'galleries', 'B')).toBe('no')
    expect(triState(relation, 'galleries', 'C')).toBe('undecided')
    expect(triState(undefined, 'tags', 'x')).toBe('undecided')
  })
})
