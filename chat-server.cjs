const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8090;
const HTML_FILE = path.join(__dirname, 'public/vera-chat.html');

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Proxy API requests to main server
  if (parsedUrl.pathname.startsWith('/api/')) {
    const options = {
      hostname: 'localhost',
      port: 8088,
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: req.method,
      headers: {
        ...req.headers,
        host: 'localhost:8080'
      }
    };
    
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Main server not available', details: err.message }));
    });
    
    req.pipe(proxyReq);
    return;
  }
  
  // Serve chat UI
  fs.readFile(HTML_FILE, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading chat interface: ' + err.message);
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Vera Oasis Chat running at http://localhost:${PORT}`);
  console.log('🌐 Open your browser to access the interface');
  console.log('📡 API proxying to http://localhost:8080');
});
