import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { sanitizeContent, textToHtml } from '../content.js';

let app;

beforeEach(() => {
  app = createApp(openDb(':memory:'));
});

async function login(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email }).expect(200);
  return agent;
}

describe('auth', () => {
  test('rejects unknown users and unauthenticated requests', async () => {
    await request(app).post('/api/auth/login').send({ email: 'mallory@evil.test' }).expect(401);
    await request(app).get('/api/documents').expect(401);
  });
});

describe('documents', () => {
  test('create, rename, edit, and reopen preserves formatting', async () => {
    const alice = await login('alice@ajaia.test');
    const { body: created } = await alice.post('/api/documents').send({}).expect(201);
    const id = created.document.id;
    assert.equal(created.document.title, 'Untitled document');

    const html = '<h2>Plan</h2><p><strong>bold</strong> <em>it</em> <u>u</u></p><ul><li>one</li></ul>';
    await alice
      .patch(`/api/documents/${id}`)
      .send({ title: 'Q3 Plan', content: html, version: created.document.version })
      .expect(200);

    const { body } = await alice.get(`/api/documents/${id}`).expect(200);
    assert.equal(body.document.title, 'Q3 Plan');
    assert.equal(body.document.content, html);
    assert.equal(body.document.version, 2);
  });

  test('validates titles and strips unsafe HTML', async () => {
    const alice = await login('alice@ajaia.test');
    await alice.post('/api/documents').send({ title: '   ' }).expect(400);
    await alice.post('/api/documents').send({ title: 'x'.repeat(201) }).expect(400);

    const { body } = await alice
      .post('/api/documents')
      .send({ title: 'XSS', content: '<p onclick="x()">hi<script>alert(1)</script><img src=x onerror=alert(1)></p>' })
      .expect(201);
    assert.equal(body.document.content, '<p>hi</p>');
  });

  test('rejects stale writes with 409 instead of overwriting', async () => {
    const alice = await login('alice@ajaia.test');
    const { body } = await alice.post('/api/documents').send({ title: 'Doc' }).expect(201);
    const { id, version } = body.document;
    await alice.patch(`/api/documents/${id}`).send({ content: '<p>first</p>', version }).expect(200);
    const res = await alice.patch(`/api/documents/${id}`).send({ content: '<p>stale</p>', version }).expect(409);
    assert.equal(res.body.document.content, '<p>first</p>');
  });
});

