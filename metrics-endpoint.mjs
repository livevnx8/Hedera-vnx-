/**
 * Vera Prometheus Metrics Endpoint
 * Exports metrics for Prometheus scraping
 */

import http from 'http';
import { monitor } from './performance-monitor.mjs';

const METRICS_PORT = 9091;

const server = http.createServer((req, res) => {
  if (req.url !== '/metrics') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const stats = monitor.getStats();
  const memory = process.memoryUsage();

  // Prometheus format metrics
  const metrics = `
# HELP vera_requests_total Total API requests
# TYPE vera_requests_total counter
vera_requests_total ${stats.requests}

# HELP vera_errors_total Total errors
# TYPE vera_errors_total counter
vera_errors_total ${stats.errors}

# HELP vera_response_time_seconds Average response time
# TYPE vera_response_time_seconds gauge
vera_response_time_seconds ${parseFloat(stats.avgResponseTime) / 1000}

# HELP vera_cache_hit_rate Cache hit rate percentage
# TYPE vera_cache_hit_rate gauge
vera_cache_hit_rate ${parseFloat(stats.cacheHitRate)}

# HELP vera_hcs_messages_total Total HCS messages
# TYPE vera_hcs_messages_total counter
vera_hcs_messages_total ${stats.hcsMessages}

# HELP process_resident_memory_bytes Memory usage
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes ${memory.rss}

# HELP process_heap_bytes Heap usage
# TYPE process_heap_bytes gauge
process_heap_bytes ${memory.heapUsed}
`.trim();

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(metrics);
});

server.listen(METRICS_PORT, () => {
  console.log(`📊 Metrics endpoint: http://localhost:${METRICS_PORT}/metrics`);
});

export { server };
