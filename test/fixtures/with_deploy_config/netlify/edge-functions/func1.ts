import { greet } from 'alias:helper1'

import { echo } from '../../util.ts'

export default async () => {
  const greeting = greet(echo('Jane Doe'))

  return new Response(greeting)
}
