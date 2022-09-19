/**
 * @internal
 */
export const WS_NORMAL_CLOSE = 1000;
export const WS_ABNORMAL_CLOSE = 1006;

export enum ACTION {
  LOCK = 'lock',
  RELEASE = 'release',
}

export enum STATE {
  READY = 'ready',
  ENQUEUED = 'enqueued',
  ACQUIRED = 'acquired',
}

export enum LOCK_TYPE {
  READ = 'read',
  WRITE = 'write',
}

export const EVENT_NEXT = 'next';
