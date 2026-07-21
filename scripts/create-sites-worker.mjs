import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const workerPath = resolve('dist/server/index.js')

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

const workerSource = `const assets = ${JSON.stringify(assets)};

const cacheable = (pathname) => pathname.startsWith('/assets/');

const serveAsset = (pathname) => {
  const asset = assets[pathname];

  if (!asset) {
    return null;
  }

  const bytes = Uint8Array.from(atob(asset.body), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'content-type': asset.contentType,
      'cache-control': cacheable(pathname)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate',
    },
  });
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response('API is not available in this static deployment.', { status: 404 });
    }

    const asset = serveAsset(url.pathname === '/' ? '/index.html' : url.pathname);

    if (asset) {
      return request.method === 'HEAD' ? new Response(null, asset) : asset;
    }

    const fallback = serveAsset('/index.html');
    return request.method === 'HEAD' ? new Response(null, fallback) : fallback;
  },
};
`

await mkdir(dirname(workerPath), { recursive: true })
await writeFile(workerPath, workerSource)
