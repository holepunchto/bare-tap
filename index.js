const assert = require('bare-assert')
const inspect = require('bare-inspect')

class TAP {
  constructor(level = 0, opts = {}) {
    if (typeof level === 'object') {
      opts = level
      level = 0
    }

    const { write = print } = opts

    this._level = level
    this._output = write
    this._planned = 0
    this._actual = 0
    this._errors = 0
    this._ended = false
  }

  subtest(offset = 0) {
    return new TAP(this._level + 1 + offset)
  }

  plan(n) {
    assert(n > 0, 'Plan must be positive')

    assert.notOk(this._ended, 'Not already ended')
    assert.equal(this._planned, 0, 'Not already planned')

    this._planned = n
    this._exit = this._exit.bind(this)

    Bare.once('exit', this._exit)

    if (this._level === 0) this._write('TAP version 14')

    this._write(`1..${n}`)
  }

  end() {
    assert.notOk(this._ended, 'Not already ended')

    this._ended = true

    Bare.off('exit', this._exit)

    assert.equal(
      this._actual,
      this._planned,
      `Assertion count (${this._actual}) matches plan (${this._planned})`
    )

    return this._errors === 0
  }

  pass(message) {
    this._assert('ok', [true], message)
  }

  fail(message) {
    this._assert('fail', [], message)
  }

  ok(value, message) {
    this._assert('ok', [value], message)
  }

  notOk(value, message) {
    this._assert('notOk', [value], message)
  }

  equal(actual, expected, message) {
    this._assert('equal', [actual, expected], message)
  }

  notEqual(actual, expected, message) {
    this._assert('notEqual', [actual, expected], message)
  }

  strictEqual(actual, expected, message) {
    this._assert('strictEqual', [actual, expected], message)
  }

  notStrictEqual(actual, expected, message) {
    this._assert('notStrictEqual', [actual, expected], message)
  }

  deepStrictEqual(actual, expected, message) {
    this._assert('deepStrictEqual', [actual, expected], message)
  }

  notDeepStrictEqual(actual, expected, message) {
    this._assert('notDeepStrictEqual', [actual, expected], message)
  }

  match(actual, regexp, message) {
    this._assert('match', [actual, regexp], message)
  }

  doesNotMatch(actual, regexp, message) {
    this._assert('doesNotMatch', [actual, regexp], message)
  }

  throws(fn, error, message) {
    this._assertError('throws', fn, error, message)
  }

  doesNotThrow(fn, error, message) {
    this._assertError('doesNotThrow', fn, error, message)
  }

  rejects(fn, error, message) {
    return this._assertError('rejects', fn, error, message)
  }

  doesNotReject(fn, error, message) {
    return this._assertError('doesNotReject', fn, error, message)
  }

  ifError(actual, message) {
    this._assert('ifError', [actual], message)
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  _write(output) {
    this._output(output, this._level)
  }

  _assertError(method, fn, error, message) {
    if (typeof error === 'string') return this._assert(method, [fn], error)

    return this._assert(method, [fn, error], message)
  }

  _assert(method, args, message) {
    let result

    try {
      result = assert[method](...args, message)
    } catch (err) {
      return this._report(false, message, err)
    }

    if (typeof result?.then === 'function') {
      return result.then(
        () => this._report(true, message),
        (err) => this._report(false, message, err)
      )
    }

    this._report(true, message)
  }

  _check() {
    assert.notOk(this._ended, 'Not already ended')
    assert.notEqual(this._planned, 0, 'Already planned')
  }

  _report(ok, message, error = null, directive = null) {
    this._check()

    let output = `${ok ? 'ok' : 'not ok'} ${++this._actual}`

    if (message) output += ' - ' + message

    if (directive) output += ' # ' + directive

    if (!ok) this._errors++

    if (error !== null) output += '\n' + diagnostics(error)

    this._write(output)
  }

  _exit() {
    Bare.exitCode = this.end() ? 0 : 1
  }
}

class Test extends TAP {
  constructor(name, fn, level, opts = {}) {
    const {
      write,
      timeout = 30000,
      skip = false,
      solo = false,
      exit = false
    } = opts

    super(level, { write })

    this._name = name
    this._fn = fn
    this._timeout = timeout
    this._skip = skip
    this._solo = solo
    this._exits = exit
    this._children = []
    this._teardowns = []
    this._running = null
    this._done = new Promise((resolve) => {
      this._resolve = resolve
    })
  }

