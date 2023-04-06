import { test, expect, describe } from 'vitest'

import { hasPrecedingDuplicate } from './finder.js'

describe('hasPrecedingDuplicate: ', () => {
  test('returns true when there is a function with the same name and a preceding extension', () => {
    const functionMap = new Map(Object.entries({ file1: 0, file2: 2, file3: 3, file4: 1 }))

    expect(hasPrecedingDuplicate('file1.ts', functionMap)).toBe(true)
  })

  test('returns false when there is no function with the same name or a preceding extension', () => {
    const functionMap = new Map(Object.entries({ file1: 0, file2: 2, file3: 3, file4: 1 }))

    expect(hasPrecedingDuplicate('file2.js', functionMap)).toBe(false)
  })

  test('returns false when the functionMap is empty', () => {
    const functionMap = new Map()

    expect(hasPrecedingDuplicate('file2.js', functionMap)).toBe(false)
  })
})
