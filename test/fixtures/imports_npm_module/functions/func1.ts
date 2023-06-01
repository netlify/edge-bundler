import sayHi from 'say-hi'

export default async () => {
  const text = sayHi('Jane')

  return new Response(text)
}
