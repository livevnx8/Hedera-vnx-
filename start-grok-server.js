#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3000;
const grokChatPath = path.join(__dirname, 'vera-grok-chat.html');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/vera-grok-chat.html') {
    fs.readFile(grokChatPath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading Vera Grok chat');
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
  console.log('🚀 Vera Grok-Style Chat Interface is running!');
  console.log('📱 Open your browser and go to: http://localhost:3000');
  console.log('💬 Experience the sleek, modern Vera interface!');
});
