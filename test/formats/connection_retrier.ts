import test from 'ava'

import { connectionRetrier } from '../../src/formats/connection_retrier'

test('Will retry if the first attempt fails', async (t) => {
  let count = 0
  const callback = (): Promise<void> => new Promise((resolve, reject) => {
    if (count === 0) {
      reject(new Error('connection error: 500'))
      return
    }

    count += 1
    resolve()
  })

  await connectionRetrier(callback)

  t.is(count, 2)
})

