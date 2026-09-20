import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Local dev proxy: `vite dev` does not run Vercel serverless functions, so we mount
// the same analysis core (api/_core.ts) as a dev middleware at POST /api/analyze.
// The ANTHROPIC_API_KEY is read from .env.local here and passed server-side only —
// it is never exposed to the browser bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiKey = env.ANTHROPIC_API_KEY || '';

  return {
    server: { port: 3000, host: '0.0.0.0' },
    plugins: [
      react(),
      {
        name: 'pramaan-api-dev',
        configureServer(server) {
          server.middlewares.use('/api/analyze', async (req: any, res: any) => {
            const json = (status: number, obj: unknown) => {
              res.statusCode = status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(obj));
            };
            if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
            try {
              const body = await readBody(req);
              if (!body?.fileBase64) return json(400, { error: 'Missing fileBase64' });
              // ssrLoadModule transforms the TS module on the fly (Node context).
              const mod: any = await server.ssrLoadModule('/api/_core.ts');
              const report = await mod.analyze({
                fileBase64: body.fileBase64,
                mediaType: body.mediaType || 'image/png',
                fileName: body.fileName || 'document',
                apiKey,
              });
              return json(200, { report });
            } catch (e: any) {
              server.config.logger.error('[pramaan-api-dev] ' + (e?.stack || e?.message || e));
              return json(500, { error: e?.message || 'Analysis failed' });
            }
          });
        },
      },
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
  };
});

function readBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: any) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
