export default async () => {
  const greeting = greet('framework function 1')

  return new Response(greeting)
}
