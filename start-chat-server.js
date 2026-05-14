#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3000;
const chatInterfacePath = path.join(__dirname, 'vera-chat-interface.html');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/vera-chat-interface.html') {
    fs.readFile(chatInterfacePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading chat interface');
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`🚀 Vera Enhanced Chat Interface is running!`);
  console.log(`📱 Open your browser and go to: http://localhost:${port}`);
  console.log(`💬 Start chatting with enhanced Vera now!`);
});
