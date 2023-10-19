import { Config } from 'https://edge.netlify.com'

import { yell } from 'helper'
import id from 'id'

export default () => {
  return new Response(yell(Deno.env.get(id('very_secret_secret')) ?? ''))
}

export const config: Config = {
  path: '/my-function',
}
