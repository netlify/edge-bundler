import parent1 from 'parent-1'
import parent3 from './lib/util.ts'
import { echo, parent2 } from 'alias:helper'
import { HTMLRewriter } from 'html-rewriter'
import withSubpathIndex from "with-subpath"
import withSubpathFoo from "with-subpath/foo"
import assert from 'node:assert'

assert(withSubpathIndex === "with-subpath/index")
assert(withSubpathFoo === "with-subpath/foo")

await Promise.resolve()

new HTMLRewriter()

export default async () => {
  const text = [parent1('JavaScript'), parent2('APIs'), parent3('Markup')].join(', ')

  return new Response(echo(text))
}
