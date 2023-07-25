import { env } from 'process'

import { test, expect, vi } from 'vitest'

import { getRouteMatcher } from '../test/util.js'

import { BundleFormat } from './bundle.js'
import { Cache, FunctionConfig } from './config.js'
import { Declaration } from './declaration.js'
import { generateManifest } from './manifest.js'

test('Generates a manifest with different bundles', () => {
  const bundle1 = {
    extension: '.ext1',
    format: BundleFormat.ESZIP2,
    hash: '123456',
  }
  const bundle2 = {
    extension: '.ext2',
    format: BundleFormat.ESZIP2,
    hash: '654321',
  }
  const functions = [{ name: 'func-1', path: '/path/to/func-1.ts' }]
  const declarations: Declaration[] = [{ function: 'func-1', path: '/f1' }]
  const manifest = generateManifest({ bundles: [bundle1, bundle2], declarations, functions })

  const expectedBundles = [
    { asset: bundle1.hash + bundle1.extension, format: bundle1.format },
    { asset: bundle2.hash + bundle2.extension, format: bundle2.format },
  ]
  const expectedRoutes = [{ function: 'func-1', pattern: '^/f1/?$', excluded_patterns: [] }]

  expect(manifest.bundles).toEqual(expectedBundles)
  expect(manifest.routes).toEqual(expectedRoutes)
  expect(manifest.bundler_version).toBe(env.npm_package_version as string)
})

test('Generates a manifest with display names', () => {
  const functions = [{ name: 'func-1', path: '/path/to/func-1.ts' }]
  const declarations: Declaration[] = [{ function: 'func-1', path: '/f1/*' }]

  const internalFunctionConfig: Record<string, FunctionConfig> = {
    'func-1': {
      name: 'Display Name',
    },
  }
  const manifest = generateManifest({ bundles: [], declarations, functions, internalFunctionConfig })

  const expectedRoutes = [{ function: 'func-1', pattern: '^/f1/([^/]*)/?$', excluded_patterns: [] }]
  expect(manifest.function_config).toEqual({
    'func-1': { name: 'Display Name' },
  })
  expect(manifest.routes).toEqual(expectedRoutes)
  expect(manifest.bundler_version).toBe(env.npm_package_version as string)
})

test('Generates a manifest with a generator field', () => {
  const functions = [{ name: 'func-1', path: '/path/to/func-1.ts' }]

  const declarations: Declaration[] = [{ function: 'func-1', path: '/f1/*' }]
  const internalFunctionConfig: Record<string, FunctionConfig> = {
    'func-1': {
      generator: '@netlify/fake-plugin@1.0.0',
    },
  }
  const manifest = generateManifest({ bundles: [], declarations, functions, internalFunctionConfig })

  const expectedRoutes = [{ function: 'func-1', pattern: '^/f1/([^/]*)/?$', excluded_patterns: [] }]
  const expectedFunctionConfig = { 'func-1': { generator: '@netlify/fake-plugin@1.0.0' } }
  expect(manifest.routes).toEqual(expectedRoutes)
  expect(manifest.function_config).toEqual(expectedFunctionConfig)
})

test('Generates a manifest with excluded paths and patterns', () => {
  const functions = [
    { name: 'func-1', path: '/path/to/func-1.ts' },
    { name: 'func-2', path: '/path/to/func-2.ts' },
    { name: 'func-3', path: '/path/to/func-3.ts' },
  ]
  const declarations: Declaration[] = [
    { function: 'func-1', path: '/f1/*', excludedPath: '/f1/exclude' },
    { function: 'func-2', pattern: '^/f2/.*/?$', excludedPattern: ['^/f2/exclude$', '^/f2/exclude-as-well$'] },
    { function: 'func-3', path: '/*', excludedPath: '/**/*.html' },
  ]
  const manifest = generateManifest({ bundles: [], declarations, functions })
  const expectedRoutes = [
    { function: 'func-1', pattern: '^/f1/([^/]*)/?$', excluded_patterns: ['^/f1/exclude/?$'] },
    { function: 'func-2', pattern: '^/f2/.*/?$', excluded_patterns: ['^/f2/exclude$', '^/f2/exclude-as-well$'] },
    { function: 'func-3', pattern: '^/([^/]*)/?$', excluded_patterns: ['^/((?:[^/]*(?:/|$))*)([^/]*)\\.html/?$'] },
  ]

  expect(manifest.routes).toEqual(expectedRoutes)
  expect(manifest.function_config).toEqual({})
  expect(manifest.bundler_version).toBe(env.npm_package_version as string)

  const matcher = getRouteMatcher(manifest)

  expect(matcher('/f1/hello')?.function).toBe('func-1')
  expect(matcher('/grandparent/parent/child/grandchild.html')?.function).toBeUndefined()

  expect(matcher('/test.jpg')?.function).toBe('func-3')
  expect(matcher('/test.html')?.function).toBeUndefined()
  expect(matcher('/sub/test.html')?.function).toBeUndefined()
})

