## Description

Service which checks Snax nodes and gives weights in `etcd` to all of them.

## Environment

`MAX_HEAD_BLOCK_LAG_TIME` = 3000

`MAX_IRREVERSIBLE_BLOCK_LAG_NUMBER` = 500

`CHECK_INTERVAL` = 15000

`TEST_PLATFORM` = p.twitter

`TABLE_LIMIT` = 100

`ETCD` = `{ "hosts": "" }`, etcd host with port

`MAX_IRREVERSIBLE_LAG_STEPS` = 3

`MIN_SUCCESS_TABLE_STEP_COUNT` = 3

`REQUEST_TIMEOUT` = 10000, in `ms`

`ECTD_SERVER_PREFIX` = `/traefik/backends/backend2/servers/`

`FULL_WEIGHT` = 100

`ZERO_WEIGHT` = 0
