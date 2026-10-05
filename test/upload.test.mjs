import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { uploadExpressions } from '../skills/langcapture-work-english/scripts/upload.mjs';
const token = 'a'.repeat(43);
const origin = 'https://www.langcapture.com';

test('invalid inputs and insecure remote origins send no requests', async () => {
  const request = () => {
    throw new Error('Unexpected request');
  };
  await assert.rejects(uploadExpressions([], { origin, token }, request));
  await assert.rejects(
    uploadExpressions(
      [{ text: 'Hello.' }],
      { origin: 'http://example.com', token },
      request
    )
  );
  await assert.rejects(
    uploadExpressions(
      [{ text: 'Hello.' }],
      { origin, token: 'invalid' },
      request
    )
  );
});

test('network failures and revoked tokens stop subsequent submissions', async () => {
  for (const response of [
    () => {
      throw new Error(token);
    },
    () => new Response('', { status: 401 }),
  ]) {
    let calls = 0;
    const result = await uploadExpressions(
      [{ text: 'First.' }, { text: 'Second.' }],
      { origin, token },
      () => {
        calls++;
        return response();
      }
    );
    assert.equal(calls, 1);
    assert.equal(result.unattempted, 1);
    assert.ok(!JSON.stringify(result).includes(token));
  }
});

test('CLI reads shared user configuration and uploads selected text only', async () => {
  const home = await mkdtemp(join(tmpdir(), 'langcapture-upload-'));
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({
      path: request.url,
      auth: request.headers.authorization,
      body: JSON.parse(body),
    });
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        saved: {
          cardId: 'saved',
          outcome: 'created',
          enrichmentStatus: 'pending',
        },
      })
    );
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const localOrigin = `http://127.0.0.1:${server.address().port}`;
    await mkdir(join(home, '.langcapture'));
    await writeFile(
      join(home, '.langcapture', 'config.json'),
      JSON.stringify({ origin: localOrigin, token })
    );
    const file = join(home, 'selected expressions.json');
    await writeFile(
      file,
      JSON.stringify([
        { text: 'We discussed the trade-offs.', source: 'PRIVATE' },
      ])
    );
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            '../skills/langcapture-work-english/scripts/upload.mjs',
            import.meta.url
          )
        ),
        '--file',
        file,
      ],
      { env: { ...process.env, HOME: home, USERPROFILE: home } }
    );
    assert.equal(stderr, '');
    assert.ok(!stdout.includes(token));
    assert.equal(JSON.parse(stdout).receipts[0].saved.cardId, 'saved');
    assert.deepEqual(requests, [
      {
        path: '/api/library',
        auth: `Bearer ${token}`,
        body: { text: 'We discussed the trade-offs.' },
      },
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(home, { recursive: true, force: true });
  }
});

test('upload returns saved/pending receipts, sends only text and stops on account errors', async () => {
  const requests = [];
  const result = await uploadExpressions(
    [
      { text: 'We chose this approach.', source: 'PRIVATE' },
      { text: 'Second.' },
      { text: 'Third.' },
    ],
    { origin, token },
    async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? Response.json(
            {
              saved: {
                cardId: 'card',
                outcome: 'created',
                enrichmentStatus: 'pending',
              },
            },
            { status: 202 }
          )
        : Response.json({ code: 'language_setup_required' }, { status: 428 });
    }
  );
  assert.equal(result.receipts[0].saved.enrichmentStatus, 'pending');
  assert.equal(result.unattempted, 1);
  assert.equal(requests[0].options.body, '{"text":"We chose this approach."}');
  assert.equal(requests[0].options.headers.authorization, `Bearer ${token}`);
  assert.ok(!JSON.stringify(result).includes(token));
});
