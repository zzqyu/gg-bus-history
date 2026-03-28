COMPOSE_DEV = docker-compose -f docker-compose.dev.yml
COMPOSE_PROD = docker-compose -f docker-compose.prod.yml

.PHONY: help dev-up dev-down dev-logs prod-up prod-down prod-logs extract-cert web-build web-install web-clean

help:
	@echo "Make targets:"
	@echo "  dev-up       - start development stack (Caddy dev, uses Caddyfile.dev)"
	@echo "  dev-down     - stop development stack"
	@echo "  dev-logs     - follow dev container logs (caddy, web, api)"
	@echo "  prod-up      - start production stack (Caddy prod, uses Caddyfile.prod)"
	@echo "  prod-down    - stop production stack"
	@echo "  prod-logs    - follow production container logs (caddy, web, api)"
	@echo "  extract-cert - extract Caddy internal CA root cert from dev volume"

dev-up:
	$(COMPOSE_DEV) up --build -d

dev-down:
	$(COMPOSE_DEV) down

dev-logs:
	$(COMPOSE_DEV) logs -f caddy web api

prod-up:
	$(COMPOSE_PROD) up --build -d

prod-down:
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f caddy web api

# extract caddy root cert from dev volume and write to caddy-root.crt
extract-cert:
	docker run --rm -v bus_caddy_data:/data alpine cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt || (echo "failed to extract cert, check volume name"; exit 1)

# Build the Next.js production artifacts using the production compose web service
# mounts the repository into the container so the build runs against current source
web-build:
	$(COMPOSE_PROD) run --rm --no-deps web sh -c "npm ci --no-audit --no-fund && npm run build"

# Install Node dependencies into the mounted workspace (use when adding packages)
web-install:
	$(COMPOSE_PROD) run --rm --no-deps web sh -c "npm ci --no-audit --no-fund"

# Clean build artifacts and node modules from the workspace
web-clean:
	rm -rf .next node_modules || true
