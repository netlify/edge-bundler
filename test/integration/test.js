import assert from 'assert'
import { createRequire } from 'module'
import { join, resolve } from 'path'
import process from 'process'
import { fileURLToPath, pathToFileURL } from 'url'

import del from 'del'
import { execa } from 'execa'
import tar from 'tar'
import tmp from 'tmp-promise'

const require = createRequire(import.meta.url)
const functionsDir = resolve(fileURLToPath(import.meta.url), '..', 'functions')

const pathsToCleanup = new Set()

const installPackage = async () => {
  const { path } = await tmp.dir()
  const npmPack = execa('npm', ['pack', '--json'])

  npmPack.stdout.pipe(process.stdout)
  npmPack.stderr.pipe(process.stderr)

  const { stdout } = await npmPack
  const match = stdout.match(/"filename": "(.*)",/)

  if (match === null) {
    throw new Error('Failed to parse output of `npm pack`')
  }

  const filename = join(process.cwd(), match[1])

  // eslint-disable-next-line id-length
  await tar.x({ C: path, file: filename, strip: 1 })

  pathsToCleanup.add(path)
  pathsToCleanup.add(filename)

  return path
}

const bundleFunction = async (bundlerDir) => {
  const npmInstall = execa('npm', ['--prefix', bundlerDir, 'install'])

  npmInstall.stdout.pipe(process.stdout)
  npmInstall.stderr.pipe(process.stderr)

  await npmInstall

  const bundlerPath = require.resolve(bundlerDir)
  const bundlerURL = pathToFileURL(bundlerPath)
  const { bundle } = await import(bundlerURL)
  const { path: destPath } = await tmp.dir()

  pathsToCleanup.add(destPath)

  return await bundle([functionsDir], destPath, [{ function: 'func1', path: '/func1' }])
}

const runAssertions = ({ functions }) => {
  assert.equal(functions.length, 1)
  assert.equal(functions[0].name, 'func1')
  assert.equal(functions[0].path, join(functionsDir, 'func1.ts'))
}

const cleanup = async () => {
  const directories = [...pathsToCleanup]

  await del(directories, { force: true })
}

installPackage()
  .then(bundleFunction)
  .then(runAssertions)
  .then(cleanup)
  // eslint-disable-next-line promise/prefer-await-to-callbacks
  .catch((error) => {
    console.error(error)

    throw error
  })
