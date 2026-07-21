import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const workerPath = resolve('dist/server/index.js')
const runtimePath = resolve('scripts/sites-worker-runtime.js')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const assets = {}

async function collectAssets(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name === 'server') {
      continue
    }

    const absolutePath = join(dir, entry.name)
    const assetPath = `${prefix}/${entry.name}`

    if (entry.isDirectory()) {
      await collectAssets(absolutePath, assetPath)
      continue
    }

    const extension = entry.name.includes('.') ? entry.name.slice(entry.name.lastIndexOf('.')) : ''
    const body = await readFile(absolutePath)
    assets[assetPath] = {
      body: body.toString('base64'),
      contentType: contentTypes[extension] || 'application/octet-stream',
    }
  }
}

await collectAssets(resolve('dist'))

const runtimeSource = await readFile(runtimePath, 'utf8')
const workerSource = runtimeSource.replace('const assets = __ASSETS_MANIFEST__', `const assets = ${JSON.stringify(assets)}`)

await mkdir(dirname(workerPath), { recursive: true })
await writeFile(workerPath, workerSource)
