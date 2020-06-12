const fetch = require("node-fetch");
const logger = require("./logger");
const { Checker } = require("./checker");
const { Node } = require("./node");
const { Etcd } = require("./etcd");
const {
  prop,
  partition,
  map,
  countBy,
  identity,
  values,
  reduce,
  max,
  pipe,
  sort,
  head,
  assoc,
  toPairs,
  path
} = require("ramda");

const getMaxNumberOfTheSameValues = pipe(
  countBy(identity),
  values,
  reduce(max, 0)
);

const getValueWhichHasMaxOccurencies = pipe(
  countBy(identity),
  toPairs,
  sort((a, b) => (a[1] > b[1] ? -1 : 1)),
  head,
  head
);

const sleep = time => new Promise(resolve => setTimeout(resolve, time));

const createEmptyFailRecord = () => ({
  irreversibleBlockLess: 0,
  irreversibleBlockGreater: 0,
  invalidTableSize: 0,
  invalidInfo: 0
});

const createEmptySuccessRecord = () => ({ validTableSize: 0 });

async function main() {
  const checker = new Checker(
    +(process.env.MAX_HEAD_BLOCK_LAG_TIME || 2e3),
    +(process.env.MAX_IRREVERSIBLE_BLOCK_LAG_NUMBER || 5e2),
    +(process.env.TABLE_LIMIT || 1e2),
    process.env.TEST_PLATFORM || "p.twitter"
  );
  const etcd = new Etcd(
    JSON.parse(process.env.ETCD || "{}"),
    process.env.ECTD_SERVER_PREFIX || "/traefik/backends/backend2/servers/",
    {
      zeroWeight: +(process.env.ZERO_WEIGHT || 0),
      fullWeight: +(process.env.FULL_WEIGHT || 1e2)
    }
  );
  const nodes = Object.entries(await etcd.getServers()).map(
    ([serverKey, params]) =>
      new Node({
        ...params,
        serverKey,
        rejectionTimeout: +(process.env.REQUEST_TIMEOUT || 1e4)
      })
  );

  const failResults = new Map(
    nodes.map(node => [node, createEmptyFailRecord()])
  );
  const successResults = new Map(
    nodes.map(node => [node, createEmptySuccessRecord()])
  );

  async function validationStep() {
    const results = await Promise.all(
      nodes.map(async node => ({
        node,
        userCheckResult: await checker.checkUsers(node),
        infoCheckResult: await checker.checkInfo(node)
      }))
    );

    let [validNodes, invalidNodes] = partition(
      ({ userCheckResult, infoCheckResult }) =>
        userCheckResult.isSuccessful && infoCheckResult.isSuccessful,
      results
    );

    invalidNodes.forEach(({ node, userCheckResult, infoCheckResult }) => {
      const failResult = failResults.get(node);
      failResult.invalidTableSize += userCheckResult.isFailed;
      failResult.invalidInfo += infoCheckResult.isFailed;
      failResults.set(node, failResult);
      successResults.set(node, createEmptySuccessRecord());
    });

    const irreversibleBlocks = validNodes.reduce((acc, cur) => {
      const info = cur.infoCheckResult.params.info;
      return {
        ...acc,
        [info.last_irreversible_block_num]: (
          acc[info.last_irreversible_block_num] || []
        ).concat(info.last_irreversible_block_id)
      };
    }, {});

    const sortedBlocks = sort(
      ([_, value1], [_1, value2]) =>
        getMaxNumberOfTheSameValues(value1) >
        getMaxNumberOfTheSameValues(value2)
          ? -1
          : 1,
      Object.entries(irreversibleBlocks)
    );

    if (!sortedBlocks[0]) return;

    const topIrreversibleBlock = {
      num: +sortedBlocks[0][0],
      id: getValueWhichHasMaxOccurencies(sortedBlocks[0][1])
    };

    [validNodes, moreInvalidNodes] = partition(node => {
      const irreversibleCheck = node.irreversibleCheckResult;
      if (irreversibleCheck.isFailed) {
        if (irreversibleCheck.params.invalid) return false;
        const previousResult = failResults.get(node) || createEmptyFailRecord();
        const currentResult = {
          irreversibleBlockGreater:
            previousResult.irreversibleBlockGreater +
            (irreversibleCheck.params.greater || 0),
          irreversibleBlockLess:
            previousResult.irreversibleBlockLess +
            (irreversibleCheck.params.less || 0)
        };
        if (
          currentResult.irreversibleBlockGreater >
            +(process.env.MAX_IRREVERSIBLE_LAG_STEPS || 3) ||
          currentResult.irreversibleBlockLess >
            +(process.env.MAX_IRREVERSIBLE_LAG_STEPS || 3)
        ) {
          return false;
        } else {
          failResults.set(node, currentResult);
          return true;
        }
      } else {
        failResults.set(node, createEmptyFailRecord());
        return true;
      }
    }, validNodes.map(node => assoc("irreversibleCheckResult", checker.checkIrreversible(node.infoCheckResult.params.info, topIrreversibleBlock), node)));

    logger
      .child({
        valid: validNodes.length,
        invalid: [...invalidNodes, ...moreInvalidNodes].length
      })
      .debug("Valid/invalid node counts");

    await Promise.all([
      ...validNodes.map(async ({ node }) => {
        const currentWeight = await etcd.getWeight(node);
        if (+currentWeight !== etcd.fullWeight) {
          if (failResults.get(node).invalidTableSize > 0) {
            const successResult = successResults.get(node);
            successResult.validTableSize++;

            if (
              successResult.validTableSize <=
              (+process.env.MIN_SUCCESS_TABLE_STEP_COUNT || 3)
            ) {
              successResults.set(node, successResult);
              return;
            } else {
              failResults.set(node, createEmptyFailRecord());
              successResults.set(node, createEmptySuccessRecord());
            }
          }
          logger
            .child({
              node: {
                url: node.url,
                server: node.serverKey
              }
            })
            .info("Node weight set to 100");
          return etcd.setFullWeight(node);
        }
      }),
      ...[...invalidNodes, ...moreInvalidNodes].map(
        async ({ node, ...checks }) => {
          const currentWeight = await etcd.getWeight(node);
          if (+currentWeight !== etcd.zeroWeight) {
            logger
              .child({
                node: { url: node.url, server: node.serverKey },
                failedChecks: {
                  userCheckResult: path(["userCheckResult", "reason"], checks),
                  infoCheckResult: path(["infoCheckResult", "reason"], checks),
                  irreversibleCheckResult: path(
                    ["irreversibleCheckResult", "reason"],
                    checks
                  )
                }
              })
              .info("Node weight set to 0");
            return etcd.setZeroWeight(node);
          }
        }
      )
    ]);
  }

  for (;;)
    try {
      const startTime = +new Date();

      await Promise.race([
        sleep(+(process.env.CHECK_INTERVAL || 15e3)),
        validationStep()
      ]);

      const timeDiff =
        startTime + +(process.env.CHECK_INTERVAL || 15e3) - +new Date();

      if (timeDiff > 0) await sleep(timeDiff);
    } catch (e) {
      logger
        .child({ error: e.message, stack: e.stack })
        .error("Error during validation step");
    }
}

const loop = () =>
  logger.info("Started") ||
  main().catch(
    error =>
      logger
        .child({ error: error.message, stack: error.stack })
        .error("Unexpected error") || setTimeout(loop, 1e3)
  );

loop();
