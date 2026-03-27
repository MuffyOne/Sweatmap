import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function xertDevProxy(): Plugin {
  return {
    name: 'xert-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/xert-token', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const json = JSON.parse(Buffer.concat(chunks).toString());

        const upstream = await fetch('https://www.xertonline.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + Buffer.from('xert_public:xert_public').toString('base64'),
          },
          body: new URLSearchParams(json).toString(),
        });

        const data = await upstream.text();
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(data);
      });

      server.middlewares.use('/api/xert-training', async (req, res) => {
        const upstream = await fetch('https://www.xertonline.com/oauth/training_info', {
          headers: { Authorization: req.headers.authorization ?? '' },
        });

        const data = await upstream.text();
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(data);
      });

      server.middlewares.use('/api/xert-workout', async (req, res) => {
        // URL: /api/xert-workout/<id>
        const id = (req.url ?? '').replace(/^\//, '');
        if (!id) { res.writeHead(400); res.end('{"error":"Missing id"}'); return; }

        const upstream = await fetch(`https://www.xertonline.com/oauth/workout/${encodeURIComponent(id)}`, {
          headers: { Authorization: req.headers.authorization ?? '' },
        });

        const data = await upstream.text();
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const useMock = mode === 'development' && process.env.VITE_MOCK_DATA === 'true';

  return {
    plugins: [react(), xertDevProxy()],
    resolve: {
      alias: useMock
        ? [{ find: /\/api\/strava$/, replacement: path.resolve(__dirname, 'src/api/strava.mock') }]
        : [],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            recharts: ['recharts'],
            'date-fns': ['date-fns'],
          },
        },
      },
    },
  };
})
