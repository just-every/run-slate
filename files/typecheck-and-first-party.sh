#!/bin/bash
set -euo pipefail
pnpm typecheck
npx -y @runeditrun/rer check --profile first-party
printf 'Typecheck and first-party check: exit 0\n'
