import { Config } from 'https://edge.netlify.com'

import { yell } from 'helper'
import id from 'id'
import identidade from '@pt-committee/identidade'

export default () => {
  return new Response(yell(identidade(id(Deno.env.get('very_secret_secret'))) ?? ''))
}

export const config: Config = {
  path: '/my-function',
}
