/**
 * @internal
 */
export const WS_NORMAL_CLOSE = 1000;
/**
 * @internal
 */
export const WS_ABNORMAL_CLOSE = 3000;

/**
 * @internal
 */
export enum ACTION {
  LOCK = 'lock',
  RELEASE = 'release',
}

/**
 * State of the connection
 */
export enum CLIENT_STATE {
  /**
   * Connection is being established
   */
  CONNECTING = 'connecting',
  /**
   * Connection is ready for making a lock
   */
  READY = 'ready',
  /**
   * Connection is waiting acquiring the lock
   */
  ENQUEUED = 'enqueued',
  /**
   * Connection has acquired the lock. Do what you need and then release it
   */
  ACQUIRED = 'acquired',
  /**
   * Connection is closed
   */
  NOT_CONNECTED = 'not_connected',
}

/**
 * Lock type allows to optimize resource usage: read locks can be overlapped with each other, but not with write locks
 */
export enum LOCK_TYPE {
  READ = 'read',
  WRITE = 'write',
}

/**
 * @internal
 */
export const EVENT_NEXT = 'next';
export const EVENT_MSG = 'msg';
export const PAYLOAD_RELEASE = 'released';
export const PAYLOAD_RESPONSE = 'response';
export const NAMESPACE_PARAMETER_NAME = 'namespace';
export const ABANDON_TIMEOUT_PARAMETER_NAME = 'abandon-timeout-ms';

export const ERROR_NO_RESPONSE = `No response read after waiting. Make sure to call methods in proper order`;
