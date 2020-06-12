const { JsonRpc } = require("@snaxfoundation/snaxjs");
const fetch = require("node-fetch");

class Node {
  constructor({ url, serverKey, weight, rejectionTimeout = 1e4 }) {
    this.rpc = new JsonRpc(url, {
      fetch
    });
    this.url = url;
    this.serverKey = serverKey;
    this.weight = weight;
    this.rejectionTimeout = rejectionTimeout;
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      const member = this[key];
      if (
        typeof member === "function" &&
        member instanceof (async () => {}).constructor
      ) {
        this[key] = async (...args) =>
          Promise.race([
            member.apply(this, args),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Timeout exceeded")),
                this.rejectionTimeout
              )
            )
          ]);
      }
    }
  }

  async getPlatformState(platform) {
    const { rows } = await this.rpc.get_table_rows({
      code: platform,
      scope: platform,
      table: "state",
      limit: 1
    });
    const data = rows[0];
    if (!data) {
      return null;
    } else {
      return data;
    }
  }

  async getUsers(platform, attentionRatePosition, limit) {
    return (await this.rpc.get_table_rows({
      code: platform,
      scope: platform,
      table: "pusers",
      index_position: 2,
      key_type: "i64",
      lower_bound: Math.max(0, attentionRatePosition),
      limit
    })).rows;
  }

  async getChainGlobal() {
    const { rows } = await this.rpc.get_table_rows({
      code: "snax",
      scope: "snax",
      table: "global",
      limit: 1
    });
    const data = rows[0];
    if (!data) {
      return null;
    } else {
      return data;
    }
  }

  async getInfo() {
    const info = await this.rpc.get_info();

    return info;
  }
}

module.exports = { Node };
