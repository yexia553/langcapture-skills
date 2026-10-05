import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function uploadExpressions(expressions, config, request = fetch) {
  const url = new URL(config.origin);
  const origin = url.origin;
  if (
    origin !== config.origin ||
    !/^[a-zA-Z0-9_-]{40,64}$/.test(config.token || '') ||
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
  )
    throw new Error('Invalid skill configuration.');
  if (
    !Array.isArray(expressions) ||
    !expressions.length ||
    expressions.length > 50 ||
    expressions.some(
      (item) => typeof item?.text !== 'string' || !item.text.trim()
    )
  )
    throw new Error('Provide 1–50 expressions with a text field.');
  const receipts = [];
  for (const [index, item] of expressions.entries()) {
    try {
      const response = await request(`${origin}/api/library`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
        headers: {
          authorization: `Bearer ${config.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: item.text }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        receipts.push({
          index,
          ok: false,
          status: response.status,
          code: typeof body.code === 'string' ? body.code : 'capture_failed',
        });
        if ([401, 402, 403, 428, 429].includes(response.status)) break;
      } else if (body.saved?.cardId) {
        receipts.push({
          index,
          ok: true,
          saved: {
            cardId: body.saved.cardId,
            outcome: body.saved.outcome,
            enrichmentStatus: body.saved.enrichmentStatus,
          },
        });
      } else receipts.push({ index, ok: false, code: 'invalid_receipt' });
    } catch {
      receipts.push({ index, ok: false, code: 'network_error' });
      break;
    }
  }
  return {
    receipts,
    unattempted: expressions.length - receipts.length,
    library: `${origin}/library`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--file')
    throw new Error('Usage: node upload.mjs --file selected-expressions.json');
  const [config, expressions] = await Promise.all([
    readFile(join(homedir(), '.langcapture', 'config.json'), 'utf8').then(
      JSON.parse
    ),
    readFile(args[1], 'utf8').then(JSON.parse),
  ]);
  const result = await uploadExpressions(expressions, config);
  console.log(JSON.stringify(result, null, 2));
  if (result.receipts.some((receipt) => !receipt.ok) || result.unattempted)
    process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    console.error(
      'Upload failed. Check the input file and installed skill configuration.'
    );
    process.exitCode = 1;
  });
}
