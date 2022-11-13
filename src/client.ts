import type { WebSocket as LibWebsocket } from 'ws';
import { EventEmitter } from 'events';
import {
  ACTION,
  EVENT_NEXT,
  CLIENT_STATE,
  WS_ABNORMAL_CLOSE,
  WS_NORMAL_CLOSE,
  PAYLOAD_RELEASE,
  PAYLOAD_RESPONSE,
  ERROR_NO_RESPONSE,
} from './constants';
import {
  ConnectionOptions,
  EVENT_PAYLOAD,
  RequestMessage,
  Resource,
  ResponseMessage,
  WebsocketCloseEvent,
} from './types';

type WebsocketClass =
  | { new (url: string): LibWebsocket }
  | { new (url: string): WebSocket };

type WebSocketInstance = LibWebsocket | WebSocket;

export class LocktopusClient {
  private address: string;

  private ee = new EventEmitter();
  private responseQueue: ResponseMessage[] = [];

  private wsConstructor: WebsocketClass;
  private ws?: WebSocketInstance;
  private wsError?: Error;

  private released = false;

  private _currentState = CLIENT_STATE.NOT_CONNECTED;
  private _lockId?: string;

  /**
   * @param wsConstructor Provide WebSocket from 'ws' package (for NodeJS) or WebSocket from dom lib (for browser)
   */
  constructor(
    wsConstructor: WebsocketClass,
    options: string | ConnectionOptions,
  ) {
    this.initialize();

    if (typeof options === 'string') {
      this.address = options;
    } else {
      this.address = `${options.secure ? 'wss' : 'ws'}://${options.host}:${
        options.port
      }/v1?namespace=${options.namespace}`;
    }

    this.wsConstructor = wsConstructor;
  }

  private initialize() {
    this.responseQueue = [];
    this.ee = new EventEmitter();
    this.ws = undefined;
    this.wsError = undefined;
    this._currentState = CLIENT_STATE.NOT_CONNECTED;
    this._lockId = undefined;
  }

  getState(): CLIENT_STATE {
    return this._currentState;
  }

  /**
   * Returns true if last lock has been successfully acquired. If returned false, use acquire()
   */
  isAcquired() {
    if (!this.ws) {
      throw new Error('Not initialised');
    }

    return this._currentState === CLIENT_STATE.ACQUIRED;
  }

  /**
   * Returns lock ID assigned by server to this connection. Valid only when connected
   */
  getLockId() {
    if (!this.ws) {
      throw new Error('Not initialised');
    }

    return this._lockId!;
  }

  // Add handler to 'close' event of current connection. If not connected, throws error. This is not middleware
  async onConnectionClose(handler: (event: WebsocketCloseEvent) => void) {
    this.checkError();

    this.ws!.onclose = handler;
  }

