import { writeStage2 } from 'https://62ea6d76a9595200092df21f--edge.netlify.com/bundler/mod.ts'

const [payload] = Deno.args
const { basePath, destPath, functions, imports } = JSON.parse(payload)

await writeStage2({ basePath, destPath, functions, imports })
