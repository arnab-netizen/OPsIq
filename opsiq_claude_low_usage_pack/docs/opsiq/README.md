# OpsIQ Claude low-usage build pack

This repo pack is designed to reduce Claude usage by keeping prompts short and moving long-lived instructions into files.

## Core rule
Never ask Claude to implement a whole module in one run.

Every module is split into slices:
1. recovery or reset, only where needed
2. schema
3. backend
4. UI
5. tests
6. audit
7. integration
8. status update

## Execution order
Run slices in this exact order:
- module-02
- module-03
- module-04
- module-05
- module-06
- module-07
- module-08
- module-09
- module-10
- module-11
- module-12
- module-13
- module-14

## Session rule
Use a fresh Claude thread for one slice at a time.
After each slice:
- run the audit prompt
- run the integration prompt
- update status files
- clear or start a fresh thread
