---
description: Setup nginx load balancer for high availability
---

# Setup Load Balancer

High-availability load balancing for Vera lattice.

## Quick Setup

```bash
// turbo
# Install nginx
sudo apt update
sudo apt install -y nginx

# Enable stream module
sudo apt install -y nginx-extras
```

## Basic Load Balancer

```bash
// turbo
# Configure upstream
cat > /etc/nginx/conf.d/vera-upstream.conf << 'EOF'
upstream vera_backend {
    least_conn;
    server 10.0.1.10:8088 weight=5;
    server 10.0.1.11:8088 weight=5;
    server 10.0.1.12:8088 backup;
    
    keepalive 32;
}

server {
    listen 80;
    server_name api.vera.network;
    
    location / {
        proxy_pass http://vera_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    location /health {
        access_log off;
        return 200 "healthy\n";
    }
}
EOF

sudo nginx -t && sudo systemctl reload nginx
```

## Health Checks

```bash
// turbo
# Active health checks
cat > /etc/nginx/conf.d/vera-health.conf << 'EOF'
upstream vera_backend {
    zone vera 64k;
    
    server 10.0.1.10:8088;
    server 10.0.1.11:8088;
    
    check interval=3000 rise=2 fall=3 timeout=1000 type=http;
    check_http_send "GET /api/health HTTP/1.0\r\n\r\n";
    check_http_expect_alive http_2xx http_3xx;
}
EOF
```

## SSL/TLS Termination

```bash
// turbo
# Let's Encrypt certificate
certbot --nginx -d api.vera.network

# Or use existing certificate
cat > /etc/nginx/conf.d/vera-ssl.conf << 'EOF'
server {
    listen 443 ssl http2;
    server_name api.vera.network;
    
    ssl_certificate /etc/ssl/certs/vera.crt;
    ssl_certificate_key /etc/ssl/private/vera.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    location / {
        proxy_pass http://vera_backend;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

## Rate Limiting

```bash
// turbo
# Add rate limiting
cat >> /etc/nginx/conf.d/vera-upstream.conf << 'EOF'
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
limit_req_zone $binary_remote_addr zone=ai:10m rate=10r/s;

server {
    location /api/ai/ {
        limit_req zone=ai burst=20 nodelay;
        proxy_pass http://vera_backend;
    }
    
    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://vera_backend;
    }
}
EOF
```

## Verify Setup

```bash
// turbo
# Test configuration
sudo nginx -t

# Check upstream status
curl http://localhost/api/health

# Test load balancing
for i in {1..10}; do curl -s http://api.vera.network/api/health | grep server; done
```
