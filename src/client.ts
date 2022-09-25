import type { WebSocket as LibWebsocket } from 'ws';
import { EventEmitter } from 'events';
import {
  ACTION,
  EVENT_NEXT,
  STATE,
  WS_ABNORMAL_CLOSE,
  WS_NORMAL_CLOSE,
} from './constants';
import {
  ConnectionOptions,
  RequestMessage,
  Resource,
  ResponseMessage,
} from './types';

type WebsocketClass =
  | { new (url: string): LibWebsocket }
  | { new (url: string): WebSocket };

type WebSocketInstance = LibWebsocket | WebSocket;

export class GearlockClient {
  private address: string;

  private responseQueue: ResponseMessage[] = [];
  private ee = new EventEmitter();
  private wsConstructor: WebsocketClass;
  private ws?: WebSocketInstance;
  private wsError?: Error;

  private _currentState = STATE.READY;
  private _lockId?: string;

  /**
   * @param wsConstructor Provide WebSocket from 'ws' package (for NodeJS) or WebSocket from dom lib (for browser)
   */
  constructor(
    wsConstructor: WebsocketClass,
    options: string | ConnectionOptions,
  ) {
    if (typeof options === 'string') {
      this.address = options;
    } else {
      this.address = `${options.secure ? 'wss' : 'ws'}://${options.host}:${
        options.port
      }/v1?namespace=${options.namespace}`;
    }

    this.wsConstructor = wsConstructor;
  }

  getState() {
    return this._currentState;
  }

  isAcquired() {
    if (!this.ws) {
      throw new Error('Not initialised');
    }

    return this._currentState === STATE.ACQUIRED;
  }

  getLockId() {
    if (!this.ws) {
      throw new Error('Not initialised');
    }

    return this._lockId!;
  }

  async connect() {
    this.wsError = undefined;
    this.ws = new this.wsConstructor(this.address);

    return new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => {
        this.handleConnectionErrors();
        this.handleIncomingMessages();

        resolve();
      };

      this.ws!.onerror = (err: any) => {
        reject(err);
      };
    });
  }

  close() {
    this.checkError();

    this.ws!.close(WS_NORMAL_CLOSE);
  }

  async lock(...resources: Resource[]): Promise<void> {
    this.checkError();

    if (resources.length === 0) {
      throw new Error('No resources provided');
    }

    if (this._currentState !== STATE.READY) {
      throw new Error(`Cannot lock in current state: ${this._currentState}`);
    }

    const msg: RequestMessage = {
      action: ACTION.LOCK,
      Resources: resources,
    };

    const response = await this.doRequest(msg);

    if (response.action !== ACTION.LOCK) {
      this.raiseProtocolError(
        `Unexpected response action: ${response.action}. Expected: ${ACTION.LOCK}`,
      );
    }

    if (response.state === STATE.READY) {
      this.raiseProtocolError(
        `Unexpected response state: ${response.state}. Expected: ${STATE.READY}`,
      );
    }

    this._currentState = response.state;
    this._lockId = response.id;
  }

  async acquire() {
    this.checkError();

    if (this._currentState === STATE.ACQUIRED) {
      return;
    }

    const response = await this.readResponse();

    if (response.action !== ACTION.LOCK) {
      this.raiseProtocolError(
        `Unexpected response action: ${response.action}. Expected: ${ACTION.LOCK}`,
      );
    }

    if (response.state !== STATE.ACQUIRED) {
      this.raiseProtocolError(
        `Unexpected response state: ${response.state}. Expected: ${STATE.ACQUIRED}`,
      );
    }

    if (this._lockId != null && response.id !== this._lockId) {
      this.raiseProtocolError(
        `Unexpected lock id: ${response.id}. Expected: ${this._lockId}`,
      );
    }

    this._currentState = response.state;
    this._lockId = response.id;
  }

  async release() {
    this.checkError();

    if (this._currentState === STATE.READY) {
      throw new Error(`Cannot release in current state: ${this._currentState}`);
    }

    const msg: RequestMessage = {
      action: ACTION.RELEASE,
    };

    let response = await this.doRequest(msg);

    if (
      response.action === ACTION.LOCK &&
      response.id === this._lockId &&
      response.state === STATE.ACQUIRED &&
      this._currentState === STATE.ENQUEUED
    ) {
      // This is the response to the previous Lock() call, skip it

      response = await this.readResponse();
    }

    if (response.id !== this._lockId) {
      this.raiseProtocolError(
        `Unexpected lock id: ${response.id}. Expected: ${this._lockId}`,
      );
    }

    if (response.action !== ACTION.RELEASE) {
      this.raiseProtocolError(
        `Unexpected response action: ${response.action}. Expected: ${ACTION.RELEASE}`,
      );
    }

    if (response.state !== STATE.READY) {
      this.raiseProtocolError(
        `Unexpected response state: ${response.state}. Expected: ${STATE.READY}`,
      );
    }

    if (this._lockId != null && response.id !== this._lockId) {
      this.raiseProtocolError(
        `Unexpected lock id: ${response.id}. Expected: ${this._lockId}`,
      );
    }

    this._currentState = response.state;
    this._lockId = response.id;
  }

  private raiseProtocolError(msg: string) {
    this.ws!.close(WS_ABNORMAL_CLOSE);

    throw new Error(msg);
  }

  private handleIncomingMessages() {
    this.ws!.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data.toString()) as ResponseMessage;

        this.responseQueue.push(msg);

        this.ee.emit(EVENT_NEXT);
      } catch (err: any) {
        this.wsError = new Error(
          `Cannot parse response from server: ${err?.message || err}`,
        );
      }
    };
  }

  private handleConnectionErrors() {
    this.ws!.onerror = (err: any) => {
      this.wsError = err;
    };

    this.ws!.onclose = (event: CloseEvent) => {
      this.wsError = new Error(
        `Connection closed with code ${event.code}: ${event.reason}`,
      );
    };
  }

  private checkError() {
    if (!this.ws) {
      throw new Error('Not initialised');
    }

    if (this.wsError) {
      throw this.wsError;
    }
  }

  private async readResponse(): Promise<ResponseMessage> {
    this.checkError();

    let nextResponse = this.responseQueue.shift();
    if (nextResponse) {
      return nextResponse;
    }

    await this.waitForResponse();

    nextResponse = this.responseQueue.shift();
    if (!nextResponse) {
      throw new Error(
        'No response after waiting. This is probably a race condition. Please, reviewe your logic',
      );
    }

    return nextResponse;
  }

  private async doRequest(msg: RequestMessage): Promise<ResponseMessage> {
    this.checkError();

    this.sendRequest(msg);

    const response = await this.readResponse();

    this.checkError();

    return response;
  }

  private sendRequest(msg: RequestMessage) {
    this.ws!.send(JSON.stringify(msg));
  }

  private async waitForResponse(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.ee.once(EVENT_NEXT, () => {
        resolve();
      });
    });
  }
}
