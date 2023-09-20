import parent1 from 'parent-1'
import parent2 from 'parent-2'
import parent3 from './lib/util.ts'
import { echo } from 'alias:helper'

export default async () => {
  const text = [parent1('JavaScript'), parent2('APIs'), parent3('Markup')].join(', ')

  return new Response(echo(text))
}
