// scripts/cleanup-pages-previews.js: filtering, pagination, delete calls, guards.
const assert = require('node:assert/strict');
const C = require('./scripts/cleanup-pages-previews');

const dep = (id, environment, branch) => ({ id, environment, deployment_trigger: { metadata: { branch } } });

// Only preview deployments from the exact branch match.
const sample = [
  dep('a', 'preview', 'feat-x'),
  dep('b', 'production', 'feat-x'),
  dep('c', 'preview', 'feat-x2'),
  dep('d', 'preview', 'main'),
  { id: 'e', environment: 'preview' },
];
assert.deepEqual(C.matchingDeployments(sample, 'feat-x').map(d => d.id), ['a']);

// Fake API: project p1 has 30 previews (two pages), p2 has one match.
function fakeApi() {
  const data = {
    p1: Array.from({ length: 30 }, (_, i) => dep('p1-' + i, 'preview', i % 3 === 0 ? 'feat-x' : 'other')),
    p2: [dep('p2-0', 'preview', 'feat-x'), dep('p2-1', 'production', 'feat-x')],
  };
  const calls = [];
  const fetch = async (url, init) => {
    calls.push(init.method + ' ' + url);
    assert.equal(init.headers.Authorization, 'Bearer tok');
    const u = new URL(url);
    const [, , acct, , , project, , id] = u.pathname.split('/');
    assert.equal(acct, 'acct');
    if (init.method === 'GET') {
      assert.equal(u.searchParams.get('env'), 'preview');
      const page = Number(u.searchParams.get('page')), per = Number(u.searchParams.get('per_page'));
      const rows = data[project].filter(d => d.environment === 'preview').slice((page - 1) * per, page * per);
      return { ok: true, status: 200, json: async () => ({ success: true, result: rows }) };
    }
    assert.equal(u.searchParams.get('force'), 'true');
    assert.ok(id);
    return { ok: true, status: 200, json: async () => ({ success: true, result: null }) };
  };
  return { fetch, calls };
}

(async () => {
  const f = fakeApi();
  const opts = { branch: 'feat-x', token: 'tok', accountId: 'acct', projects: ['p1', 'p2'], fetch: f.fetch, base: 'https://api.test', log: () => {} };
  const summary = await C.cleanup(opts);
  assert.deepEqual(summary, { p1: 10, p2: 1 });
  const deletes = f.calls.filter(c => c.startsWith('DELETE'));
  assert.equal(deletes.length, 11);
  assert.ok(deletes.every(c => /\/(p1-\d+|p2-0)\?force=true$/.test(c)), 'only matching previews deleted');
  assert.equal(f.calls.filter(c => c.startsWith('GET') && c.includes('/p1/')).length, 2, 'paginates past the first page');

  const dry = fakeApi();
  await C.cleanup({ ...opts, fetch: dry.fetch, dryRun: true });
  assert.equal(dry.calls.filter(c => c.startsWith('DELETE')).length, 0, 'dry run deletes nothing');

  await assert.rejects(C.cleanup({ ...opts, branch: 'main' }), /protected/);
  await assert.rejects(C.cleanup({ ...opts, branch: '' }), /required/);

  const failing = { ...opts, fetch: async () => ({ ok: false, status: 403, json: async () => ({ success: false, errors: [{ message: 'Authentication error' }] }) }) };
  await assert.rejects(C.cleanup(failing), /403 Authentication error/);

  console.log('cleanup-pages-previews tests passed');
})().catch(e => { console.error(e); process.exit(1); });
