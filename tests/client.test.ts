// Before running tests, ensure Locktopus server is running on 127.0.0.1:9009

import { WebSocket as LibWebsocket } from 'ws';

import { LocktopusClient } from '../src/client';
import { strictEqual } from 'assert';
import { LOCK_TYPE } from '../src/constants';

const SERVER_HOST = 'server';
const SERVER_PORT = 9009;

describe('Connection by string', () => {
  const ns = 'default';
  const client = new LocktopusClient(
    LibWebsocket,
    `ws://${SERVER_HOST}:${SERVER_PORT}/v1?namespace=${ns}`,
  );

  afterAll(() => {
    client.close();
  });

  it('Should be established successfully', async () => {
    await client.connect();
  });
});

describe('Connection by parameters', () => {
  const ns = 'default';

  const client = new LocktopusClient(LibWebsocket, {
    host: SERVER_HOST,
    port: SERVER_PORT,
    namespace: ns,
    secure: false,
  });

  afterAll(() => {
    client.close();
  });

  it('Should be established successfully', async () => {
    await client.connect();
  });
});

const ns = 'test-0';

const makeClient = async () => {
  const client = new LocktopusClient(
    LibWebsocket,
    `ws://${SERVER_HOST}:${SERVER_PORT}/v1?namespace=${ns}`,
  );

  await client.connect();

  return client;
};

describe('Lifecycle', () => {
  it('First lock should be acquired immediately', async () => {
    const client1 = await makeClient();
    const client2 = await makeClient();

    await client1.lock({ path: ['a'], type: LOCK_TYPE.WRITE });

    strictEqual(client1.isAcquired(), true);

    await client1.release();

    client1.close();
    client2.close();
  });

  it('Locked resource should not be acquired immediately', async () => {
    const client1 = await makeClient();
    const client2 = await makeClient();

    await client1.lock({ path: ['b'], type: LOCK_TYPE.WRITE });
    await client2.lock({ path: ['b'], type: LOCK_TYPE.WRITE });

    strictEqual(client1.isAcquired(), true);
    strictEqual(client2.isAcquired(), false);

    await client1.release();
    await client2.release();

    client1.close();
    client2.close();
  });

  it('Lock should be acquired after corresponding release', async () => {
    const client1 = await makeClient();
    const client2 = await makeClient();

    await client1.lock({ path: ['d'], type: LOCK_TYPE.WRITE });
    await client2.lock({ path: ['d'], type: LOCK_TYPE.WRITE });

    strictEqual(client1.isAcquired(), true);
    strictEqual(client2.isAcquired(), false);

    await client1.release();

    await client2.acquire();

    strictEqual(client2.isAcquired(), true);

    await client2.release();

    client1.close();
    client2.close();
  });

  it('Release can be called even if not acquired', async () => {
    const client1 = await makeClient();
    const client2 = await makeClient();

    await client1.lock({ path: ['c'], type: LOCK_TYPE.WRITE });
    await client2.lock({ path: ['c'], type: LOCK_TYPE.WRITE });

    strictEqual(client1.isAcquired(), true);
    strictEqual(client2.isAcquired(), false);

    await client2.release();
    await client1.release();

    client1.close();
    client2.close();
  });

  it('Locked resource should be acquired after locker released', async () => {
    const client1 = await makeClient();
    const client2 = await makeClient();

    await client1.lock({ path: ['a'], type: LOCK_TYPE.WRITE });
    await client2.lock({ path: ['a'], type: LOCK_TYPE.WRITE });

    strictEqual(client1.isAcquired(), true);
    strictEqual(client2.isAcquired(), false);

    await client1.release();
    strictEqual(client2.isAcquired(), false);

    await client2.acquire();
    strictEqual(client2.isAcquired(), true);

    await client2.release();

    client1.close();
    client2.close();
  });

  it('Can successfully release not acquired locks without calling acquire()', async () => {
    const client1 = await makeClient();
    const client2 = await makeClient();

    await client1.lock({ path: ['a'], type: LOCK_TYPE.WRITE });
    await client2.lock({ path: ['a'], type: LOCK_TYPE.WRITE });

    strictEqual(client1.isAcquired(), true);
    strictEqual(client2.isAcquired(), false);

    await client2.release();

    await client1.release();
    strictEqual(client2.isAcquired(), false);

    client1.close();
    client2.close();
  });

  it('Can successfully release not acquired locks after calling acquire()', async () => {
    const client1 = await makeClient();
    const client2 = await makeClient();

    await client1.lock({ path: [], type: LOCK_TYPE.WRITE });
    await client2.lock({ path: [], type: LOCK_TYPE.WRITE });

    const acquirePromise = client2.acquire();
    await client2.release();
    await acquirePromise;

    await client1.release();

    client1.close();
    client2.close();
  });
});
