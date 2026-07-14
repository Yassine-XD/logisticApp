# Volalte — operational shortcuts.
# Usage: make demo   (fresh stack + seed)   ·   make up   ·   make logs   ·   make down
COMPOSE ?= docker compose

.PHONY: help up build down seed reseed demo logs ps restart test test-engine clean

help:
	@echo "Volalte make targets:"
	@echo "  make up        - build + start the full stack (mongo, engine, api, web)"
	@echo "  make demo      - up + seed demo data (one command for a live demo)"
	@echo "  make seed      - seed demo data (admin/dispatcher/drivers/vehicles + mock sync)"
	@echo "  make reseed    - reset mutable data (tours/plans/demands) then reseed"
	@echo "  make logs      - tail all logs"
	@echo "  make ps        - service status"
	@echo "  make down      - stop the stack"
	@echo "  make clean     - stop + remove volumes (wipes the demo DB)"
	@echo "  make test      - run backend (jest) + engine (pytest) tests"
	@echo ""
	@echo "  Web UI:  http://localhost:$${WEB_PORT:-8090}"

up build:
	$(COMPOSE) up -d --build
	@echo "Waiting for API to become healthy..."
	@for i in $$(seq 1 40); do \
	  if $(COMPOSE) exec -T api node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then \
	    echo "API is up."; break; fi; sleep 2; done

seed:
	$(COMPOSE) exec -T api node scripts/seed-demo.js

reseed:
	$(COMPOSE) exec -T -e RESET=1 api node scripts/seed-demo.js

demo: up seed
	@echo ""
	@echo "════════════════════════════════════════════════"
	@echo "  Volalte demo is ready →  http://localhost:$${WEB_PORT:-8090}"
	@echo "  Login: admin@demo.local / volalte  (see seed output above)"
	@echo "════════════════════════════════════════════════"

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

restart:
	$(COMPOSE) restart api web

down:
	$(COMPOSE) down

clean:
	$(COMPOSE) down -v

test: test-engine
	npm test --silent || true

test-engine:
	cd ../LogisticEngine && python3 run_tests.py || true
