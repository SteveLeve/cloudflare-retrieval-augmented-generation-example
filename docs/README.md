# Documentation Directory

This directory contains all project documentation following established standards and best practices.

## Directory Structure

```
docs/
├── README.md                      # This file - documentation guide
├── CLAUDE.md                      # Claude Code agent documentation instructions
├── AGENTS.md                      # General purpose agent instructions
├── DEVELOPMENT_JOURNAL.md         # Ongoing development log
├── CODE_REVIEW_RESPONSE_PLAN.md   # Code review handling procedures
├── decisions/                     # Architecture Decision Records (ADRs)
│   └── NNN-title.md              # Individual ADR files
├── features/                      # Feature-specific documentation
│   ├── chat-feature-validation.md    # Chat feature implementation details
│   └── chat-feature-quickstart.md    # Chat feature quick start guide
└── specs/                         # Feature specifications (future)
    └── feature-name.md           # Detailed feature specifications
```

## Documentation Standards

### 1. Architecture Decision Records (ADRs)

ADRs document significant architectural and design decisions. Use the template in `decisions/TEMPLATE.md`.

**When to Create an ADR:**
- Choosing between technical alternatives (databases, frameworks, libraries)
- Significant changes to system architecture
- Establishing new patterns or conventions
- Trade-off decisions that impact future development

**Naming Convention:** `NNN-descriptive-title.md` where NNN is a zero-padded number (001, 002, etc.)

**Process:**
1. Copy `decisions/TEMPLATE.md` to `decisions/NNN-your-title.md`
2. Fill out all sections completely
3. Set status to "Proposed" initially
4. Update status to "Accepted" after team review
5. Reference ADR number in commits and pull requests

### 2. Development Journal

The development journal (`DEVELOPMENT_JOURNAL.md`) is a chronological log of development sessions.

**When to Update:**
- Start of each development session
- After completing major milestones
- When making significant decisions
- Recording challenges and solutions

**Entry Format:**
```markdown
## YYYY-MM-DD: Brief Session Title

### Objective
[What you're trying to achieve]

### Progress Log
[Chronological updates during the session]

### Decisions Made
[Reference ADRs or inline decisions]

### Challenges & Solutions
[Problems encountered and how they were solved]

### Deliverables
[What was completed: commits, files, features]

### Status
[Complete/In Progress/Blocked]
```

### 3. Feature Documentation

For major features, create documentation in `features/` directory.

**Types:**
- **Quick Start Guides**: User-facing guide for feature usage (e.g., `chat-feature-quickstart.md`)
- **Validation/Technical Documentation**: Implementation details and architecture (e.g., `chat-feature-validation.md`)
- **Specifications**: For complex features, optionally create detailed specs in `specs/` directory

**Contents:**
- User stories and use cases
- Acceptance criteria
- API contracts and interfaces
- Database schema changes
- UI/UX mockups (if applicable)
- Testing strategy
- Rollout plan

### 4. Code Review Documentation

Document code review processes and response plans in dedicated files like `CODE_REVIEW_RESPONSE_PLAN.md`.

## Documentation Principles

### Clarity
- Write for future readers (including future you)
- Use clear, concise language
- Avoid jargon unless well-defined
- Include examples where helpful

### Completeness
- Document the "why" not just the "what"
- Include context and alternatives considered
- Reference related decisions and documents
- Track status and dates

### Maintainability
- Use consistent formatting
- Keep documents up-to-date
- Mark outdated decisions as "Superseded"
- Link related documents

### Searchability
- Use descriptive titles
- Include relevant keywords
- Maintain this README's index
- Use consistent terminology

## Agent-Specific Documentation

### CLAUDE.md
Contains instructions for Claude Code when working in this repository:
- Project architecture overview
- Development commands and workflows
- Configuration guidelines
- Testing procedures
- Deployment instructions

### AGENTS.md
General purpose agent instructions for any AI assistant:
- Project context and goals
- Code style and conventions
- Contribution guidelines
- Common tasks and workflows

## Best Practices

### Version Control
- Commit documentation changes with related code changes
- Use descriptive commit messages that reference docs
- Include ADR numbers in relevant commits

### Review Process
- Documentation changes should be reviewed like code
- Validate examples and commands before committing
- Keep docs in sync with code changes

### Templates
Use provided templates for consistency:
- `decisions/TEMPLATE.md` for ADRs
- Follow existing examples for other document types

## Quick Reference

### Creating an ADR
```bash
# Find next number
ls docs/decisions/*.md | wc -l

# Copy template
cp docs/decisions/TEMPLATE.md docs/decisions/00X-your-title.md

# Edit and commit
git add docs/decisions/00X-your-title.md
git commit -m "docs: Add ADR 00X for [decision]"
```

### Updating Development Journal
```bash
# Open journal
vim docs/DEVELOPMENT_JOURNAL.md

# Add new entry at the top with today's date
# Follow the entry format above

# Commit
git add docs/DEVELOPMENT_JOURNAL.md
git commit -m "docs: Update development journal for [session]"
```

### Documentation Checklist
Before committing code changes:
- [ ] Updated relevant CLAUDE.md sections if architecture changed
- [ ] Created ADR if significant decision was made
- [ ] Added development journal entry for the session
- [ ] Updated README.md if new features added
- [ ] Verified all code examples in docs work

## Resources

### Markdown Style Guide
- Use ATX-style headers (# ## ###)
- Fenced code blocks with language identifiers
- Consistent list formatting (- for bullets, 1. for numbered)
- Blank lines around code blocks and headers

### ADR Resources
- [ADR Tools](https://adr.github.io/)
- [Template Repository](https://github.com/joelparkerhenderson/architecture-decision-record)

### Documentation Tools
- [Mermaid](https://mermaid.js.org/) for diagrams
- [GitHub Markdown](https://docs.github.com/en/get-started/writing-on-github) syntax reference

## Maintenance

This README should be updated when:
- Adding new documentation types
- Changing documentation processes
- Updating directory structure
- Adding new templates

**Last Updated**: 2025-11-21
**Maintained By**: Development Team
