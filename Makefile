.PHONY: help build install uninstall dev test lint format clean qdrant-start qdrant-stop deps typecheck

# Default target
.DEFAULT_GOAL := help

# Colors for pretty output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m

help: ## Show this help message
	@printf "$(BLUE)mgrep$(NC) - Semantic grep-like search tool\n"
	@printf "\n"
	@printf "$(YELLOW)Usage:$(NC)\n"
	@printf "  make $(GREEN)<target>$(NC)\n"
	@printf "\n"
	@printf "$(YELLOW)Targets:$(NC)\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

deps: ## Install dependencies
	@printf "$(BLUE)Installing dependencies...$(NC)\n"
	@npm install

build: ## Build the project
	@printf "$(BLUE)Building mgrep...$(NC)\n"
	@npm run build
	@printf "$(GREEN)Build complete!$(NC)\n"

install: build ## Install mgrep globally
	@printf "$(BLUE)Installing mgrep globally...$(NC)\n"
	@npm link
	@printf "$(GREEN)mgrep installed! Run 'mgrep --help' to get started.$(NC)\n"

uninstall: ## Uninstall mgrep globally
	@printf "$(YELLOW)Uninstalling mgrep...$(NC)\n"
	@npm unlink -g mgrep 2>/dev/null || npm rm -g mgrep 2>/dev/null || true
	@printf "$(GREEN)mgrep uninstalled.$(NC)\n"

reinstall: uninstall install ## Reinstall mgrep globally

dev: ## Run in development mode (build + run)
	@npm run dev

test: ## Run tests
	@printf "$(BLUE)Running tests...$(NC)\n"
	@npm run test

lint: ## Check code with linter
	@printf "$(BLUE)Linting code...$(NC)\n"
	@npm run lint

format: ## Format code
	@printf "$(BLUE)Formatting code...$(NC)\n"
	@npm run format

typecheck: ## Run TypeScript type checking
	@printf "$(BLUE)Type checking...$(NC)\n"
	@npm run typecheck

clean: ## Clean build artifacts
	@printf "$(YELLOW)Cleaning build artifacts...$(NC)\n"
	@rm -rf dist
	@rm -f tsconfig.tsbuildinfo
	@printf "$(GREEN)Clean complete!$(NC)\n"

clean-all: clean ## Clean everything including node_modules
	@printf "$(YELLOW)Removing node_modules...$(NC)\n"
	@rm -rf node_modules
	@printf "$(GREEN)Full clean complete!$(NC)\n"

qdrant-start: ## Start Qdrant in Docker
	@printf "$(BLUE)Starting Qdrant...$(NC)\n"
	@if docker ps -q -f name=qdrant | grep -q .; then \
		printf "$(YELLOW)Qdrant is already running.$(NC)\n"; \
	else \
		docker run -d --name qdrant -p 6333:6333 -p 6334:6334 \
			-v qdrant_storage:/qdrant/storage:z \
			qdrant/qdrant; \
		printf "$(GREEN)Qdrant started on http://localhost:6333$(NC)\n"; \
	fi

qdrant-stop: ## Stop Qdrant Docker container
	@printf "$(YELLOW)Stopping Qdrant...$(NC)\n"
	@docker stop qdrant 2>/dev/null || true
	@docker rm qdrant 2>/dev/null || true
	@printf "$(GREEN)Qdrant stopped.$(NC)\n"

qdrant-restart: qdrant-stop qdrant-start ## Restart Qdrant

qdrant-logs: ## Show Qdrant logs
	@docker logs -f qdrant

version: ## Show current version
	@node -p "require('./package.json').version"

release-patch: ## Bump patch version (0.0.X)
	@npm version patch --no-git-tag-version
	@printf "$(GREEN)Version bumped to $$(node -p "require('./package.json').version")$(NC)\n"

release-minor: ## Bump minor version (0.X.0)
	@npm version minor --no-git-tag-version
	@printf "$(GREEN)Version bumped to $$(node -p "require('./package.json').version")$(NC)\n"

release-major: ## Bump major version (X.0.0)
	@npm version major --no-git-tag-version
	@printf "$(GREEN)Version bumped to $$(node -p "require('./package.json').version")$(NC)\n"
