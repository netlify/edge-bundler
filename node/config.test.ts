import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'

import { deleteAsync } from 'del'
import tmp from 'tmp-promise'
import { test, expect, vi, describe } from 'vitest'

import { fixturesDir, useFixture } from '../test/util.js'

import { DenoBridge } from './bridge.js'
import { bundle } from './bundler.js'
import { getFunctionConfig } from './config.js'
import type { Declaration } from './declaration.js'
import { ImportMap } from './import_map.js'

const importMapFile = {
  baseURL: new URL('file:///some/path/import-map.json'),
  imports: {
    'alias:helper': pathToFileURL(join(fixturesDir, 'helper.ts')).toString(),
  },
}

const invalidDefaultExportErr = (path: string) =>
  `Default export in '${path}' must be a function. More on the Edge Functions API at https://ntl.fyi/edge-api.`

const functions = [
  {
    testName: 'no config',
    expectedConfig: {},
    name: 'func1',
    source: `export default async () => new Response("Hello from function one")`,
  },
  {
    testName: 'empty config',
    expectedConfig: {},
    name: 'func2',
    source: `
        export default async () => new Response("Hello from function two")

        export const config = {}
      `,
  },
  {
    testName: 'config with wrong type (throw)',
    expectedConfig: {},
    name: 'func3',
    source: `
      export default async () => new Response("Hello from function two")

      export const config = () => ({})
    `,
    error:
      /^The 'config' export in edge function at '(.*)' must be an object\. More on the Edge Functions API at https:\/\/ntl\.fyi\/edge-api\.$/,
    featureFlags: {
      edge_functions_invalid_config_throw: true,
    },
  },
  {
    testName: 'config with wrong type (log)',
    expectedConfig: {},
    name: 'func3',
    source: `
      export default async () => new Response("Hello from function two")

      export const config = () => ({})
    `,
    userLog: /^'config' export in edge function at '(.*)' must be an object$/,
    featureFlags: {
      edge_functions_invalid_config_throw: false,
    },
  },
  {
    testName: 'config with syntax error (throw)',
    expectedConfig: {},
    name: 'func4',
    source: `
      export default async () => new Response("Hello from function two")

      export const config
    `,
    error:
      /^Could not load edge function at '(.*)'\. More on the Edge Functions API at https:\/\/ntl\.fyi\/edge-api\.$/,
    featureFlags: {
      edge_functions_invalid_config_throw: true,
    },
  },
  {
    testName: 'config with syntax error (log)',
    expectedConfig: {},
    name: 'func4',
    source: `
      export default async () => new Response("Hello from function two")

      export const config
    `,
    userLog: /^Could not load edge function at '(.*)'$/,
    featureFlags: {
      edge_functions_invalid_config_throw: false,
    },
  },
  {
    testName: 'config with correct onError',
    expectedConfig: { onError: 'bypass' },
    name: 'func5',
    source: `
      export default async () => new Response("Hello from function two")
      export const config = { onError: "bypass" }
    `,
  },
  {
    testName: 'config with wrong onError',
    name: 'func7',
    source: `
      export default async () => new Response("Hello from function two")
      export const config = { onError: "foo" }
    `,
    error: /The 'onError' configuration property in edge function at .*/,
  },
  {
    testName: 'config with `path`',
    expectedConfig: { path: '/home' },
    name: 'func6',
    source: `
        export default async () => new Response("Hello from function three")

        export const config = { path: "/home" }
      `,
  },
]
describe('`getFunctionConfig` extracts configuration properties from function file', () => {
  test.each(functions)('$testName', async (func) => {
    const { path: tmpDir } = await tmp.dir()
    const deno = new DenoBridge({
      cacheDirectory: tmpDir,
    })

    const logger = {
      user: vi.fn().mockResolvedValue(null),
      system: vi.fn().mockResolvedValue(null),
    }
    const path = join(tmpDir, `${func.name}.js`)

    await fs.writeFile(path, func.source)

    const funcCall = () =>
      getFunctionConfig(
        {
          name: func.name,
          path,
        },
        new ImportMap([importMapFile]),
        deno,
        logger,
        func.featureFlags || {},
      )

    if (func.error) {
      await expect(funcCall()).rejects.toThrowError(func.error)
    } else if (func.userLog) {
      await expect(funcCall()).resolves.not.toThrowError()
      expect(logger.user).toHaveBeenCalledWith(expect.stringMatching(func.userLog))
    } else {
      const config = await funcCall()
      expect(config).toEqual(func.expectedConfig)
      expect(logger.user).not.toHaveBeenCalled()
    }

    await deleteAsync(tmpDir, { force: true })
  })
})

