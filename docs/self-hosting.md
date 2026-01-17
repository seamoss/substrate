# Self-Hosting Guide

Deploy Substrate on your own infrastructure using Docker.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 1GB RAM minimum
- 10GB disk space

## Quick Start

```bash
# Clone the repository
git clone <repo-url> substrate
cd substrate/api

# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps
```

Services will be available at:
- **API**: http://localhost:3000
- **SurrealDB**: http://localhost:8000

## Docker Compose Configuration

### Default Configuration

```yaml
# api/docker-compose.yml
services:
  surrealdb:
    image: surrealdb/surrealdb:latest
    container_name: substrate-db
    command: start --user root --pass root --bind 0.0.0.0:8000 memory
    ports:
      - "8000:8000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "/surreal", "isready", "--conn", "http://localhost:8000"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: substrate-api
    ports:
      - "3000:3000"
    environment:
      - SURREAL_URL=http://surrealdb:8000
      - SURREAL_USER=root
      - SURREAL_PASS=root
      - SURREAL_NS=substrate
      - SURREAL_DB=main
      - PORT=3000
    depends_on:
      surrealdb:
        condition: service_healthy
    restart: unless-stopped
```

### Production Configuration

For production deployments, create `api/docker-compose.prod.yml`:

```yaml
services:
  surrealdb:
    image: surrealdb/surrealdb:latest
    container_name: substrate-db
    command: start --user ${SURREAL_USER} --pass ${SURREAL_PASS} --bind 0.0.0.0:8000 file:/data/database.db
    volumes:
      - surreal_data:/data
    ports:
      - "127.0.0.1:8000:8000"  # Only localhost
    restart: always
    healthcheck:
      test: ["CMD", "/surreal", "isready", "--conn", "http://localhost:8000"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: substrate-api
    ports:
      - "127.0.0.1:3000:3000"  # Only localhost, use reverse proxy
    environment:
      - SURREAL_URL=http://surrealdb:8000
      - SURREAL_USER=${SURREAL_USER}
      - SURREAL_PASS=${SURREAL_PASS}
      - SURREAL_NS=substrate
      - SURREAL_DB=main
      - PORT=3000
      - NODE_ENV=production
    depends_on:
      surrealdb:
        condition: service_healthy
    restart: always

volumes:
  surreal_data:
```

## Environment Variables

Create an `api/.env` file:

```bash
# Database credentials
SURREAL_USER=admin
SURREAL_PASS=your-secure-password-here
```

## Persistent Storage

### Memory Mode (Default)

Data is stored in memory and lost on restart. Good for development.

```yaml
command: start --user root --pass root --bind 0.0.0.0:8000 memory
```

### File Mode (Recommended for Production)

Data persists to disk:

```yaml
command: start --user root --pass root --bind 0.0.0.0:8000 file:/data/database.db
volumes:
  - surreal_data:/data
```

### Backup

```bash
# Stop services
docker-compose stop

# Backup volume
docker run --rm -v substrate_surreal_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/surreal-backup-$(date +%Y%m%d).tar.gz /data

# Restart services
docker-compose start
```

### Restore

```bash
docker-compose stop

docker run --rm -v substrate_surreal_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/surreal-backup-YYYYMMDD.tar.gz -C /

docker-compose start
```

## Reverse Proxy Setup

### Nginx

```nginx
upstream substrate_api {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name api.substrate.example.com;

    ssl_certificate /etc/letsencrypt/live/api.substrate.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.substrate.example.com/privkey.pem;

    location / {
        proxy_pass http://substrate_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Caddy

```
api.substrate.example.com {
    reverse_proxy localhost:3000
}
```

### Traefik

```yaml
# Add to docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.substrate.rule=Host(`api.substrate.example.com`)"
  - "traefik.http.routers.substrate.tls=true"
  - "traefik.http.routers.substrate.tls.certresolver=letsencrypt"
```

## CLI Configuration

By default, the CLI connects to the hosted Substrate service at `https://substrate.heavystack.io`. To use your self-hosted instance instead, set the `SUBSTRATE_API_URL` environment variable:

```bash
export SUBSTRATE_API_URL=https://api.substrate.example.com
```

Or add to shell profile for persistence:
```bash
echo 'export SUBSTRATE_API_URL=https://api.substrate.example.com' >> ~/.bashrc
```

Then authenticate with your self-hosted instance:
```bash
substrate auth init
```

## Monitoring

### Health Check

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"substrate-api","timestamp":"...","database":{"status":"connected","latency_ms":5}}
```

The health endpoint validates database connectivity and returns latency. A `503` status with `"status":"degraded"` indicates database issues.

### Container Logs

```bash
# All logs
docker-compose logs -f

# API only
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail 100 api
```

### Resource Usage

```bash
docker stats substrate-api substrate-db
```

## Scaling

### Horizontal API Scaling

The API server is stateless and can be scaled horizontally:

```yaml
api:
  deploy:
    replicas: 3
```

With a load balancer in front.

### Database Scaling

SurrealDB supports clustering for high availability. See [SurrealDB documentation](https://surrealdb.com/docs).

## Security Checklist

- [ ] Change default database credentials
- [ ] Use file storage mode for persistence
- [ ] Enable HTTPS via reverse proxy
- [ ] Restrict database port to localhost
- [ ] Set up firewall rules
- [ ] Enable Docker security features
- [ ] Regular backups
- [ ] Monitor logs for anomalies

## Troubleshooting

### API won't start

Check database connectivity:
```bash
docker-compose logs api
# Look for "Connected to SurrealDB"
```

Verify database is healthy:
```bash
docker-compose ps
# surrealdb should show "healthy"
```

### Database connection refused

Ensure SurrealDB is running and healthy:
```bash
docker-compose up -d surrealdb
docker-compose logs surrealdb
```

### Schema errors

Reset the database (development only):
```bash
docker-compose down -v
docker-compose up -d
```

### Permission denied

Check file permissions on volumes:
```bash
sudo chown -R 1000:1000 ./data
```

## Updates

### Update API

```bash
cd substrate
git pull
docker-compose build api
docker-compose up -d api
```

### Update SurrealDB

```bash
docker-compose pull surrealdb
docker-compose up -d surrealdb
```

### Full Update

```bash
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

## Uninstall

```bash
# Stop and remove containers
docker-compose down

# Also remove volumes (deletes all data!)
docker-compose down -v

# Remove images
docker rmi substrate-api surrealdb/surrealdb
```
