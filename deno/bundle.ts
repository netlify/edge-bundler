import { writeStage2 } from 'https://62f5f45f6e0f09000a925e19--edge.netlify.com/bundler/mod.ts'

const [payload] = Deno.args
const { basePath, destPath, functions, imports } = JSON.parse(payload)

await writeStage2({ basePath, destPath, functions, imports })
