import { Config } from 'https://edge.netlify.com'

import { scream } from 'layer:test'

export default async () => new Response(scream('hello'))

export const config: Config = () => ({
  path: '/my-function',
})
