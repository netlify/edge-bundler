import { promises as fs } from 'fs'
import { join } from 'path'

import tmp from 'tmp-promise'
import { expect, test } from 'vitest'

import { getConfig } from './deno_config.js'

test('Returns `undefined` if no config file is found', async () => {
  const { cleanup, path } = await tmp.dir()
  const config = await getConfig(path)

  expect(config).toBeUndefined()

  await cleanup()
})

test('Returns an empty object if the config file cannot be parsed', async () => {
  const { path } = await tmp.dir()
  const configPath = join(path, 'deno.json')

  await fs.writeFile(configPath, '{')

  const config = await getConfig(path)

  expect(config).toEqual({})

  await fs.rm(path, { recursive: true })
})

test('Resolves `importMap` into an absolute path', async () => {
  const { path } = await tmp.dir()
  const configPath = join(path, 'deno.json')
  const data = JSON.stringify({ importMap: 'import_map.json' })

  await fs.writeFile(configPath, data)

  const config = await getConfig(path)

  expect(config).toEqual({ importMap: join(path, 'import_map.json') })

  await fs.rm(path, { recursive: true })
})

test('Supports JSONC', async () => {
  const { path } = await tmp.dir()
  const configPath = join(path, 'deno.jsonc')
  const data = JSON.stringify({ importMap: 'import_map.json' })

  await fs.writeFile(configPath, `// This is a comment\n${data}`)

  const config = await getConfig(path)

  expect(config).toEqual({ importMap: join(path, 'import_map.json') })

  await fs.rm(path, { recursive: true })
})
