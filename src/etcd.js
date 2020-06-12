const {
  reduceBy,
  last,
  split,
  pipe,
  tap,
  head,
  nth,
  assoc,
  pickBy
} = require("ramda");
const { Etcd3 } = require("etcd3");

class Etcd {
  constructor(
    params,
    serverKeyPrefix,
    { zeroWeight = 0, fullWeight = 1e2 } = {}
  ) {
    this.params = params;
    this.serverKeyPrefix = serverKeyPrefix;
    this.client = new Etcd3(params);
    this.zeroWeight = zeroWeight;
    this.fullWeight = fullWeight;
  }

  async getServers() {
    const valueMap = await this.client
      .getAll()
      .prefix(this.serverKeyPrefix)
      .strings();
    const grouped = pipe(
      reduceBy(
        (acc, [key, value]) =>
          assoc(
            pipe(
              split("/"),
              last
            )(key),
            value,
            acc
          ),
        {},
        pipe(
          head,
          split("/"),
          nth(-2)
        )
      ),
      pickBy((v, key) => key !== "undefined")
    )(Object.entries(valueMap));

    return grouped;
  }

  async getWeight(node) {
    return this.client.get(`${this.serverKeyPrefix}${node.serverKey}/weight`);
  }

  async setWeight(node, weight) {
    return this.client
      .put(`${this.serverKeyPrefix}${node.serverKey}/weight`)
      .value(weight);
  }

  async setZeroWeight(node) {
    return this.setWeight(node, this.zeroWeight);
  }

  async setFullWeight(node) {
    return this.setWeight(node, this.fullWeight);
  }
}

module.exports = { Etcd };
