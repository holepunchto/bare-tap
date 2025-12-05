const assert = require('bare-assert')

class TAP {
  constructor(level = 0, opts = {}) {
    if (typeof level === 'object') {
      opts = level
      level = 0
    }

    const { write } = opts

    this._level = level
    this._planned = 0
    this._actual = 0
    this._errors = 0
    this._ended = false

    if (write) this._write = (output) => write(output, this._level)
  }

  subtest() {
    return new TAP(this._level + 1)
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
    this._assert('ok', true, message)
  }

  fail(message) {
    this._assert('fail', message)
  }

  ok(value, message) {
    this._assert('ok', value, message)
  }

  notOk(value, message) {
    this._assert('notOk', value, message)
  }

  equal(actual, expected, message) {
    this._assert('equal', actual, expected, message)
  }

  notEqual(actual, expected, message) {
    this._assert('notEqual', actual, expected, message)
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  _write(output) {
    const indent = '    '.repeat(this._level)

    console.log(indent + output.replaceAll('\n', `\n${indent}`))
  }

  _assert(method, ...args) {
    assert.notOk(this._ended, 'Not already ended')
    assert.notEqual(this._planned, 0, 'Already planned')

    let output = `ok ${++this._actual}`

    const message = args.pop()

    if (message) output += ' - ' + message

    try {
      assert[method](...args, message)
    } catch (err) {
      this._errors++

      output = `not ${output}\n${this._diagnostics(err)}`
    }

    this._write(output)
  }

  _diagnostics(err) {
    let result = '---\n'

    result += toYAML({
      message: err.message,
      actual: err.actual,
      expected: err.expected,
      operator: err.operator
    })

    result += '\n...'

    return '  ' + result.replaceAll('\n', '\n  ')
  }

  _exit() {
    Bare.exitCode = this.end() ? 0 : 1
  }
}

module.exports = exports = new TAP()

exports.TAP = TAP

function toYAML(value, depth = 0) {
  const indent = '  '.repeat(depth)

  if (value === null || value === undefined) return 'null'

  if (typeof value === 'boolean' || typeof value === 'number') {
    return value.toString()
  }

  if (typeof value === 'string') return JSON.stringify(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'

    return (
      (depth === 0 ? '' : '\n') +
      value
        .map((value) => `${indent}- ${toYAML(value, depth + 1).trimStart()}`)
        .join('\n')
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)

    if (entries.length === 0) return '{}'

    return (
      (depth === 0 ? '' : '\n') +
      entries
        .map(([key, value]) => {
          const yaml = toYAML(value, depth + 1)

          const delim = yaml.startsWith('\n') ? '' : ' '

          return `${indent}${key}:${delim}${yaml}`
        })
        .join('\n')
    )
  }

  return ''
}
