export default async () => new Response('Hello from user function 4. I should run after the cache!')

export const config = () => ({
  mode: 'after_cache',
  path: '/user-func4',
})
