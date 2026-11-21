import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { nativeHtml } from './native-html.mjs';

const sourceDir = process.env.SOURCE_DIR || fileURLToPath(new URL('../../', import.meta.url));
const source = await readFile(path.join(sourceDir, 'index.html'), 'utf8');
const html = nativeHtml(source);
const payment = html.match(/    async function submitPayment\(\) \{[\s\S]*?\n    \}/)?.[0];
assert.ok(payment, 'real storefront payment handler must be present');

async function checkout(outcome) {
  const elements = new Map();
  const state = { orders: [], redemptions: 0, calls: 0 };
  const getElement = id => {
    if (!elements.has(id)) {
      const classes = new Set(['hidden']);
      elements.set(id, {
        value: id === 'payPhone' ? '971234567' : id === 'payAddress' ? 'Test delivery address' : 'Review Customer',
        textContent: '',
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) }
      });
    }
    return elements.get(id);
  };
  const scope = {
    $: getElement, selectedProvider: 'mtn', payMethod: 'momo', window: {},
    VP: { enabled: false }, VOUCHER: { applied: null },
    VeriPoints: { enabled: () => false, earn: () => {} },
    cartTotals: () => ({ total: 100 }), dueTotal: () => 100, fmtK: n => `K${n}`,
    tryRealPayment: async () => { state.calls++; return outcome; },
    saveOrder: (ref, order) => state.orders.push({ ref, order }),
    redeemVoucher: async () => { state.redemptions++; }, vpEarn: async () => {},
    setTimeout: () => { throw new Error('Checkout must not fabricate success using a timer'); }
  };
  await vm.runInNewContext(payment + '\nsubmitPayment();', scope, { timeout: 1000 });
  return { state, elements };
}

for (const outcome of [null, false, 'failed', undefined]) {
  test(`unconfirmed payment (${String(outcome)}) never creates an order or consumes vouchers`, async () => {
    const { state, elements } = await checkout(outcome);
    assert.equal(state.calls, 1);
    assert.equal(state.orders.length, 0);
    assert.equal(state.redemptions, 0);
    assert.equal(elements.get('payError').classList.contains('hidden'), false);
    assert.equal(elements.get('payStep1').classList.contains('hidden'), false);
    assert.equal(elements.get('payStep2').classList.contains('hidden'), true);
  });
}
test('confirmed payment completes exactly one order', async () => {
  const { state, elements } = await checkout(true);
  assert.equal(state.calls, 1);
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].order.total, 100);
  assert.equal(elements.get('payStep3').classList.contains('hidden'), false);
});
test('native bundle cannot be overwritten by service-worker updates or show PWA install prompts', () => {
  assert.match(html, /const IS_INSTALLED = true;/);
  assert.doesNotMatch(html, /navigator\.serviceWorker\.register\(/);
});
