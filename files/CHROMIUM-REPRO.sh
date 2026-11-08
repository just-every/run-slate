#!/bin/sh
binary=$(find /ms-playwright -maxdepth 4 -type f -name chrome-headless-shell -print -quit)
[ -n "$binary" ] || exit 127
exec "$binary" "$@"
