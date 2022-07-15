import { prettyBytes } from 'alias:bytes'

export default async () => {
  const bytes = prettyBytes(1337)

  return new Response(bytes)
}
