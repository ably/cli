// @ts-nocheck
/* eslint-env mocha */
/* eslint-disable import/no-extraneous-dependencies */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { expect } from 'chai';
import { AblyCliTerminal } from '../../packages/react-web-cli/src/AblyCliTerminal';
import * as sinon from 'sinon';

// Stub xterm.js & fit addon
sinon.stub(require('@xterm/xterm'), 'Terminal').returns(function () {} as any);
sinon.stub(require('@xterm/addon-fit'), 'FitAddon').returns(function () {} as any);

class MockWs {
  public readyState = 1;
  private listeners: Record<string, Function[]> = {};
  constructor() {
    setTimeout(() => {
      this.emit('message', { data: JSON.stringify({ type: 'status', payload: 'disconnected', reason: 'Session timed out due to inactivity' }) });
      this.emit('close', { code: 1000, reason: 'Session timed out due to inactivity' });
    }, 5);
  }
  send() {}
  close() {}
  addEventListener(evt: string, cb: Function) {
    (this.listeners[evt] = this.listeners[evt] || []).push(cb);
  }
  removeEventListener() {}
  emit(evt: string, arg: any) { (this.listeners[evt] || []).forEach((cb) => cb(arg)); }
}
(global as any).WebSocket = MockWs;

describe('Web CLI inactivity timeout', () => {
  it('ends in "disconnected" state and shows manual prompt', async () => {
    const { container } = render(React.createElement(AblyCliTerminal, { websocketUrl: 'ws://dummy', ablyApiKey: 'k' }));
    await act(async () => {
      await waitFor(() => {
        if (!container.querySelector('.ably-overlay')) throw new Error('wait');
      });
    });
    const state = (window as any).getAblyCliTerminalReactState?.();
    expect(state.componentConnectionStatus).to.equal('disconnected');
    expect(state.showManualReconnectPrompt).to.equal(true);
  });
}); 