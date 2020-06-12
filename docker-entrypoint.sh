#!/bin/sh

if [ $# -eq 0 ]; then
  yarn start
else
  exec "$@"
fi
