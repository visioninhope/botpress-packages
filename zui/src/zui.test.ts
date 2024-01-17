import { describe, test, expect } from 'vitest'
import { zui } from '.'
import { Infer } from './zui'

describe('zui', () => {
  test('vanially zui gives me a zui def', () => {
    expect(zui.string().ui).toEqual({})
  })

  test('string', () => {
    const schema = zui.string().regex(/hello/i).title('Title').examples(['Example 1']).readonly(true).length(20)

    expect(schema.ui).toEqual({
      title: 'Title',
      examples: ['Example 1'],
      readonly: true
    })
  })

  test('number', () => {
    const schema = zui.number().min(10).title('Title').examples([10]).readonly(true).max(20).int()

    expect(schema.ui).toEqual({
      title: 'Title',
      examples: [10],
      readonly: true
    })
  })

  test('boolean', () => {
    const schema = zui.boolean().title('Title').examples([true]).readonly(true)

    expect(schema.ui).toEqual({
      title: 'Title',
      examples: [true],
      readonly: true
    })
  })

  test('optional', () => {
    const a = zui.boolean().title('Active').optional()
    const b = zui.boolean().title('Active')

    expect(a.ui).toEqual(b.ui)
  })

  test('with default value', () => {
    const a = zui.boolean().title('Active').default(true)
    const b = zui.boolean().title('Active')

    expect(a.ui).toEqual(b.ui)
  })
})

describe('examples', () => {
  test('displayAs with Component Props', () => {
    // import a UI component props from inspector-kit or wherever
    type Dropdown = { type: 'dropdown'; choices: string[] }

    // use in zui to get typings on the options but without direct dependency on inspector-kit in zui
    const dropdown = zui.string().displayAs<Dropdown>({ type: 'dropdown', choices: ['a', 'b'] })

    // props are available on the zui def which can be used in the UI
    expect(dropdown.ui.displayAs).toEqual({ type: 'dropdown', choices: ['a', 'b'] })
  })
})

test('Type inference', () => {
  const schema = zui.object({
    name: zui.string().title('Name'),
    age: zui.number().title('Age'),
    employer: zui.object({
      name: zui.string().title('Employer Name')
    })
  })

  type Schema = Infer<typeof schema>
  const typingsInfer: Schema = {
    employer: {
      name: 'hello'
    },
    age: 10,
    name: 'hello'
  }
})