test('TOML-defined paths can be combined with ISC-defined excluded paths', () => {
  const functions = [{ name: 'func-1', path: '/path/to/func-1.ts' }]
  const declarations: Declaration[] = [{ function: 'func-1', path: '/f1/*' }]
  const userFunctionConfig: Record<string, FunctionConfig> = {
    'func-1': { excludedPath: '/f1/exclude' },
  }
  const manifest = generateManifest({ bundles: [], declarations, functions, userFunctionConfig })

  const expectedRoutes = [{ function: 'func-1', pattern: '^/f1/([^/]*)/?$', excluded_patterns: [] }]

  expect(manifest.routes).toEqual(expectedRoutes)
  expect(manifest.function_config).toEqual({
    'func-1': { excluded_patterns: ['^/f1/exclude/?$'] },
  })
  expect(manifest.bundler_version).toBe(env.npm_package_version as string)
})

test('Filters out internal in-source configurations in user created functions', () => {
  const functions = [
    { name: 'func-1', path: '/path/to/func-1.ts' },
    { name: 'func-2', path: '/path/to/func-2.ts' },
  ]
  const declarations: Declaration[] = [
    { function: 'func-1', path: '/f1/*' },
    { function: 'func-2', pattern: '^/f2/.*/?$' },
  ]
  const userFunctionConfig: Record<string, FunctionConfig> = {
    'func-1': {
      onError: '/custom-error',
      cache: Cache.Manual,
      excludedPath: '/f1/exclude',
      path: '/path/to/func-1.ts',
      name: 'User function',
      generator: 'fake-generator',
    },
  }
  const internalFunctionConfig: Record<string, FunctionConfig> = {
    'func-2': {
      onError: 'bypass',
      cache: Cache.Off,
      excludedPath: '/f2/exclude',
      path: '/path/to/func-2.ts',
      name: 'Internal function',
      generator: 'internal-generator',
    },
  }
  const manifest = generateManifest({
    bundles: [],
    declarations,
    functions,
    userFunctionConfig,
    internalFunctionConfig,
  })
  expect(manifest.function_config).toEqual({
    'func-1': {
      on_error: '/custom-error',
      excluded_patterns: ['^/f1/exclude/?$'],
    },
    'func-2': {
      on_error: 'bypass',
      cache: Cache.Off,
      name: 'Internal function',
      generator: 'internal-generator',
      excluded_patterns: ['^/f2/exclude/?$'],
    },
  })
})

test('excludedPath from ISC goes into function_config, TOML goes into routes', () => {
  const functions = [{ name: 'customisation', path: '/path/to/customisation.ts' }]
  const declarations: Declaration[] = [
    { function: 'customisation', path: '/showcases/*' },
    { function: 'customisation', path: '/checkout/*', excludedPath: ['/*/terms-and-conditions'] },
  ]
  const userFunctionConfig: Record<string, FunctionConfig> = {
    customisation: {
      excludedPath: ['/*.css', '/*.jpg'],
    },
  }
  const internalFunctionConfig: Record<string, FunctionConfig> = {}
  const manifest = generateManifest({
    bundles: [],
    declarations,
    functions,
    userFunctionConfig,
    internalFunctionConfig,
  })
  expect(manifest.routes).toEqual([
    {
      function: 'customisation',
      pattern: '^/showcases/([^/]*)/?$',
      excluded_patterns: [],
    },
    {
      function: 'customisation',
      pattern: '^/checkout/([^/]*)/?$',
      excluded_patterns: ['^/([^/]*)/terms-and-conditions/?$'],
    },
  ])
  expect(manifest.function_config).toEqual({
    customisation: {
      excluded_patterns: ['^/([^/]*)\\.css/?$', '^/([^/]*)\\.jpg/?$'],
    },
  })

  const matcher = getRouteMatcher(manifest)

  expect(matcher('/showcases/boho-style')).toBeDefined()
  expect(matcher('/checkout/address')).toBeDefined()
  expect(matcher('/checkout/terms-and-conditions')).toBeUndefined()
  expect(matcher('/checkout/scrooge-mc-duck-animation.css')).toBeUndefined()
  expect(matcher('/showcases/boho-style/expensive-chair.jpg')).toBeUndefined()
})

