export function replaceOnce(source, needle, replacement) {
  if (source.split(needle).length !== 2) throw new Error(`Build marker changed: ${needle}`);
  return source.replace(needle, replacement);
}

// Apply only to the bundled iPhone copy; the live website is not rewritten.
export function nativeHtml(source) {
  let html = replaceOnce(source, '<head>', '<head>\n<script>window.__ORIZIS_NATIVE__ = true;</script>');
  html = replaceOnce(html,
    "const IS_INSTALLED = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;",
    'const IS_INSTALLED = true;');
  // A missing/unreachable payment gateway returns null. Never turn that into
  // a successful order, or redeem a voucher when the remainder was not paid.
  html = replaceOnce(html, "if (outcome === 'failed') {", 'if (outcome !== true) {');
  html = replaceOnce(html,
    'if (outcome !== true) await new Promise(r => setTimeout(r, 4000));',
    '// Continue only after the payment service confirms success.');
  html = html.replace('// Simulated mode keeps a short "check your phone" pause for realism',
    '// An unconfirmed payment has already returned to the checkout form.');
  html = html.replace('Real payment unavailable, using simulation:', 'Payment confirmation unavailable:');
  html = html.replace(/The payment was not completed\. Please check your phone and try again\./g,
    'Payment could not be confirmed. No order has been completed. Check your wallet before trying again, or contact support.');
  // A service worker controls web releases; the iPhone assets are versioned
  // with the native build and must not be overwritten by a cached web shell.
  html = replaceOnce(html,
    "if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});",
    '// Bundled iPhone client: no web service worker registration.');
  return html;
}
