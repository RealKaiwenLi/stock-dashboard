import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const workerPath = resolve('dist/server/index.js')

const workerSource = `const assetRequest = (request, pathname) => {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  return new Request(url, request);
};

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);

    if (response.status !== 404) {
      return response;
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(assetRequest(request, '/index.html'));
    }

    return response;
  },
};
`

await mkdir(dirname(workerPath), { recursive: true })
await writeFile(workerPath, workerSource)
