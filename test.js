const test = require('brittle')
const { TAP, Test } = require('.')

function create() {
  const written = []

  const tap = new TAP({
    write(output) {
      written.push(output)
    }
  })

  return { tap, written }
}

test('basic', (t) => {
  const { tap, written } = create()

  tap.plan(2)
  tap.ok(true, 'is true')
  tap.equal(42, 42, 'is 42')

  t.ok(tap.end())
  t.alike(written, ['TAP version 14', '1..2', 'ok 1 - is true', 'ok 2 - is 42'])
})

test('strict and deep equality', (t) => {
  const { tap, written } = create()

  tap.plan(4)
  tap.strictEqual(1, 1, 'same')
  tap.notStrictEqual(1, '1', 'not same')
  tap.deepStrictEqual({ a: [1, 2] }, { a: [1, 2] }, 'deep')
  tap.notDeepStrictEqual({ a: 1 }, { a: '1' }, 'not deep')

  t.ok(tap.end())
  t.is(written.length, 6)
})

test('deep equality failure', (t) => {
  const { tap, written } = create()

  tap.plan(1)
  tap.deepStrictEqual({ width: 120 }, { width: 100 }, 'width')

  t.absent(tap.end())
  t.ok(written[2].startsWith('not ok 1 - width\n'))
  t.ok(written[2].includes('actual:\n    width: 120'))
  t.ok(written[2].includes('expected:\n    width: 100'))
})

test('match', (t) => {
  const { tap, written } = create()

  tap.plan(3)
  tap.match('hello', /ell/, 'matches')
  tap.doesNotMatch('hello', /xyz/, 'does not match')
  tap.match('hello', /xyz/, 'fails')

  t.absent(tap.end())
  t.ok(written[4].includes('expected: "/xyz/"'))
})

test('throws', (t) => {
  const { tap, written } = create()

  tap.plan(5)
  tap.throws(
    () => {
      throw new Error('boom')
    },
    /boom/,
    'with regexp'
  )
  tap.throws(() => {
    throw new Error('boom')
  }, 'without error')
  tap.doesNotThrow(() => {}, 'does not throw')
  tap.throws(() => {}, 'fails')
  tap.throws(
    () => {
      throw new Error('boom')
    },
    /bang/,
    'wrong error'
  )

  t.absent(tap.end())
  t.is(written[3], 'ok 2 - without error')
  t.ok(written[5].startsWith('not ok 4 - fails'))
  t.ok(written[6].includes('actual: |\n    Error: boom\n'))
})

test('rejects', async (t) => {
  const { tap, written } = create()

  tap.plan(3)
  await tap.rejects(Promise.reject(new Error('boom')), /boom/, 'rejects')
  await tap.doesNotReject(async () => {}, 'does not reject')
  await tap.rejects(Promise.resolve(), 'fails')

  t.absent(tap.end())
  t.is(written[2], 'ok 1 - rejects')
  t.is(written[3], 'ok 2 - does not reject')
  t.ok(written[4].startsWith('not ok 3 - fails'))
})

test('ifError', (t) => {
  const { tap, written } = create()

  tap.plan(2)
  tap.ifError(null, 'no error')
  tap.ifError(new Error('boom'), 'error')

  t.absent(tap.end())
  t.is(written[2], 'ok 1 - no error')
  t.ok(written[3].startsWith('not ok 2 - error'))
})

function createRoot() {
  const written = []

  const root = new Test(null, 0, {
    write(output, level) {
      written.push('    '.repeat(level) + output)
    }
  })

  return { root, written }
}

test('cases run in order and plan at the end', async (t) => {
  const { root, written } = createRoot()

  root.test('first', (t) => {
    t.ok(true, 'one')
    t.ok(true, 'two')
  })

  await root.test('second', async (t) => {
    await t.sleep(1)
    t.equal(1, 1, 'three')
  })

  t.alike(written, [
    'TAP version 14',
    '# first',
    '    ok 1 - one',
    '    ok 2 - two',
    '    1..2',
    'ok 1 - first',
    '# second',
    '    ok 1 - three',
    '    1..1',
    'ok 2 - second',
    '1..2'
  ])
})

test('a thrown error fails the case and the run continues', async (t) => {
  const { root, written } = createRoot()

  const failed = root.test('throws', () => {
    throw new Error('boom')
  })

  const passed = root.test('passes', (t) => t.pass())

  t.is(await failed, false)
  t.is(await passed, true)
  t.ok(written.includes('not ok 1 - throws'))

  const diagnostics = written.find((line) =>
    line.startsWith('    not ok 1 - boom')
  )

  t.ok(diagnostics.includes('message: "boom"\n'))
  t.ok(diagnostics.includes('stack: |\n    Error: boom\n        at '))
  t.absent(diagnostics.includes('actual'))
  t.ok(written.includes('ok 2 - passes'))
})

test('a plan that is not met fails the case', async (t) => {
  const { root, written } = createRoot()

  t.is(
    await root.test('planned', (t) => {
      t.plan(2)
      t.pass()
    }),
    false
  )

  t.ok(written.some((line) => line.startsWith('    not ok 2 - plan')))
})

test('teardowns run in reverse after a failure', async (t) => {
  const { root } = createRoot()

  const order = []

  await root.test('fails', (t) => {
    t.teardown(() => order.push('first'))
    t.teardown(() => order.push('second'))
    t.fail('nope')
  })

  t.alike(order, ['second', 'first'])
})

test('a case that never ends times out', async (t) => {
  const { root, written } = createRoot()

  const ok = await root.test(
    'hangs',
    { timeout: 20 },
    () => new Promise(() => {})
  )

  t.is(ok, false)
  t.ok(
    written.some((line) =>
      line.startsWith('    not ok 1 - Timed out after 20 ms')
    )
  )
})

test('skip and solo', async (t) => {
  const { root, written } = createRoot()

  root.test('skipped', { skip: true }, (t) => t.fail())

  await root.test('runs', (t) => t.pass())

  t.ok(written.includes('ok 1 - skipped # SKIP'))
  t.ok(written.includes('ok 2 - runs'))

  const solo = createRoot()

  solo.root.test('ignored', (t) => t.fail())
  await solo.root.test('only', { solo: true }, (t) => t.pass())

  t.alike(
    solo.written.filter((line) => /^(not )?ok/.test(line)),
    ['ok 1 - only']
  )
})

test('cases nest', async (t) => {
  const { root, written } = createRoot()

  await root.test('outer', async (t) => {
    t.pass('before')

    await t.test('inner', (t) => t.pass('inside'))

    t.pass('after')
  })

  t.alike(written, [
    'TAP version 14',
    '# outer',
    '    ok 1 - before',
    '    # inner',
    '        ok 1 - inside',
    '        1..1',
    '    ok 2 - inner',
    '    ok 3 - after',
    '    1..3',
    'ok 1 - outer',
    '1..1'
  ])
})
