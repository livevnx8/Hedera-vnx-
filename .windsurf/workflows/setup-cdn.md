---
description: Setup CDN for global content delivery
---

# Setup CDN

Global CDN for Vera static assets and API caching.

## Quick Setup

```bash
// turbo
# Cloudflare
curl -X POST https://api.cloudflare.com/client/v4/zones \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cdn.vera.network"
  }'

# Or AWS CloudFront
aws cloudfront create-distribution \
  --origin-domain-name api.vera.network \
  --default-root-object index.html
```

## Cloudflare Configuration

```bash
// turbo
# Page rules for caching
curl -X POST https://api.cloudflare.com/client/v4/zones/$ZONE_ID/pagerules \
  -H "Authorization: Bearer $CF_TOKEN" \
  -d '{
    "targets": [
      {
        "target": "url",
        "constraint": {
          "operator": "matches",
          "value": "*cdn.vera.network/static/*"
        }
      }
    ],
    "actions": [
      {
        "id": "cache_level",
        "value": "cache_everything"
      },
      {
        "id": "browser_cache_ttl",
        "value": 86400
      }
    ],
    "priority": 1,
    "status": "active"
  }'

# Argo Smart Routing
curl -X PATCH https://api.cloudflare.com/client/v4/zones/$ZONE_ID/argo/smart_routing \
  -H "Authorization: Bearer $CF_TOKEN" \
  -d '{"value": "on"}'
```

## Static Asset Optimization

```bash
// turbo
# Upload to CDN
aws s3 sync ./public/static s3://vera-cdn/static \
  --cache-control "public, max-age=31536000, immutable"

# Brotli compression
find ./public/static -type f \
  \( -name "*.js" -o -name "*.css" -o -name "*.svg" \) \
  -exec brotli -k {} \;

# Upload compressed versions
aws s3 sync ./public/static s3://vera-cdn/static \
  --content-encoding br \
  --exclude "*" \
  --include "*.br"
```

## API Caching

```bash
// turbo
# Cache API responses
curl -X POST https://api.cloudflare.com/client/v4/zones/$ZONE_ID/pagerules \
  -d '{
    "targets": [{"target": "url", "constraint": {"operator": "matches", "value": "*api.vera.network/cacheable/*"}}],
    "actions": [
      {"id": "cache_level", "value": "cache_everything"},
      {"id": "edge_cache_ttl", "value": 300}
    ]
  }'

# Cache tags for purging
export CACHE_TAGS="vera-models,vera-docs,vera-assets"
```

## Edge Functions

```bash
// turbo
# Cloudflare Workers for edge logic
cat > worker.js << 'EOF'
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Geo-routing
  const country = request.headers.get('CF-IPCountry')
  const edge = getNearestEdge(country)
  
  // A/B testing at edge
  const experiment = getExperimentGroup(request)
  url.searchParams.set('variant', experiment)
  
  const response = await fetch(url.toString(), request)
  
  // Add cache headers
  response.headers.set('X-Edge-Location', edge)
  
  return response
}
EOF

wrangler publish worker.js
```

## Purge Cache

```bash
// turbo
# Purge by URL
curl -X POST https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache \
  -H "Authorization: Bearer $CF_TOKEN" \
  -d '{"files": ["https://cdn.vera.network/models/vera-v2.pt"]}'

# Purge by tag
curl -X POST https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache \
  -d '{"tags": ["vera-models"]}'

# Or via Vera API
curl -X POST http://localhost:8088/api/cdn/purge \
  -d '{"pattern": "models/*", "immediate": true}'
```

## Performance Monitoring

```bash
// turbo
# Cache hit ratio
curl http://localhost:8088/api/cdn/analytics | jq '.{
  hitRatio: .cache.hitRatio,
  bytesServed: .bandwidth.total,
  originRequests: .requests.origin,
  edgeRequests: .requests.edge
}'

# Real-time logs
curl -s https://api.cloudflare.com/client/v4/zones/$ZONE_ID/logs/received \
  -H "Authorization: Bearer $CF_TOKEN" | jq '.[] | {edgeLocation, statusCode, cacheStatus}'
```

## Multi-CDN

```bash
// turbo
# Primary: Cloudflare
# Secondary: Fastly (failover)

# DNS failover
cat > dns-config.tf << 'EOF'
resource "cloudflare_record" "cdn" {
  zone_id = var.zone_id
  name    = "cdn"
  type    = "CNAME"
  value   = "vera.cdn.cloudflare.net"
  proxied = true
}

# Health check for failover
resource "cloudflare_healthcheck" "cdn" {
  zone_id = var.zone_id
  name    = "cdn-health"
  address = "cdn.vera.network"
  type    = "HTTPS"
  port    = 443
}
EOF
```