  /**
   * Establish connection to server
   */
  async connect() {
    this.wsError = undefined;
    this.ws = new this.wsConstructor(this.address);

    this._currentState = CLIENT_STATE.CONNECTING;

    return new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => {
        this.handleConnectionErrors();
        this.handleIncomingMessages();

        this._currentState = CLIENT_STATE.READY;

        resolve();
      };

      this.ws!.onerror = (err: any) => {
        reject(err);
      };
    });
  }

  /**
   * Close connection. After that, client may connect() again
   */
  close() {
    this.ws?.close(WS_NORMAL_CLOSE);

    this.initialize();
  }

  /**
   * Lock resources. If resolves with true, the lock is acquired. Otherwise, use acquire(). After that you may use specified resources without data races.
   */
  async lock(...resources: Resource[]): Promise<boolean> {
    this.checkError();

    this.released = false;

    if (resources.length === 0) {
      throw new Error('No resources provided');
    }

    if (this._currentState !== CLIENT_STATE.READY) {
      throw new Error(`Cannot lock in current state: ${this._currentState}`);
    }

    const msg: RequestMessage = {
      action: ACTION.LOCK,
      Resources: resources,
    };

    this.sendRequest(msg);
    await this.waitForResponseOrEvent();
    const response = this.consumeResponse();

    if (!response) {
      throw new Error(ERROR_NO_RESPONSE);
    }

    if (response.action !== ACTION.LOCK) {
      this.raiseProtocolError(
        `Unexpected response action: ${response.action}. Expected: ${ACTION.LOCK}`,
      );
    }

    if (response.state === CLIENT_STATE.READY) {
      this.raiseProtocolError(
        `Unexpected response state: ${response.state}. Expected: ${CLIENT_STATE.READY}`,
      );
    }

    this._currentState = response.state;
    this._lockId = response.id;

    return response.state === CLIENT_STATE.ACQUIRED;
  }

  /**
   * Wait for last lock to be acquired. If the lock is already acquired, returns true immediately (no-op). If returned false, that means the lock has been released by this client so the lock is not acquired anymore.
   */
  async acquire(): Promise<boolean> {
    this.checkError();

    if (this._currentState === CLIENT_STATE.ACQUIRED) {
      return true;
    }

    const event = await this.waitForResponseOrEvent();

    if (event === PAYLOAD_RELEASE) {
      return false;
    }

    const response = this.consumeResponse();
    if (!response) {
      throw new Error(ERROR_NO_RESPONSE);
    }

    if (response.action !== ACTION.LOCK) {
      this.raiseProtocolError(
        `Unexpected response action: ${response.action}. Expected: ${ACTION.LOCK}`,
      );
    }

    if (response.state !== CLIENT_STATE.ACQUIRED) {
      this.raiseProtocolError(
        `Unexpected response state: ${response.state}. Expected: ${CLIENT_STATE.ACQUIRED}`,
      );
    }

    if (this._lockId != null && response.id !== this._lockId) {
      this.raiseProtocolError(
        `Unexpected lock id: ${response.id}. Expected: ${this._lockId}`,
      );
    }

    this._currentState = response.state;
    this._lockId = response.id;

    return true;
  }

  // Release last enqueues or acquired lock. After that, you may lock() again
  async release() {
    this.checkError();

    if (this._currentState === CLIENT_STATE.READY) {
      throw new Error(`Cannot release in current state: ${this._currentState}`);
    }

    this.released = true;
    this.ee.emit(EVENT_NEXT, PAYLOAD_RELEASE);

    const msg: RequestMessage = {
      action: ACTION.RELEASE,
    };

    this.sendRequest(msg);
    await this.waitForResponseOrEvent();
    let response = this.consumeResponse();

    if (!response) {
      throw new Error(ERROR_NO_RESPONSE);
    }

    if (
      response.id === this._lockId &&
      response.action === ACTION.LOCK &&
      response.state === CLIENT_STATE.ACQUIRED
    ) {
      // This is the response to the previous Lock() call, skip it

      await this.waitForResponseOrEvent();

      response = this.consumeResponse();

      if (!response) {
        throw new Error(ERROR_NO_RESPONSE);
      }
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

    if (response.state !== CLIENT_STATE.READY) {
      this.raiseProtocolError(
        `Unexpected response state: ${response.state}. Expected: ${CLIENT_STATE.READY}`,
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

        this.ee.emit(EVENT_NEXT, PAYLOAD_RESPONSE);
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

  private consumeResponse(): ResponseMessage | undefined {
    this.checkError();

    const response = this.responseQueue.shift();

    return response;
  }

  private sendRequest(msg: RequestMessage) {
    this.ws!.send(JSON.stringify(msg));
  }

  private async waitForResponseOrEvent(): Promise<EVENT_PAYLOAD> {
    if (this.responseQueue.length > 0) {
      return PAYLOAD_RESPONSE;
    }

    return await new Promise<EVENT_PAYLOAD>((resolve) => {
      this.ee.once(EVENT_NEXT, (event: EVENT_PAYLOAD) => {
        resolve(event);
      });
    });
  }
}
