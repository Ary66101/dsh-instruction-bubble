import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectInstructions, instructionTextOf, pickInstruction } from '../src/client/rule.js'

test('instructionTextOf: 拼接 text 块并折叠空白', () => {
  const node = { content: [{ type: 'text', text: '  加上\n\n标签  ' }] }
  assert.equal(instructionTextOf(node), '加上 标签')
})

test('instructionTextOf: 图片块显示占位符', () => {
  const node = { content: [{ type: 'text', text: '看看这张' }, { type: 'image' }] }
  assert.equal(instructionTextOf(node), '看看这张 [图片]')
})

test('instructionTextOf: 跳过未知块，空节点返回空串', () => {
  assert.equal(instructionTextOf({ content: [{ type: 'tool_result' }] }), '')
  assert.equal(instructionTextOf(null), '')
  assert.equal(instructionTextOf({}), '')
})

test('collectInstructions: 只保留 user/steering 且按 order 排序', () => {
  const snapshot = {
    chat: {
      order: ['a', 'b', 'c', 'd'],
      nodes: {
        get: (key) => ({
          a: { kind: 'user', data: { content: [{ type: 'text', text: '甲' }] } },
          b: { kind: 'assistant', data: {} },
          c: { kind: 'steering', data: { content: [{ type: 'text', text: '乙' }] } },
          d: { kind: 'context', data: {} },
        })[key],
      },
    },
  }
  assert.deepEqual(collectInstructions(snapshot), [
    { key: 'a', text: '甲' },
    { key: 'c', text: '乙' },
  ])
})

test('collectInstructions: 无文本的节点被跳过，空快照返回空数组', () => {
  const snapshot = {
    chat: {
      order: ['x'],
      nodes: { get: () => ({ kind: 'user', data: { content: [] } }) },
    },
  }
  assert.deepEqual(collectInstructions(snapshot), [])
  assert.deepEqual(collectInstructions(null), [])
  assert.deepEqual(collectInstructions({}), [])
})

test('pickInstruction: 有已滚出的指令时取最近一条', () => {
  const list = [
    { key: 'a', text: '甲' },
    { key: 'b', text: '乙' },
    { key: 'c', text: '丙' },
  ]
  const rects = new Map([
    ['a', { bottom: 10 }],
    ['b', { bottom: 40 }],
    ['c', { bottom: 80 }],
  ])
  assert.equal(pickInstruction(list, rects, 30, 4).key, 'a')
  assert.equal(pickInstruction(list, rects, 45, 4).key, 'b')
})

test('pickInstruction: 全部滚出时返回最后一条，含容差边界', () => {
  const list = [{ key: 'a', text: '甲' }, { key: 'b', text: '乙' }]
  const rects = new Map([
    ['a', { bottom: 34 }], // 34 <= 30 + 4 → 已滚出
    ['b', { bottom: 30 }],
  ])
  assert.equal(pickInstruction(list, rects, 30, 4).key, 'b')
})

test('pickInstruction: 没有任何滚出时回退为第一条', () => {
  const list = [{ key: 'a', text: '甲' }, { key: 'b', text: '乙' }]
  const rects = new Map([
    ['a', { bottom: 100 }],
    ['b', { bottom: 200 }],
  ])
  assert.equal(pickInstruction(list, rects, 30, 4).key, 'a')
  assert.equal(pickInstruction([], rects, 30, 4), null)
})

test('pickInstruction: 首条无 rect 时回退为第一条有 rect 的指令', () => {
  const list = [{ key: 'a', text: '甲' }, { key: 'b', text: '乙' }, { key: 'c', text: '丙' }]
  const rects = new Map([
    ['b', { bottom: 60 }],
    ['c', { bottom: 90 }],
  ])
  assert.equal(pickInstruction(list, rects, 30, 4).key, 'b')
})

test('instructionTextOf: 全角空格/换行折叠为半角空格，纯空白块被跳过', () => {
  assert.equal(instructionTextOf({ content: [{ type: 'text', text: '甲\u3000\n乙' }] }), '甲 乙')
  assert.equal(instructionTextOf({ content: [{ type: 'text', text: '   ' }] }), '')
  assert.equal(instructionTextOf({ content: [{ type: 'image' }] }), '[图片]')
})
