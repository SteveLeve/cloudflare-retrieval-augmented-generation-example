# Agents Guide

This repository now includes formal specification documents under `docs/spec/` enabling agentic coding systems (e.g. AI development agents) to autonomously implement, refactor, or validate the application.

## Spec Location
- Core application spec: `docs/spec/APP_SPEC.md`
- Chat workflow spec: `docs/spec/CHAT_WORKFLOW_SPEC.md`

## Expected Agent Behavior
1. Read `APP_SPEC.md` and (if chat features are used) `CHAT_WORKFLOW_SPEC.md` before making changes.
2. Preserve all invariants listed (no duplicate user messages, validated citations, proper timestamp sourcing).
3. Respect feature flags; do not hard-enable absent flags.
4. Use retry and guard logic exactly as defined.
5. Update specs first when introducing new cross-cutting features (security, resilience, performance) before code changes.
6. Avoid modifying existing working code outside the bounded changes required by updated specifications.
7. Record architectural changes as ADRs in `docs/decisions/` when not purely implementing existing specs.

## Regeneration Expectations
An autonomous agent should be able to:
- Recreate data schema, ingestion workflow, retrieval flow, chat memory, and citation validation from specs alone.
- Produce deterministic prompt formatting and post-processing rules.
- Implement resilience (retries, circuit breaker) and rate limiting per spec.

## Adding New Specs
When extending functionality (e.g. streaming, auth), create a new spec file under `docs/spec/<FEATURE>_SPEC.md` and reference it here.

## Validation
Agents should create or update tests to satisfy the Testing Criteria sections in existing spec documents. New behavior requires corresponding criteria.

