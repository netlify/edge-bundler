import { promises as fs } from 'fs'
import { join } from 'path'

import fetch from 'node-fetch'

import type { DenoBridge } from './bridge.js'

const TYPES_URL = 'https://edge.netlify.com'

const ensureLatestTypes = async (deno: DenoBridge, customTypesURL?: string) => {
  const typesURL = customTypesURL ?? TYPES_URL

  let [localVersion, remoteVersion] = [await getLocalVersion(deno), '']

  try {
    remoteVersion = await getRemoteVersion(typesURL)
  } catch (error) {
    deno.log('Could not check latest version of types:', error)

    return
  }

  if (localVersion === remoteVersion) {
    deno.log('Local version of types is up-to-date:', localVersion)

    return
  }

  deno.log('Local version of types is outdated, updating:', localVersion)

  try {
    await deno.run(['cache', '-r', typesURL])
  } catch (error) {
    deno.log('Could not download latest types:', error)

    return
  }

  try {
    await writeVersionFile(deno, remoteVersion)
  } catch {
    // no-op
  }
}

const getLocalVersion = async (deno: DenoBridge) => {
  const versionFilePath = join(deno.cacheDirectory, 'types-version.txt')

  try {
    const version = await fs.readFile(versionFilePath, 'utf8')

    return version
  } catch {
    // no-op
  }
}

const getRemoteVersion = async (typesURL: string) => {
  const versionURL = new URL('/version.txt', typesURL)
  const res = await fetch(versionURL.toString())

  if (res.status !== 200) {
    throw new Error('Unexpected status code from version endpoint')
  }

  const version = await res.text()

  return version
}

const writeVersionFile = async (deno: DenoBridge, version: string) => {
  await deno.ensureCacheDirectory()

  const versionFilePath = join(deno.cacheDirectory, 'types-version.txt')

  await fs.writeFile(versionFilePath, version)
}

export { ensureLatestTypes }
