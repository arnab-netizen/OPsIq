# Module 05 backend slice

## Objective
Implement backend for Module 05 — Evidence Vault.

## Entities
- EvidenceItem
- EvidenceBundle
- FileBlob

## Required outputs
- validation schemas
- repositories or data-access layer following the existing repo pattern; do not invent a second pattern
- services
- API routes or server actions
- centralized audit events
- authorization checks for every protected write or protected read path created in this slice
- duplicate/conflict handling for every mutation path in this slice that can be double-submitted or race

## Core rule
Manual evidence is first-class, not only file uploads.

## Acceptance criteria
- Write paths validate input.
- Protected writes enforce authorization.
- Meaningful mutations emit audit events.
- Unhappy paths are handled honestly.

## Required operations
- upload file-backed evidence
- create structured/manual evidence
- create evidence bundle
- add/remove evidence from bundle
- list evidence for engagement and optionally stage