test('Loads function paths from the in-source `config` function', async () => {
  const { basePath, cleanup, distPath } = await useFixture('with_config')
  const userDirectory = resolve(basePath, 'netlify', 'edge-functions')
  const internalDirectory = resolve(basePath, '.netlify', 'edge-functions')
  const declarations: Declaration[] = [
    {
      function: 'framework-func2',
      path: '/framework-func2',
    },
    {
      function: 'user-func2',
      path: '/user-func2',
    },
  ]
  const result = await bundle([internalDirectory, userDirectory], distPath, declarations, {
    basePath,
    configPath: join(internalDirectory, 'config.json'),
  })
  const generatedFiles = await fs.readdir(distPath)

  expect(result.functions.length).toBe(7)
  expect(generatedFiles.length).toBe(2)

  const manifestFile = await fs.readFile(resolve(distPath, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestFile)
  const { bundles, routes, post_cache_routes: postCacheRoutes, function_config: functionConfig } = manifest

  expect(bundles.length).toBe(1)
  expect(bundles[0].format).toBe('eszip2')
  expect(generatedFiles.includes(bundles[0].asset)).toBe(true)

  expect(routes.length).toBe(6)
  expect(routes[0]).toEqual({ function: 'framework-func2', pattern: '^/framework-func2/?$' })
  expect(routes[1]).toEqual({ function: 'user-func2', pattern: '^/user-func2/?$' })
  expect(routes[2]).toEqual({ function: 'framework-func1', pattern: '^/framework-func1/?$' })
  expect(routes[3]).toEqual({ function: 'user-func1', pattern: '^/user-func1/?$' })
  expect(routes[4]).toEqual({ function: 'user-func3', pattern: '^/user-func3/?$' })
  expect(routes[5]).toEqual({ function: 'user-func5', pattern: '^/user-func5/.*/?$' })

  expect(postCacheRoutes.length).toBe(1)
  expect(postCacheRoutes[0]).toEqual({ function: 'user-func4', pattern: '^/user-func4/?$' })

  expect(Object.keys(functionConfig)).toHaveLength(1)
  expect(functionConfig['user-func5']).toEqual({
    excluded_patterns: ['^/user-func5/excluded/?$'],
  })

  await cleanup()
})

test('Passes validation if default export exists and is a function', async () => {
  const { path: tmpDir } = await tmp.dir()
  const deno = new DenoBridge({
    cacheDirectory: tmpDir,
  })

  const func = {
    name: 'func1',
    source: `
        const func = () => new Response("Hello world!")
        export default func
      `,
  }

  const logger = {
    user: vi.fn().mockResolvedValue(null),
    system: vi.fn().mockResolvedValue(null),
  }
  const path = join(tmpDir, `${func.name}.ts`)

  await fs.writeFile(path, func.source)

  await expect(
    getFunctionConfig(
      {
        name: func.name,
        path,
      },
      new ImportMap([importMapFile]),
      deno,
      logger,
      {},
    ),
  ).resolves.not.toThrow()

  await deleteAsync(tmpDir, { force: true })
})

test('Fails validation if default export is not function', async () => {
  const { path: tmpDir } = await tmp.dir()
  const deno = new DenoBridge({
    cacheDirectory: tmpDir,
  })

  const func = {
    name: 'func2',
    source: `
        const func = new Response("Hello world!")
        export default func
      `,
  }

  const logger = {
    user: vi.fn().mockResolvedValue(null),
    system: vi.fn().mockResolvedValue(null),
  }
  const path = join(tmpDir, `${func.name}.ts`)

  await fs.writeFile(path, func.source)

  const config = getFunctionConfig(
    {
      name: func.name,
      path,
    },
    new ImportMap([importMapFile]),
    deno,
    logger,
    {},
  )

  await expect(config).rejects.toThrowError(invalidDefaultExportErr(path))

  await deleteAsync(tmpDir, { force: true })
})

test('Fails validation if default export is not present', async () => {
  const { path: tmpDir } = await tmp.dir()
  const deno = new DenoBridge({
    cacheDirectory: tmpDir,
  })

  const func = {
    name: 'func3',
    source: `
        export const func = () => new Response("Hello world!")
      `,
  }

  const logger = {
    user: vi.fn().mockResolvedValue(null),
    system: vi.fn().mockResolvedValue(null),
  }
  const path = join(tmpDir, `${func.name}.ts`)

  await fs.writeFile(path, func.source)

  const config = getFunctionConfig(
    {
      name: func.name,
      path,
    },
    new ImportMap([importMapFile]),
    deno,
    logger,
    {},
  )

  await expect(config).rejects.toThrowError(invalidDefaultExportErr(path))

  await deleteAsync(tmpDir, { force: true })
})
