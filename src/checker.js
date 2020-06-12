class CheckResult {
  constructor(success, { reason, params = [] } = {}) {
    this.success = success;
    this.reason = reason;
    this.params = params;
  }

  get isSuccessful() {
    return this.success;
  }

  get isFailed() {
    return !this.success;
  }
}

class Checker {
  constructor(
    maxHeadBlockLagTime,
    maxIrreversibleBlockLagNumber,
    tableLimit,
    testPlatform
  ) {
    this.MAX_HEAD_BLOCK_LAG_TIME = maxHeadBlockLagTime;
    this.MAX_IRREVERSIBLE_BLOCK_LAG_NUMBER = maxIrreversibleBlockLagNumber;
    this.TABLE_LIMIT = tableLimit;
    this.TEST_PLATFORM = testPlatform;
  }

  checkIrreversible(info, irreversible) {
    if (+info.last_irreversible_block_num === +irreversible.num) {
      if (info.last_irreversible_block_id === irreversible.id) {
        return new CheckResult(true);
      } else {
        return new CheckResult(false, {
          reason: `Invalid irreversible block id. Provided ${
            info.last_irreversible_block_id
          }, should be ${irreversible.id}`,
          params: { invalid: true }
        });
      }
    } else if (+info.last_irreversible_block_num < +irreversible.num) {
      return new CheckResult(false, {
        reason: `Irreversible block number less than current. Provided: ${
          info.last_irreverisble_block_num
        }, current: ${irreversible.num}.`,
        params: { less: true }
      });
    } else {
      return new CheckResult(false, {
        reason: `Irreversible block number greater than current`,
        params: { greater: true }
      });
    }
  }

  async checkInfo(node) {
    try {
      const startTime = +new Date();

      const info = await node.getInfo();

      const requestTime = +new Date() - startTime;

      const headBlockTime = new Date(info.head_block_time + "Z");

      if (startTime - +new Date(headBlockTime) > this.MAX_HEAD_BLOCK_LAG_TIME) {
        return new CheckResult(false, {
          reason: `Time between head_block_time and current time is greater than ${
            this.MAX_HEAD_BLOCK_LAG_TIME
          }. Node time: ${headBlockTime}, current time: ${new Date(
            startTime
          )}, request duration: ${requestTime}`
        });
      } else if (
        info.head_block_num - info.last_irreversible_block_num >
        this.MAX_IRREVERSIBLE_BLOCK_LAG_NUMBER
      ) {
        return new CheckResult(false, {
          reason: `Difference between last block and last irreversible block is bigger than ${
            this.MAX_IRREVERSIBLE_BLOCK_LAG_NUMBER
          }`
        });
      } else {
        return new CheckResult(true, { params: { info } });
      }
    } catch (e) {
      return new CheckResult(false, {
        reason: `Exception during check process: ${e}`,
        rejected: true
      });
    }
  }

  async checkUsers(node) {
    try {
      let positionOffset, stepModifier;
      const state = await node.getPlatformState(this.TEST_PLATFORM);
      if (state.updating) {
        if (state.round_updated_account_count > this.TABLE_LIMIT) {
          positionOffset =
            (Math.random() *
              (state.round_updated_account_count - this.TABLE_LIMIT)) |
            0;
          stepModifier = state.step_number;
        } else {
          positionOffset =
            (Math.random() *
              (state.total_user_count -
                state.round_updated_account_count -
                this.TABLE_LIMIT)) |
            0;
          stepModifier = state.step_number - 1;
        }
      } else {
        positionOffset =
          (Math.random() *
            (state.total_user_count -
              state.round_updated_account_count -
              this.TABLE_LIMIT)) |
          0;
        stepModifier = state.step_number - 1;
      }
      const position =
        (((positionOffset > 0 ? positionOffset : 0) / this.TABLE_LIMIT) | 0) *
          this.TABLE_LIMIT +
        0xffffffff * (state.updating ? stepModifier : stepModifier - 1) +
        1;
      const users = await node.getUsers(
        this.TEST_PLATFORM,
        position,
        this.TABLE_LIMIT
      );
      if (users.length === this.TABLE_LIMIT)
        return new CheckResult(true, { params: { state, users } });
      else
        return new CheckResult(false, {
          reason: `Incorrect returned table fragment length. Actual: ${
            users.length
          }, expected: ${
            this.TABLE_LIMIT
          }. Requested from position ${position}.`
        });
    } catch (e) {
      return new CheckResult(false, {
        reason: `Exception during check process: ${e}`,
        params: { rejected: true }
      });
    }
  }
}

module.exports = { Checker };
