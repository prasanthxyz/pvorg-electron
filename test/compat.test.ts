/**
 * The same pvorg.json edits must produce the same content as pvorg-macos and pvorg-web
 * (SPEC §1.2). `fixtures/compat` holds the input and expected outputs of the shared
 * six-step sequence: startup normalization, a gallery mapping save, a tag mapping save,
 * Exclude Pairing for a video without an entry, deleting a video and stale-entry cleanup.
 * `expected/5-cleanup.json` is the native app's verbatim final output. Content is
 * compared as parsed JSON (formatting may differ between platforms).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import * as path from 'path'
import { expect, it } from 'vitest'
import { TestLibrary } from './helpers'

const FIXTURES = path.join(__dirname, 'fixtures', 'compat')

function expected(name: string, root: string): unknown {
  const text = readFileSync(path.join(FIXTURES, 'expected', `${name}.json`), 'utf8')
  return JSON.parse(text.split('__ROOT__').join(root))
}

it('produces the same content as the other apps', async () => {
  const lib = new TestLibrary()
  for (const video of ['acme-jane-one', 'acme-jane-two', 'globex-sam-three', 'hooli-li-four']) {
    writeFileSync(path.join(lib.videos, `${video}.mp4`), '')
  }
  for (const gallery of ['G1', 'G2', 'G3']) mkdirSync(path.join(lib.galleries, gallery))
  const input = readFileSync(path.join(FIXTURES, 'input.json'), 'utf8')
  lib.writeRaw(input.split('__ROOT__').join(lib.root))

  const library = await lib.open()
  expect(lib.read()).toEqual(expected('0-normalize', lib.root))

  await library.saveMappings('galleries', {
    'acme-jane-one.mp4': { G1: 'yes', G2: 'no' },
    'acme-jane-two.mp4': { G3: 'no' },
    'globex-sam-three.mp4': { G1: 'undecided', G2: 'yes' }
  })
  expect(lib.read()).toEqual(expected('1-gallery-mapping', lib.root))

  await library.saveMappings('tags', {
    'acme-jane-one.mp4': { t1: 'yes', t3: 'no' },
    'globex-sam-three.mp4': { t2: 'no' }
  })
  expect(lib.read()).toEqual(expected('2-tag-mapping', lib.root))

  await library.excludePairing('hooli-li-four.mp4', 'G2')
  expect(lib.read()).toEqual(expected('3-exclude-pairing', lib.root))

  await library.deleteVideos(['acme-jane-two.mp4'])
  expect(lib.read()).toEqual(expected('4-delete', lib.root))

  const stale = (await library.stalePreview()).staleEntries
  expect(stale).toEqual(['oldstudio-x-gone.mp4'])
  await library.removeStale(stale)
  expect(lib.read()).toEqual(expected('5-cleanup', lib.root))
  // Canonical formatting: sorted keys, two-space indent, trailing newline.
  expect(lib.text()).toBe(JSON.stringify(expected('5-cleanup', lib.root), null, 2) + '\n')
})
