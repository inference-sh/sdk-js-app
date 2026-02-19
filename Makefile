# @inferencesh/app Makefile
#
# Usage:
#   make build     # Build the package
#   make test      # Run tests
#   make help      # Show all targets

# =============================================================================
# Setup & Build
# =============================================================================

.PHONY: install build clean

install:
	npm install

build:
	npm run build

clean:
	npm run clean

# =============================================================================
# Tests
# =============================================================================

.PHONY: test

test: build
	npm test

# =============================================================================
# Publishing
# =============================================================================

.PHONY: bump-major bump-minor bump-patch release

bump-major:
	./scripts/bump.sh major

bump-minor:
	./scripts/bump.sh minor

bump-patch:
	./scripts/bump.sh patch

# Create GitHub release (requires gh CLI and being on main branch)
release:
	./scripts/release.sh

# =============================================================================
# Helpers
# =============================================================================

.PHONY: help
help:
	@echo "@inferencesh/app Makefile"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Setup:"
	@echo "  install        Install dependencies"
	@echo "  build          Build the package"
	@echo "  clean          Clean build artifacts"
	@echo ""
	@echo "Tests:"
	@echo "  test           Build and run tests"
	@echo ""
	@echo "Publishing:"
	@echo "  bump-patch     Bump patch version, tag, push"
	@echo "  bump-minor     Bump minor version, tag, push"
	@echo "  bump-major     Bump major version, tag, push"
	@echo "  release        Create GitHub release (triggers npm publish)"

.DEFAULT_GOAL := help
