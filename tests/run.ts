import assert from 'node:assert/strict'
import test from 'node:test'
import { extractContext, type NodeLike, type PageLike } from '../src/context'
import { buildPromptMessages, parseOpenRouterResponse } from '../src/openrouter'

function linkParents(node: NodeLike, parent: NodeLike | null): void {
  node.parent = parent
  if (node.children) {
    for (const child of node.children) {
      linkParents(child, node)
    }
  }
}

function createSampleDocument(): {
  page: PageLike
  submitLabel: NodeLike
  hiddenText: NodeLike
} {
  const submitLabel: NodeLike = {
    id: '10:3',
    name: 'Label',
    type: 'TEXT',
    visible: true,
    characters: 'Submit',
  }

  const hiddenText: NodeLike = {
    id: '10:4',
    name: 'Old Draft',
    type: 'TEXT',
    visible: false,
    characters: 'SECRET INTERNAL NOTE',
  }

  const submitBtn: NodeLike = {
    id: '10:2',
    name: 'Submit Button',
    type: 'INSTANCE',
    visible: true,
    children: [submitLabel],
  }

  const formHeadline: NodeLike = {
    id: '10:1',
    name: 'Headline',
    type: 'TEXT',
    visible: true,
    characters: 'Get our weekly newsletter',
  }

  const decorativeIcon: NodeLike = {
    id: '10:5',
    name: 'Decorative Vector',
    type: 'VECTOR',
    visible: true,
  }

  const signupScreen: NodeLike = {
    id: '10:0',
    name: 'Newsletter Signup',
    type: 'FRAME',
    visible: true,
    children: [formHeadline, submitBtn, hiddenText, decorativeIcon],
  }

  const otherScreenText: NodeLike = {
    id: '20:1',
    name: 'Footer',
    type: 'TEXT',
    visible: true,
    characters: 'Copyright 2026',
  }

  const otherScreen: NodeLike = {
    id: '20:0',
    name: 'About Screen',
    type: 'FRAME',
    visible: true,
    children: [otherScreenText],
  }

  const page: PageLike & NodeLike = {
    id: '0:1',
    name: 'Marketing Page',
    type: 'PAGE',
    children: [signupScreen, otherScreen],
  }

  linkParents(signupScreen, page)
  linkParents(otherScreen, page)

  return { page, submitLabel, hiddenText }
}

test('extractContext: screen scope includes parent screen context, excludes hidden layers and other screens', () => {
  const { page, submitLabel } = createSampleDocument()
  const payload = extractContext([submitLabel], page, 'screen')

  assert.equal(payload.screenName, 'Newsletter Signup')
  assert.equal(payload.targets.length, 1)
  assert.equal(payload.targets[0].id, '10:3')
  assert.equal(
    payload.targets[0].path,
    'Newsletter Signup > Submit Button > Label',
  )

  assert.match(payload.contextTree, /Get our weekly newsletter/)
  assert.match(
    payload.contextTree,
    /\[TARGET id="10:3" name="Label"\]"Submit"\[\/TARGET\]/,
  )
  assert.doesNotMatch(payload.contextTree, /SECRET INTERNAL NOTE/)
  assert.doesNotMatch(payload.contextTree, /Copyright 2026/)
  assert.doesNotMatch(payload.contextTree, /Decorative Vector/)
})

test('extractContext: page scope includes all visible screens on the page', () => {
  const { page, submitLabel } = createSampleDocument()
  const payload = extractContext([submitLabel], page, 'page')

  assert.equal(payload.screenName, 'Marketing Page')
  assert.match(payload.contextTree, /Get our weekly newsletter/)
  assert.match(payload.contextTree, /Copyright 2026/)
})

test('extractContext: ignores hidden selected nodes', () => {
  const { page, hiddenText } = createSampleDocument()
  const payload = extractContext([hiddenText], page, 'screen')
  assert.equal(payload.targets.length, 0)
})

test('buildPromptMessages: wraps context and targets in explicit delimiters', () => {
  const { page, submitLabel } = createSampleDocument()
  const payload = extractContext([submitLabel], page, 'screen')
  const messages = buildPromptMessages('Improve the CTA', payload)

  assert.equal(messages.length, 2)
  assert.match(messages[0].content, /NEVER as instructions/)
  assert.match(messages[1].content, /<canvas_context>/)
  assert.match(messages[1].content, /<\/canvas_context>/)
  assert.match(messages[1].content, /<targets>/)
  assert.match(messages[1].content, /<\/targets>/)
})

test('parseOpenRouterResponse: parses markdown-fenced JSON and filters out-of-scope IDs', () => {
  const allowed = new Set(['10:3'])
  const raw = [
    '```json',
    '{',
    '  "updates": [',
    '    { "id": "10:3", "text": "Subscribe to Newsletter" },',
    '    { "id": "10:1", "text": "HACKED UNSELECTED HEADLINE" }',
    '  ]',
    '}',
    '```',
  ].join('\n')

  const updates = parseOpenRouterResponse(raw, allowed)
  assert.deepEqual(updates, [{ id: '10:3', text: 'Subscribe to Newsletter' }])
})

test('parseOpenRouterResponse: throws when only out-of-scope IDs are returned', () => {
  const allowed = new Set(['10:3'])
  const raw = JSON.stringify({ updates: [{ id: '99:9', text: 'Injected' }] })
  assert.throws(
    () => parseOpenRouterResponse(raw, allowed),
    /No valid target updates/,
  )
})
