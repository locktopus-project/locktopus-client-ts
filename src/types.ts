import { ACTION, LOCK_TYPE, CLIENT_STATE } from './constants';

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
