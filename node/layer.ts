import { cwd } from 'process'
import { pathToFileURL } from 'url'

import type { ImportMap } from './import_map.js'

const LAYER_PREFIX = `layer:`

export interface Layer {
  flag: string
  local: string
  name: string
}

// Returns a copy of an import map with entries for the layers supplied. Each
// identifier is mapped to the URL specified in the `local` property.
export const getImportMap = (originalImportMap: ImportMap, layers: Layer[]) => {
  const importMap = originalImportMap.clone()

  layers.forEach((layer) => {
    const layerImportMap = {
      baseURL: pathToFileURL(cwd()),
      imports: {
        [LAYER_PREFIX + layer.name]: layer.local,
      },
    }

    importMap.add(layerImportMap)
  })

  return importMap
}
