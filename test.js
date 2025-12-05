const test = require('brittle')
const { TAP } = require('.')

test('basic', (t) => {
  const written = []

  const tap = new TAP({
    write(output) {
      written.push(output)
    }
  })

  tap.plan(2)
  tap.ok(true, 'is true')
  tap.equal(42, 42, 'is 42')

  t.ok(tap.end())
  t.alike(written, ['TAP version 14', '1..2', 'ok 1 - is true', 'ok 2 - is 42'])
})
