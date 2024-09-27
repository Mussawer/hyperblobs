const test = require('brittle')
const b4a = require('b4a')
const Hypercore = require('hypercore')
const RAM = require('random-access-memory')

const Hyperblobs = require('..')

test('can get/put a large blob', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core)

  const buf = b4a.alloc(5 * blobs.blockSize, 'abcdefg')
  const id = await blobs.put(buf)
  const result = await blobs.get(id)

  t.alike(result, buf)
})

test('can put/get two blobs in one core', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core)

  {
    const buf = b4a.alloc(5 * blobs.blockSize, 'abcdefg')
    const id = await blobs.put(buf)
    const res = await blobs.get(id)

    t.alike(res, buf)
  }

  {
    const buf = b4a.alloc(5 * blobs.blockSize, 'hijklmn')
    const id = await blobs.put(buf)
    const res = await blobs.get(id)

    t.alike(res, buf)
  }
})

test('can seek to start/length within one blob, one block', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core)

  const buf = b4a.alloc(5 * blobs.blockSize, 'abcdefg')
  const id = await blobs.put(buf)
  const result = await blobs.get(id, { start: 2, length: 2 })

  t.alike(b4a.toString(result, 'utf-8'), 'cd')
})

test('can seek to start/length within one blob, multiple blocks', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core, { blockSize: 10 })

  const buf = b4a.concat([b4a.alloc(10, 'a'), b4a.alloc(10, 'b')])
  const id = await blobs.put(buf)
  const result = await blobs.get(id, { start: 8, length: 4 })

  t.is(b4a.toString(result, 'utf-8'), 'aabb')
})

test('can seek to start/length within one blob, multiple blocks, multiple blobs', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core, { blockSize: 10 })

  {
    const buf = b4a.alloc(5 * blobs.blockSize, 'abcdefg')
    const id = await blobs.put(buf)
    const res = await blobs.get(id)

    t.alike(res, buf)
  }

  const buf = b4a.concat([b4a.alloc(10, 'a'), b4a.alloc(10, 'b')])
  const id = await blobs.put(buf)
  const result = await blobs.get(id, { start: 8, length: 4 })

  t.is(b4a.toString(result, 'utf-8'), 'aabb')
})

test('can seek to start/end within one blob', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core)

  const buf = b4a.alloc(5 * blobs.blockSize, 'abcdefg')
  const id = await blobs.put(buf)
  const result = await blobs.get(id, { start: 2, end: 4 }) // inclusive

  t.is(b4a.toString(result, 'utf-8'), 'cde')
})

test('basic seek', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core)

  const buf = b4a.alloc(5 * blobs.blockSize, 'abcdefg')
  const id = await blobs.put(buf)
  const start = blobs.blockSize + 424
  const result = await blobs.get(id, { start })

  t.alike(result, buf.subarray(start))
})

test('can pass in a custom core', async t => {
  const core1 = new Hypercore(RAM)
  const core2 = new Hypercore(RAM)
  const blobs = new Hyperblobs(core1)
  await core1.ready()

  const buf = b4a.alloc(5 * blobs.blockSize, 'abcdefg')
  const id = await blobs.put(buf, { core: core2 })
  const result = await blobs.get(id, { core: core2 })

  t.alike(result, buf)
  t.is(core1.length, 0)
})

// Tests getBlobCount() function: Verifies accurate counting of blobs as they are added
test('can count the number of blobs', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core)

  t.is(await blobs.getBlobCount(), 0, 'Initial blob count should be 0')

  await blobs.put(b4a.from('blob1'))
  t.is(await blobs.getBlobCount(), 1, 'Blob count should be 1 after adding one blob')

  await blobs.put(b4a.from('blob2'))
  await blobs.put(b4a.from('blob3'))
  t.is(await blobs.getBlobCount(), 3, 'Blob count should be 3 after adding three blobs')
})

// Tests get() function with partial reads: Ensures correct data retrieval at blob boundaries
test('can perform partial read at blob boundaries', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core, { blockSize: 10 })

  const blob1 = b4a.from('abcdefghij')
  const blob2 = b4a.from('klmnopqrst')

  const id1 = await blobs.put(blob1)
  const id2 = await blobs.put(blob2)

  const result1 = await blobs.get(id1, { start: 8, length: 2 })
  t.is(b4a.toString(result1, 'utf-8'), 'ij', 'Partial read at end of first blob')

  const result2 = await blobs.get(id2, { start: 0, length: 2 })
  t.is(b4a.toString(result2, 'utf-8'), 'kl', 'Partial read at start of second blob')
})

// Tests put() and get() functions with empty input: Verifies correct handling of empty blobs
test('can handle empty blob', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core)

  const id = await blobs.put(b4a.from(''))
  const result = await blobs.get(id)

  t.is(result.length, 0, 'Retrieved empty blob should have length 0')
  t.alike(result, b4a.from(''), 'Retrieved empty blob should match input')
})

// Tests put() and get() functions under load: Checks system stability during concurrent operations
test('can handle concurrent writes and reads', async t => {
  const core = new Hypercore(RAM)
  const blobs = new Hyperblobs(core)

  const writePromises = []
  const readPromises = []

  for (let i = 0; i < 10; i++) {
    const blob = b4a.from(`blob${i}`)
    writePromises.push(blobs.put(blob))
  }

  const ids = await Promise.all(writePromises)

  for (const id of ids) {
    readPromises.push(blobs.get(id))
  }

  const results = await Promise.all(readPromises)

  for (let i = 0; i < 10; i++) {
    t.is(b4a.toString(results[i], 'utf-8'), `blob${i}`, `Concurrent read/write for blob${i} successful`)
  }
})
