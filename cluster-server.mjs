/**
 * Vera Cluster Server
 * Multi-process HTTP server using all CPU cores
 */

import cluster from 'cluster';
import http from 'http';
import { availableParallelism } from 'os';

const numCPUs = availableParallelism();
const PORT = process.env.PORT || 8088;

if (cluster.isPrimary) {
  console.log(`🌸 Vera Cluster Server - Primary ${process.pid}`);
  console.log(`🔧 Forking ${numCPUs} workers...\n`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️ Worker ${worker.process.pid} died`);
    console.log('🔄 Starting new worker...');
    cluster.fork();
  });

} else {
  // Worker process
  console.log(`👷 Worker ${process.pid} started`);

  const server = http.createServer((req, res) => {
    // Enable compression
    res.setHeader('Content-Encoding', 'gzip');

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Cache headers
    res.setHeader('Cache-Control', 'public, max-age=60');

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        worker: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }));
      return;
    }

    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        workers: numCPUs,
        currentWorker: process.pid,
        cpuUsage: process.cpuUsage(),
        memory: process.memoryUsage()
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Vera Cluster Server',
      worker: process.pid,
      timestamp: Date.now()
    }));
  });

  server.listen(PORT, () => {
    console.log(`✅ Worker ${process.pid} listening on port ${PORT}`);
  });
}
