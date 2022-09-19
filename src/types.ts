import { ACTION, LOCK_TYPE, STATE } from './constants';

export type RequestMessage = {
  action: ACTION;
  Resources?: Resource[];
};

export type Resource = {
  type: LOCK_TYPE;
  path: string[];
};

export type ResponseMessage = {
  id: string;
  action: ACTION;
  state: STATE;
};

export type ConnectionOptions = {
  host: string;
  port: number;
  namespace: string;
  secure: boolean;
};
