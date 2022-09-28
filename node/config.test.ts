import { promises as fs } from 'fs'
import { join, resolve } from 'path'

import del from 'del'
import { stub } from 'sinon'
import tmp from 'tmp-promise'
import { test, expect } from 'vitest'

import { fixturesDir } from '../test/util.js'

import { DenoBridge } from './bridge.js'
import { bundle } from './bundler.js'
import { getFunctionConfig } from './config.js'
import type { Declaration } from './declaration.js'

test('`getFunctionConfig` extracts configuration properties from function file', async () => {
  const { path: tmpDir } = await tmp.dir()
  const deno = new DenoBridge({
    cacheDirectory: tmpDir,
  })

  const functions = [
    // No config
    {
      expectedConfig: {},
      name: 'func1',
      source: `export default async () => new Response("Hello from function one")`,
    },

    // Empty config
    {
      expectedConfig: {},
      name: 'func2',
      source: `
        export default async () => new Response("Hello from function two")

        export const config = () => ({})
      `,
    },

    // Config with the wrong type
    {
      expectedConfig: {},
      name: 'func3',
      source: `
      export default async () => new Response("Hello from function two")

      export const config = {}
    `,
      userLog: /^'config' export in edge function at '(.*)' must be a function$/,
    },

    // Config with a syntax error
    {
      expectedConfig: {},
      name: 'func4',
      source: `
      export default async () => new Response("Hello from function two")

      export const config
    `,
      userLog: /^Could not load edge function at '(.*)'$/,
    },

    // Config that throws
    {
      expectedConfig: {},
      name: 'func5',
      source: `
          export default async () => new Response("Hello from function two")
    
          export const config = () => {
            throw new Error('uh-oh')
          }
        `,
      userLog: /^Error while running 'config' function in edge function at '(.*)'$/,
    },

    // Config with `path`
    {
      expectedConfig: { path: '/home' },
      name: 'func6',
      source: `
        export default async () => new Response("Hello from function three")

        export const config = () => ({ path: "/home" })
      `,
    },
  ]

  for (const func of functions) {
    const logger = {
      user: stub().resolves(),
      system: stub().resolves(),
    }
    const path = join(tmpDir, `${func.name}.js`)

    await fs.writeFile(path, func.source)

    const config = await getFunctionConfig(
      {
        name: func.name,
        path,
      },
      deno,
      logger,
    )

    expect(config).toEqual(func.expectedConfig)

    if (func.userLog) {
      expect(logger.user.firstCall.firstArg).toMatch(func.userLog)
    } else {
      expect(logger.user.callCount).toBe(0)
    }
  }

  await del(tmpDir, { force: true })
})

test('Ignores function paths from the in-source `config` function if the feature flag is off', async () => {
  const sourceDirectory = resolve(fixturesDir, 'with_config', 'functions')
  const tmpDir = await tmp.dir()

  // No TOML declarations.
  const declarations: Declaration[] = []
  const result = await bundle([sourceDirectory], tmpDir.path, declarations, {
    basePath: fixturesDir,
    featureFlags: {
      edge_functions_produce_eszip: true,
    },
  })
  const generatedFiles = await fs.readdir(tmpDir.path)

  expect(result.functions.length).toBe(1)
  expect(generatedFiles.length).toBe(2)

  const manifestFile = await fs.readFile(resolve(tmpDir.path, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestFile)
  const { bundles, routes } = manifest

  expect(bundles.length).toBe(1)
  expect(bundles[0].format).toBe('eszip2')
  expect(generatedFiles.includes(bundles[0].asset)).toBe(true)
  expect(routes.length).toBe(0)

  await fs.rmdir(tmpDir.path, { recursive: true })
})

test('Loads function paths from the in-source `config` function', async () => {
  const sourceDirectory = resolve(fixturesDir, 'with_config', 'functions')
  const tmpDir = await tmp.dir()

  // No TOML declarations.
  const declarations: Declaration[] = []
  const result = await bundle([sourceDirectory], tmpDir.path, declarations, {
    basePath: fixturesDir,
    featureFlags: {
      edge_functions_config_export: true,
      edge_functions_produce_eszip: true,
    },
  })
  const generatedFiles = await fs.readdir(tmpDir.path)

  expect(result.functions.length).toBe(1)
  expect(generatedFiles.length).toBe(2)

  const manifestFile = await fs.readFile(resolve(tmpDir.path, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestFile)
  const { bundles, routes } = manifest

  expect(bundles.length).toBe(1)
  expect(bundles[0].format).toBe('eszip2')
  expect(generatedFiles.includes(bundles[0].asset)).toBe(true)

  expect(routes[0].function).toBe('func1')
  expect(routes[0].pattern).toBe('^/hello/?$')

  await fs.rmdir(tmpDir.path, { recursive: true })
})