  plan(n) {
    assert(n > 0, 'Plan must be positive')

    assert.equal(this._planned, 0, 'Not already planned')

    this._planned = n
  }

  teardown(fn) {
    this._teardowns.push(fn)
  }

  test(name, opts, fn) {
    if (typeof opts === 'function') {
      fn = opts
      opts = {}
    }

    const child = new Test(name, fn, this._level + 1, {
      write: this._output,
      timeout: this._timeout,
      ...opts
    })

    this._children.push(child)

    // Children start once the code declaring them has run to completion, so
    // that a solo declared after them is known.
    if (this._running === null) {
      this._running = new Promise((resolve) => setImmediate(resolve)).then(() =>
        this._runChildren()
      )
    }

    return child._done
  }

  _check() {
    assert.notOk(this._ended, 'Not already ended')
  }

  async _runChildren() {
    if (this._level === 0) this._write('TAP version 14')

    const solo = this._children.some((child) => child._solo)

    // Children may be declared while the ones before them run.
    for (let i = 0; i < this._children.length; i++) {
      const child = this._children[i]

      let ok = true

      if (child._skip) {
        this._report(true, child._name, null, 'SKIP')
      } else if (!solo || child._solo) {
        this._write(`# ${child._name}`)

        ok = await child._run()

        this._report(ok, child._name)
      }

      child._resolve(ok)
    }

    if (this._level !== 0) return

    this._write(`1..${this._actual}`)
    this._ended = true

    if (this._exits) {
      if (this._errors > 0) Bare.exitCode = 1

      Bare.exit()
    }
  }

  async _run() {
    let timer = null

    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Timed out after ${this._timeout} ms`))
      }, this._timeout)
    })

    try {
      await Promise.race([this._fn(this), timeout])

      if (this._running !== null) await Promise.race([this._running, timeout])
    } catch (err) {
      this._report(false, err.message, err)
    }

    clearTimeout(timer)

    for (const fn of this._teardowns.reverse()) {
      try {
        await fn()
      } catch (err) {
        this._report(false, 'teardown', err)
      }
    }

    if (this._planned !== 0 && this._planned !== this._actual) {
      this._report(false, 'plan', {
        message: `Expected ${this._planned} assertions`,
        actual: this._actual,
        expected: this._planned,
        operator: 'plan'
      })
    }

    this._write(`1..${this._actual}`)
    this._ended = true

    return this._errors === 0
  }
}

const root = new Test(null, null, 0, { exit: true })

module.exports = exports = new TAP()

exports.TAP = TAP

exports.Test = Test

exports.test = function test(name, opts, fn) {
  return root.test(name, opts, fn)
}

exports.test.skip = function skip(name, fn) {
  return root.test(name, { skip: true }, fn)
}

exports.test.solo = function solo(name, fn) {
  return root.test(name, { solo: true }, fn)
}

function print(output, level) {
  const indent = '    '.repeat(level)

  console.log(indent + output.replaceAll('\n', `\n${indent}`))
}

function diagnostics(err) {
  // Anything without an operator was thrown rather than asserted, so it has no
  // actual or expected value to show.
  const fields =
    err.operator === undefined
      ? { message: err.message, stack: err.stack }
      : {
          message: err.message,
          actual: err.actual,
          expected: err.expected,
          operator: err.operator
        }

  const result = `---\n${toYAML(fields)}\n...`

  return '  ' + result.replaceAll('\n', '\n  ')
}

function toYAML(value, depth = 0) {
  const indent = '  '.repeat(depth)

  if (value === null || value === undefined) return 'null'

  if (typeof value === 'boolean' || typeof value === 'number') {
    return value.toString()
  }

  if (typeof value === 'string') {
    if (!value.includes('\n')) return JSON.stringify(value)

    return '|\n' + value.replace(/^/gm, indent)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'

    return (
      (depth === 0 ? '' : '\n') +
      value
        .map((value) => `${indent}- ${toYAML(value, depth + 1).trimStart()}`)
        .join('\n')
    )
  }

  if (Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value)

    if (entries.length === 0) return '{}'

    return (
      (depth === 0 ? '' : '\n') +
      entries
        .map(([key, value]) => {
          const yaml = toYAML(value, depth + 1)

          return `${indent}${key}:${yaml.startsWith('\n') ? '' : ' '}${yaml}`
        })
        .join('\n')
    )
  }

  return toYAML(inspect(value), depth)
}
