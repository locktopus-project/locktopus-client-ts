// Before running tests, ensure GearLock server is running on 127.0.0.1:9009

import { GearlockClient } from '../src/client';
import { strictEqual } from 'assert';
import { LOCK_TYPE } from '../src/constants';

const SERVER_HOST = 'server';
const SERVER_PORT = 9009;

describe('Connection by string', () => {
  const ns = 'default';
  const client = new GearlockClient(
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

  const client = new GearlockClient({
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

describe('Lifecycle', () => {
  const ns = 'test-0';

  const client1 = new GearlockClient(
    `ws://${SERVER_HOST}:${SERVER_PORT}/v1?namespace=${ns}`,
  );
  const client2 = new GearlockClient(
    `ws://${SERVER_HOST}:${SERVER_PORT}/v1?namespace=${ns}`,
  );

  beforeAll(async () => {
    await client1.connect();
    await client2.connect();
  });

  afterAll(() => {
    client1.close();
    client2.close();
  });

  it('First lock should be acquired immediately', async () => {
    await client1.lock({ path: ['a'], type: LOCK_TYPE.WRITE });

    strictEqual(client1.isAcquired(), true);

    await client1.release();
  });
  it('Locked resource should not be acquired immediately', async () => {
    await client1.lock({ path: ['a'], type: LOCK_TYPE.WRITE });
    await client2.lock({ path: ['a'], type: LOCK_TYPE.WRITE });

    strictEqual(client1.isAcquired(), true);
    strictEqual(client2.isAcquired(), false);
  });
});
