import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function savePlugin() {
  const pub = path.resolve('public');
  const backupDir = path.resolve('public/backups');

  return {
    name: 'convoy-save',
    configureServer(server) {
      // Save convoys.xml + create backup
      server.middlewares.use('/api/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          try {
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const src = path.join(pub, 'convoys.xml');
            if (fs.existsSync(src)) {
              const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              fs.copyFileSync(src, path.join(backupDir, `convoys_${ts}.xml`));
            }
            fs.writeFileSync(src, body, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      // List backups
      server.middlewares.use('/api/backups', (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
        try {
          if (!fs.existsSync(backupDir)) { res.end(JSON.stringify([])); return; }
          const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.xml'))
            .sort().reverse();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
      });

      // Restore backup
      server.middlewares.use('/api/restore', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          try {
            const { file } = JSON.parse(body);
            const bp = path.join(backupDir, file);
            if (!fs.existsSync(bp)) { res.statusCode = 404; res.end('Not found'); return; }
            const dst = path.join(pub, 'convoys.xml');
            // backup current before restore
            if (fs.existsSync(dst)) {
              if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
              const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              fs.copyFileSync(dst, path.join(backupDir, `convoys_${ts}_pre-restore.xml`));
            }
            fs.copyFileSync(bp, dst);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), savePlugin()],
  server: {
    host: '127.0.0.1',
  },
});