describe('sharing and access control', () => {
  test('owner shares a document; recipients see it under "shared" with the right permissions', async () => {
    const alice = await login('alice@ajaia.test');
    const bob = await login('bob@ajaia.test');
    const carol = await login('carol@ajaia.test');

    const { body } = await alice.post('/api/documents').send({ title: 'Private notes' }).expect(201);
    const id = body.document.id;

    // Before sharing: Carol cannot see it, and existence is not leaked.
    await carol.get(`/api/documents/${id}`).expect(404);

    // Share read-only with Carol, editable with Bob.
    await alice.put(`/api/documents/${id}/shares`).send({ email: 'carol@ajaia.test', role: 'viewer' }).expect(200);
    const { body: shareRes } = await alice
      .put(`/api/documents/${id}/shares`)
      .send({ email: 'bob@ajaia.test', role: 'editor' })
      .expect(200);
    assert.deepEqual(shareRes.shares.map((s) => [s.email, s.role]), [
      ['bob@ajaia.test', 'editor'],
      ['carol@ajaia.test', 'viewer'],
    ]);

    // Carol: listed as shared, can read, cannot write or re-share.
    const { body: carolList } = await carol.get('/api/documents').expect(200);
    assert.ok(carolList.shared.some((d) => d.id === id && d.role === 'viewer'));
    assert.ok(!carolList.owned.some((d) => d.id === id));
    await carol.get(`/api/documents/${id}`).expect(200);
    await carol.patch(`/api/documents/${id}`).send({ content: '<p>hacked</p>' }).expect(403);
    await carol.put(`/api/documents/${id}/shares`).send({ email: 'carol@ajaia.test', role: 'editor' }).expect(403);

    // Bob: can edit but not delete or manage sharing.
    await bob.patch(`/api/documents/${id}`).send({ content: '<p>bob was here</p>' }).expect(200);
    await bob.delete(`/api/documents/${id}`).expect(403);
    const { body: bobView } = await bob.get(`/api/documents/${id}`).expect(200);
    assert.equal(bobView.document.shares, undefined, 'non-owners should not see the share list');

    // Revoking access removes it immediately.
    await alice.delete(`/api/documents/${id}/shares/3`).expect(200);
    await carol.get(`/api/documents/${id}`).expect(404);
  });

  test('sharing validates the target user and role', async () => {
    const alice = await login('alice@ajaia.test');
    const { body } = await alice.post('/api/documents').send({ title: 'Doc' }).expect(201);
    const id = body.document.id;
    await alice.put(`/api/documents/${id}/shares`).send({ email: 'nobody@ajaia.test' }).expect(404);
    await alice.put(`/api/documents/${id}/shares`).send({ email: 'alice@ajaia.test' }).expect(400);
    await alice.put(`/api/documents/${id}/shares`).send({ email: 'bob@ajaia.test', role: 'admin' }).expect(400);
    await alice.delete(`/api/documents/${id}/shares/abc`).expect(400);
  });

  test('owned list includes share lists without document content', async () => {
    const alice = await login('alice@ajaia.test');
    const { body } = await alice.get('/api/documents').expect(200);
    const welcome = body.owned.find((d) => d.title === 'Welcome to Ajaia Docs');
    assert.deepEqual(welcome.shares.map((s) => [s.email, s.role]), [['bob@ajaia.test', 'editor']]);
    assert.equal(welcome.content, undefined);
  });
});

describe('file import', () => {
  test('imports .md as a formatted document owned by the uploader', async () => {
    const alice = await login('alice@ajaia.test');
    const { body } = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from('# Heading\n\nSome **bold** text\n\n- a\n- b\n'), 'meeting-notes.md')
      .expect(201);
    assert.equal(body.document.title, 'meeting-notes');
    assert.match(body.document.content, /<h1>Heading<\/h1>/);
    assert.match(body.document.content, /<strong>bold<\/strong>/);
    assert.match(body.document.content, /<ul>\s*<li>a<\/li>/);
  });

  test('imports .docx headings and bold text', async () => {
    const alice = await login('alice@ajaia.test');
    const fixture = new URL('./fixtures/quarterly-review.docx', import.meta.url);
    const { body } = await alice.post('/api/documents/import').attach('file', fileURLToPath(fixture)).expect(201);
    assert.equal(body.document.title, 'quarterly-review');
    assert.equal(body.document.content, '<h1>Quarterly Review</h1><p>Revenue was <strong>up 12%</strong> this quarter.</p>');
  });

  test('keeps non-ASCII characters in imported file names', async () => {
    const alice = await login('alice@ajaia.test');
    const { body } = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from('hello'), 'Résumé notes.txt')
      .expect(201);
    assert.equal(body.document.title, 'Résumé notes');
  });

  test('rejects a corrupt .docx with 400', async () => {
    const alice = await login('alice@ajaia.test');
    await alice.post('/api/documents/import').attach('file', Buffer.from('not a zip'), 'broken.docx').expect(400);
  });

  test('rejects unsupported file types with a clear message', async () => {
    const alice = await login('alice@ajaia.test');
    const res = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from('%PDF-1.4'), 'report.pdf')
      .expect(415);
    assert.match(res.body.error, /Supported: \.txt, \.md, \.docx/);
  });
});

describe('content helpers', () => {
  test('textToHtml escapes markup and keeps paragraphs', () => {
    assert.equal(textToHtml('a <b>\nline2\n\npara 2'), '<p>a &lt;b&gt;<br>line2</p><p>para 2</p>');
  });
  test('sanitizeContent normalises <b>/<i>', () => {
    assert.equal(sanitizeContent('<b>x</b><i>y</i>'), '<strong>x</strong><em>y</em>');
  });
});
