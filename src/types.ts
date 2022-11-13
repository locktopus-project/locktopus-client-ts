import {
  ACTION,
  LOCK_TYPE,
  CLIENT_STATE,
  PAYLOAD_RELEASE,
  PAYLOAD_RESPONSE,
} from './constants';

/**
 * @internal
 */
export type RequestMessage = {
  action: ACTION;
  Resources?: Resource[];
};

export type Resource = {
  type: LOCK_TYPE;
  path: string[];
};

/**
 * @internal
 */
export type ResponseMessage = {
  id: string;
  action: ACTION;
  state: CLIENT_STATE;
};

export type ConnectionOptions = {
  host: string;
  port: number;
  namespace: string;
  secure: boolean;
};

/**
 * @internal
 */
export type EVENT_PAYLOAD = typeof PAYLOAD_RELEASE | typeof PAYLOAD_RESPONSE;

export type WebsocketCloseEvent = {
  code: number;
  reason: string;
  wasClean: boolean;
};
