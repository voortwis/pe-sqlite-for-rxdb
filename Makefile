pnpm_pack := pnpm pack
pnpm_run := pnpm run

.PHONY: help
help:
	@echo Targets:
	@echo "    clean         Remove build/dist/release artifacts"
	@echo "    dist          Compile the code for distribution"
	@echo "    format        Format the code"
	@echo "    lint          Lint the code"
	@echo "    release       Package the code for release"
	@echo "    test          Run the tests"

.PHONY: clean dist format lint release test
clean dist format lint test:
	$(pnpm_run) $@

.PHONY: release
release: clean lint format test dist
	$(pnpm_pack)