test('Includes failure modes in manifest', () => {
  const functions = [
    { name: 'func-1', path: '/path/to/func-1.ts' },
    { name: 'func-2', path: '/path/to/func-2.ts' },
  ]
  const declarations: Declaration[] = [
    { function: 'func-1', path: '/f1/*' },
    { function: 'func-2', pattern: '^/f2/.*/?$' },
  ]
  const userFunctionConfig: Record<string, FunctionConfig> = {
    'func-1': {
      onError: '/custom-error',
    },
  }
  const manifest = generateManifest({ bundles: [], declarations, functions, userFunctionConfig })
  expect(manifest.function_config).toEqual({
    'func-1': { on_error: '/custom-error' },
  })
})

test('Excludes functions for which there are function files but no matching config declarations', () => {
  const bundle1 = {
    extension: '.ext2',
    format: BundleFormat.ESZIP2,
    hash: '123456',
  }
  const functions = [
    { name: 'func-1', path: '/path/to/func-1.ts' },
    { name: 'func-2', path: '/path/to/func-2.ts' },
  ]
  const declarations: Declaration[] = [{ function: 'func-1', path: '/f1' }]
  const manifest = generateManifest({ bundles: [bundle1], declarations, functions })

  const expectedRoutes = [{ function: 'func-1', pattern: '^/f1/?$', excluded_patterns: [] }]

  expect(manifest.routes).toEqual(expectedRoutes)
})

test('Excludes functions for which there are config declarations but no matching function files', () => {
  const bundle1 = {
    extension: '.ext2',
    format: BundleFormat.ESZIP2,
    hash: '123456',
  }
  const functions = [{ name: 'func-2', path: '/path/to/func-2.ts' }]
  const declarations: Declaration[] = [
    { function: 'func-1', path: '/f1' },
    { function: 'func-2', path: '/f2' },
  ]
  const manifest = generateManifest({ bundles: [bundle1], declarations, functions })

  const expectedRoutes = [{ function: 'func-2', pattern: '^/f2/?$', excluded_patterns: [] }]

  expect(manifest.routes).toEqual(expectedRoutes)
})

test('Generates a manifest without bundles', () => {
  const functions = [{ name: 'func-1', path: '/path/to/func-1.ts' }]
  const declarations: Declaration[] = [{ function: 'func-1', path: '/f1' }]
  const manifest = generateManifest({ bundles: [], declarations, functions })

  const expectedRoutes = [{ function: 'func-1', pattern: '^/f1/?$', excluded_patterns: [] }]

  expect(manifest.bundles).toEqual([])
  expect(manifest.routes).toEqual(expectedRoutes)
  expect(manifest.bundler_version).toBe(env.npm_package_version as string)
})

