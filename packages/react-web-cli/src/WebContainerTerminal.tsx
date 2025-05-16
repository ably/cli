import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { bootstrapShell } from './webcontainer/bootstrap';

export interface WebContainerTerminalProps {
  ablyApiKey?: string;
  ablyAccessToken?: string;
  onConnectionStatusChange?: (status: 'connecting' | 'connected' | 'error') => void;
}

/**
 * **Experimental** – runs the Ably CLI inside a StackBlitz WebContainer directly
 * in the browser.  Very limited feature-set: no reconnection or split panes.
 */
export const WebContainerTerminal: React.FC<WebContainerTerminalProps> = ({
  ablyApiKey = '',
  ablyAccessToken = '',
  onConnectionStatusChange,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal>();
  const fitRef = useRef<FitAddon>();

  useEffect(() => {
    if (!rootRef.current) return;

    // Initialise Xterm
    const term = new Terminal({ convertEol: true, cols: 80, rows: 24 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(rootRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Notify parent that we are booting
    onConnectionStatusChange?.('connecting');

    (async () => {
      try {
        const shell = await bootstrapShell({
          cols: term.cols,
          rows: term.rows,
          env: {
            ABLY_API_KEY: ablyApiKey,
            ABLY_ACCESS_TOKEN: ablyAccessToken,
            ABLY_WEB_CLI_MODE: 'true',
          },
          onOutput(data) {
            term.write(data);
          },
        });

        // Pipe terminal input to shell
        term.onData((d) => shell.write(d));

        // Handle resize
        const handleResize = () => {
          if (!fitRef.current) return;
          fitRef.current.fit();
          shell.resize(term.cols, term.rows);
        };
        window.addEventListener('resize', handleResize);

        onConnectionStatusChange?.('connected');

        return () => {
          window.removeEventListener('resize', handleResize);
          term.dispose();
          // No explicit process kill – when page unloads WC is cleaned.
        };
      } catch (err) {
        console.error('WebContainer boot failed', err);
        onConnectionStatusChange?.('error');
      }
    })();
  }, [ablyApiKey, ablyAccessToken, onConnectionStatusChange]);

  return <div ref={rootRef} style={{ width: '100%', height: '100%' }} />;
}; 