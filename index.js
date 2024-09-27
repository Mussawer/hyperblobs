const mutexify = require('mutexify')
const b4a = require('b4a')

const { BlobReadStream, BlobWriteStream } = require('./lib/streams')

const DEFAULT_BLOCK_SIZE = 2 ** 16

module.exports = class Hyperblobs {
  constructor (core, opts = {}) {
    this.core = core
    this.blockSize = opts.blockSize || DEFAULT_BLOCK_SIZE

    this._lock = mutexify()
    this._core = core
    // declared blobCount
    this._blobCount = 0
  }

  get feed () {
    return this.core
  }

  get locked () {
    return this._lock.locked
  }

  async put (blob, opts) {
    if (!b4a.isBuffer(blob)) blob = b4a.from(blob)
    const blockSize = (opts && opts.blockSize) || this.blockSize

    const stream = this.createWriteStream(opts)
    for (let i = 0; i < blob.length; i += blockSize) {
      stream.write(blob.subarray(i, i + blockSize))
    }
    stream.end()

    // Increment the blob count after successfully adding a new blob
    this._blobCount++
    return new Promise((resolve, reject) => {
      stream.once('error', reject)
      stream.once('close', () => {
        resolve(stream.id)
      })
    })
  }

  // Returns the current count of blobs stored in the Hyperblobs instance
  async getBlobCount () {
    return this._blobCount
  }

  async get (id, opts) {
    const res = []
    for await (const block of this.createReadStream(id, opts)) {
      res.push(block)
    }
    if (res.length === 1) return res[0]
    return b4a.concat(res)
  }

  createReadStream (id, opts) {
    const core = opts && opts.core ? opts.core : this._core
    return new BlobReadStream(core, id, opts)
  }

  createWriteStream (opts) {
    const core = opts && opts.core ? opts.core : this._core
    return new BlobWriteStream(core, this._lock, opts)
  }
}
