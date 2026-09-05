# @inferencesh/app Makefile
#
# Usage:
#   make build     # Build the package
#   make test      # Run tests
#   make help      # Show all targets

# =============================================================================
# Setup & Build
# =============================================================================

.PHONY: install build clean relock

install:
	pnpm install

build:
	pnpm run build

clean:
	pnpm run clean

# This package's pnpm-lock.yaml is for standalone clones (CI, publish). Inside the
# monorepo a plain `pnpm install` updates the workspace's shared lock instead, so
# run this after any dependency change or the next release fails on lockfile drift.
relock:
	pnpm install --lockfile-only --ignore-workspace --ignore-scripts

# =============================================================================
# Tests
# =============================================================================

.PHONY: test

test: build
	pnpm test

# =============================================================================
# Version & Release
# =============================================================================

.PHONY: patch minor major release

patch:
	@./scripts/bump.sh patch

minor:
	@./scripts/bump.sh minor

major:
	@./scripts/bump.sh major

# Push and create GitHub release (triggers npm publish via CI)
release:
	@VERSION=$$(git describe --tags --abbrev=0) && \
	git push origin HEAD "$$VERSION" && \
	gh release create "$$VERSION" --title "$$VERSION" --generate-notes && \
	echo "Released $$VERSION"

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
	@echo "Release:"
	@echo "  patch          Bump patch version"
	@echo "  minor          Bump minor version"
	@echo "  major          Bump major version"
	@echo "  release        Create GitHub release (triggers npm publish)"

.DEFAULT_GOAL := help

main:
	git push origin dev:main
