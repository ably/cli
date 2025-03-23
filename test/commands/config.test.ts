import {expect, test} from '@oclif/test'

describe('config', () => {
  test
  .stdout()
  .command(['config'])
  .it('runs config cmd', ctx => {
    expect(ctx.stdout).to.contain('hello world config test')
  })
})