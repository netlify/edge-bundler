import test from 'ava'

import { ImportMap } from '../src/import_map.js'

test('ImportMap: internal imports take precedence over defaults', (t) => {
  const importMap = new ImportMap([
    {
      imports: {
        'netlify:edge': 'https://some-deploy--edge-bootstrpa.netlify.app',
      },
    },
  ])
  t.deepEqual(JSON.parse(importMap.getContents()), {
    imports: {
      'netlify:edge': 'https://some-deploy--edge-bootstrpa.netlify.app',
    },
  })
})