test('Generates a manifest with pre and post-cache routes', () => {
  const bundle1 = {
    extension: '.ext1',
    format: BundleFormat.ESZIP2,
    hash: '123456',
  }
  const bundle2 = {
    extension: '.ext2',
    format: BundleFormat.ESZIP2,
    hash: '654321',
  }
  const functions = [
    { name: 'func-1', path: '/path/to/func-1.ts' },
    { name: 'func-2', path: '/path/to/func-2.ts' },
    { name: 'func-3', path: '/path/to/func-3.ts' },
  ]
  const declarations: Declaration[] = [
    { function: 'func-1', path: '/f1' },
    { function: 'func-2', cache: 'not_a_supported_value', path: '/f2' },
    { function: 'func-3', cache: 'manual', path: '/f3' },
  ]
  const manifest = generateManifest({ bundles: [bundle1, bundle2], declarations, functions })

  const expectedBundles = [
    { asset: bundle1.hash + bundle1.extension, format: bundle1.format },
    { asset: bundle2.hash + bundle2.extension, format: bundle2.format },
  ]
  const expectedPreCacheRoutes = [
    { function: 'func-1', name: undefined, pattern: '^/f1/?$', excluded_patterns: [] },
    { function: 'func-2', name: undefined, pattern: '^/f2/?$', excluded_patterns: [] },
  ]
  const expectedPostCacheRoutes = [{ function: 'func-3', name: undefined, pattern: '^/f3/?$', excluded_patterns: [] }]

  expect(manifest.bundles).toEqual(expectedBundles)
  expect(manifest.routes).toEqual(expectedPreCacheRoutes)
  expect(manifest.post_cache_routes).toEqual(expectedPostCacheRoutes)
  expect(manifest.bundler_version).toBe(env.npm_package_version as string)
})

test('Generates a manifest with layers', () => {
  const functions = [
    { name: 'func-1', path: '/path/to/func-1.ts' },
    { name: 'func-2', path: '/path/to/func-2.ts' },
  ]
  const declarations: Declaration[] = [
    { function: 'func-1', path: '/f1/*' },
    { function: 'func-2', path: '/f2/*' },
  ]
  const expectedRoutes = [
    { function: 'func-1', pattern: '^/f1/([^/]*)/?$', excluded_patterns: [] },
    { function: 'func-2', pattern: '^/f2/([^/]*)/?$', excluded_patterns: [] },
  ]
  const layers = [
    {
      name: 'onion',
      flag: 'edge_functions_onion_layer',
    },
  ]
  const manifest1 = generateManifest({ bundles: [], declarations, functions })
  const manifest2 = generateManifest({ bundles: [], declarations, functions, layers })

  expect(manifest1.routes).toEqual(expectedRoutes)
  expect(manifest1.layers).toEqual([])

  expect(manifest2.routes).toEqual(expectedRoutes)
  expect(manifest2.layers).toEqual(layers)
})

test('Shows a warning if the regular expression contains a negative lookahead', () => {
  const mockConsoleWarn = vi.fn()
  const consoleWarn = console.warn

  console.warn = mockConsoleWarn

  const functions = [{ name: 'func-1', path: '/path/to/func-1.ts' }]
  const declarations = [{ function: 'func-1', pattern: '^/\\w+(?=\\d)$' }]
  const manifest = generateManifest({
    bundles: [],
    declarations,
    functions,
  })

  console.warn = consoleWarn

  expect(manifest.routes).toEqual([{ function: 'func-1', pattern: '^/\\w+(?=\\d)$', excluded_patterns: [] }])
  expect(mockConsoleWarn).toHaveBeenCalledOnce()
  expect(mockConsoleWarn).toHaveBeenCalledWith(
    "Function 'func-1' uses an unsupported regular expression and will not be invoked: Regular expressions with lookaheads are not supported",
  )
})

test('Throws an error if the regular expression contains a negative lookahead and the `edge_functions_fail_unsupported_regex` flag is set', () => {
  const functions = [{ name: 'func-1', path: '/path/to/func-1.ts' }]
  const declarations = [{ function: 'func-1', pattern: '^/\\w+(?=\\d)$' }]

  expect(() =>
    generateManifest({
      bundles: [],
      declarations,
      featureFlags: { edge_functions_fail_unsupported_regex: true },
      functions,
    }),
  ).toThrowError(
    /^Could not parse path declaration of function 'func-1': Regular expressions with lookaheads are not supported$/,
  )
})

test('Converts named capture groups to unnamed capture groups in regular expressions', () => {
  const functions = [{ name: 'func-1', path: '/path/to/func-1.ts' }]
  const declarations = [{ function: 'func-1', pattern: '^/(?<name>\\w+)$' }]
  const manifest = generateManifest({ bundles: [], declarations, functions })

  expect(manifest.routes).toEqual([{ function: 'func-1', pattern: '^/(\\w+)$', excluded_patterns: [] }])
})
