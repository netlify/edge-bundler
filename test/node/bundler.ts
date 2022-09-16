import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import process from 'process'
import { fileURLToPath, pathToFileURL } from 'url'

import test from 'ava'
import tmp from 'tmp-promise'

import { BundleError } from '../../node/bundle_error.js'
import { bundle, BundleOptions } from '../../node/bundler.js'

const url = new URL(import.meta.url)
const dirname = fileURLToPath(url)
const fixturesDir = resolve(dirname, '..', 'fixtures')

test('Produces a JavaScript bundle and a manifest file', async (t) => {
  const sourceDirectory = resolve(fixturesDir, 'project_1', 'functions')
  const tmpDir = await tmp.dir()
  const declarations = [
    {
      function: 'func1',
      path: '/func1',
    },
  ]
  const result = await bundle([sourceDirectory], tmpDir.path, declarations, {
    basePath: fixturesDir,
    importMaps: [
      {
        baseURL: pathToFileURL(join(fixturesDir, 'import-map.json')),
        imports: {
          'alias:helper': pathToFileURL(join(fixturesDir, 'helper.ts')).toString(),
        },
      },
    ],
  })
  const generatedFiles = await fs.readdir(tmpDir.path)

  t.is(result.functions.length, 1)
  t.is(generatedFiles.length, 2)

  // eslint-disable-next-line unicorn/prefer-json-parse-buffer
  const manifestFile = await fs.readFile(resolve(tmpDir.path, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestFile)
  const { bundles } = manifest

  t.is(bundles.length, 1)
  t.is(bundles[0].format, 'js')
  t.true(generatedFiles.includes(bundles[0].asset))
  t.deepEqual(result.manifest, manifest)

  await fs.rmdir(tmpDir.path, { recursive: true })
})

test('Produces only a ESZIP bundle when the `edge_functions_produce_eszip` feature flag is set', async (t) => {
  const sourceDirectory = resolve(fixturesDir, 'project_1', 'functions')
  const tmpDir = await tmp.dir()
  const declarations = [
    {
      function: 'func1',
      path: '/func1',
    },
  ]
  const result = await bundle([sourceDirectory], tmpDir.path, declarations, {
    basePath: fixturesDir,
    featureFlags: {
      edge_functions_produce_eszip: true,
    },
    importMaps: [
      {
        baseURL: pathToFileURL(join(fixturesDir, 'import-map.json')),
        imports: {
          'alias:helper': pathToFileURL(join(fixturesDir, 'helper.ts')).toString(),
        },
      },
    ],
  })
  const generatedFiles = await fs.readdir(tmpDir.path)

  t.is(result.functions.length, 1)
  t.is(generatedFiles.length, 2)

  // eslint-disable-next-line unicorn/prefer-json-parse-buffer
  const manifestFile = await fs.readFile(resolve(tmpDir.path, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestFile)
  const { bundles } = manifest

  t.is(bundles.length, 1)
  t.is(bundles[0].format, 'eszip2')
  t.true(generatedFiles.includes(bundles[0].asset))

  await fs.rmdir(tmpDir.path, { recursive: true })
})

test('Adds a custom error property to user errors during bundling', async (t) => {
  const sourceDirectory = resolve(fixturesDir, 'invalid_functions', 'functions')
  const tmpDir = await tmp.dir()
  const declarations = [
    {
      function: 'func1',
      path: '/func1',
    },
  ]

  try {
    await bundle([sourceDirectory], tmpDir.path, declarations)

    t.fail('Expected bundling to throw')
  } catch (error: unknown) {
    if (error instanceof BundleError) {
      t.deepEqual(error.customErrorInfo, {
        location: {
          format: 'javascript',
          runtime: 'deno',
        },
        type: 'functionsBundling',
      })
    } else {
      t.fail('Expected custom error')
    }
  } finally {
    await fs.rmdir(tmpDir.path, { recursive: true })
  }
})

test('Does not add a custom error property to system errors during bundling', async (t) => {
  try {
    // @ts-expect-error Sending bad input to `bundle` to force a system error.
    await bundle([123, 321], tmpDir.path, declarations)

    t.fail('Expected bundling to throw')
  } catch (error: unknown) {
    t.false(error instanceof BundleError)
  }
})

test('Uses the cache directory as the `DENO_DIR` value if the `edge_functions_cache_deno_dir` feature flag is set', async (t) => {
  const sourceDirectory = resolve(fixturesDir, 'project_1', 'functions')
  const outDir = await tmp.dir()
  const cacheDir = await tmp.dir()
  const declarations = [
    {
      function: 'func1',
      path: '/func1',
    },
  ]
  const options: BundleOptions = {
    basePath: fixturesDir,
    cacheDirectory: cacheDir.path,
    importMaps: [
      {
        baseURL: pathToFileURL(join(fixturesDir, 'import-map.json')),
        imports: {
          'alias:helper': pathToFileURL(join(fixturesDir, 'helper.ts')).toString(),
        },
      },
    ],
  }

  // Run #1, feature flag off: The directory should not be populated.
  const result1 = await bundle([sourceDirectory], outDir.path, declarations, options)
  const outFiles1 = await fs.readdir(outDir.path)

  t.is(result1.functions.length, 1)
  t.is(outFiles1.length, 2)

  await t.throwsAsync(() => fs.readdir(join(cacheDir.path, 'deno_dir')))

  // Run #2, feature flag on: The directory should be populated.
  const result2 = await bundle([sourceDirectory], outDir.path, declarations, {
    ...options,
    featureFlags: {
      edge_functions_cache_deno_dir: true,
    },
  })
  const outFiles2 = await fs.readdir(outDir.path)

  t.is(result2.functions.length, 1)
  t.is(outFiles2.length, 2)

  const denoDir2 = await fs.readdir(join(cacheDir.path, 'deno_dir'))

  t.true(denoDir2.includes('deps'))
  t.true(denoDir2.includes('gen'))

  await fs.rmdir(outDir.path, { recursive: true })
})

test('Supports import maps with relative paths', async (t) => {
  const sourceDirectory = resolve(fixturesDir, 'project_1', 'functions')
  const tmpDir = await tmp.dir()
  const declarations = [
    {
      function: 'func1',
      path: '/func1',
    },
  ]
  const result = await bundle([sourceDirectory], tmpDir.path, declarations, {
    basePath: fixturesDir,
    featureFlags: {
      edge_functions_produce_eszip: true,
    },
    importMaps: [
      {
        baseURL: pathToFileURL(join(fixturesDir, 'import-map.json')),
        imports: {
          'alias:helper': './helper.ts',
        },
      },
    ],
  })
  const generatedFiles = await fs.readdir(tmpDir.path)

  t.is(result.functions.length, 1)
  t.is(generatedFiles.length, 2)

  // eslint-disable-next-line unicorn/prefer-json-parse-buffer
  const manifestFile = await fs.readFile(resolve(tmpDir.path, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestFile)
  const { bundles } = manifest

  t.is(bundles.length, 1)
  t.is(bundles[0].format, 'eszip2')
  t.true(generatedFiles.includes(bundles[0].asset))

  await fs.rmdir(tmpDir.path, { recursive: true })
})

test.serial('Ignores any user-defined `deno.json` files', async (t) => {
  const fixtureDir = join(fixturesDir, 'project_1')
  const tmpDir = await tmp.dir()
  const declarations = [
    {
      function: 'func1',
      path: '/func1',
    },
  ]

  // Creating an import map file that rewires the URL of the Deno registry to
  // an invalid location.
  const importMapFile = await tmp.file()
  const importMap = {
    imports: {
      'https://deno.land/': 'https://black.hole/',
    },
  }

  await fs.writeFile(importMapFile.path, JSON.stringify(importMap))

  // Deno configuration files need to be in the current working directory.
  // There's not a great way for us to set the working directory of the `deno`
  // process that we'll run, so our best bet is to write the file to whatever
  // is the current working directory now and then clean it up.
  const denoConfigPath = join(process.cwd(), 'deno.json')
  const denoConfig = {
    importMap: importMapFile.path,
  }

  // Let's ensure we're not overwriting a `deno.json` file that happens to be
  // in the current working directory.
  await t.throwsAsync(
    () => fs.access(denoConfigPath),
    { code: 'ENOENT' },
    `The file at '${denoConfigPath} would be overwritten by this test. Please move the file to a different location and try again.'`,
  )

  await fs.writeFile(denoConfigPath, JSON.stringify(denoConfig))

  await t.notThrowsAsync(() =>
    bundle([join(fixtureDir, 'functions')], tmpDir.path, declarations, {
      basePath: fixturesDir,
      featureFlags: {
        edge_functions_produce_eszip: true,
      },
      importMaps: [
        {
          baseURL: pathToFileURL(join(fixturesDir, 'import-map.json')),
          imports: {
            'alias:helper': pathToFileURL(join(fixturesDir, 'helper.ts')).toString(),
          },
        },
      ],
    }),
  )

  await fs.rmdir(tmpDir.path, { recursive: true })
  await fs.rm(denoConfigPath, { force: true })
  await fs.rm(importMapFile.path)
})
