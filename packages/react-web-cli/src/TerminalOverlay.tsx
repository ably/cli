import React, { useEffect, useRef } from 'react';

export type OverlayVariant = 'connecting' | 'reconnecting' | 'error' | 'maxAttempts';

export interface TerminalOverlayProps {
  variant: OverlayVariant;
  title: string;
  lines: string[];
}

export const TerminalOverlay: React.FC<TerminalOverlayProps> = ({ variant, title, lines }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // No-op effect retained in case future diagnostics are needed
  useEffect(() => {}, []);

  // Critical layout styles for outer dim/backdrop
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'rgba(0,0,0,0.6)',
    pointerEvents: 'none',
    zIndex: 10,
  };

  // Colours per variant (kept inline so no external CSS needed)
  const variantColour: Record<OverlayVariant, string> = {
    connecting: '#3af',
    reconnecting: '#fd0',
    error: '#f44',
    maxAttempts: '#f44',
  };

  const boxStyle: React.CSSProperties = {
    background: '#000',
    opacity: 0.9,
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: '16px',
    padding: '4px 8px',
    maxWidth: '80%',
    border: `1px solid ${variantColour[variant]}`,
  };

  return (
    <div ref={overlayRef} className={`ably-overlay ably-${variant}`} style={overlayStyle} data-testid="ably-overlay">
      {/* diagnostics removed for production */}
      {(() => {
        // Build ASCII box dynamically
        const visibleLines = [title, ...lines];

        // Calculate width of longest line (strip tags just in case)
        const longest = visibleLines.reduce((m, l) => Math.max(m, stripHtml(l).length), 0);
        const contentWidth = Math.max(longest, 10); // at least 10 chars
        const horizontal = '-'.repeat(contentWidth + 2); // +2 for padding spaces

        const pad = (str: string) => str.padEnd(contentWidth, ' ');
        const linesNodes: React.ReactNode[] = [];

        const newline = '\n';

        const pushBorderLine = (text: string) => {
          linesNodes.push(
            <span key={linesNodes.length} style={{ color: variantColour[variant] }}>{text}{newline}</span>
          );
        };

        const pushContentLine = (plain: string, idx: number) => {
          const padded = pad(plain);

          let col = '#fff';
          if (plain.startsWith('Next attempt')) col = '#777';
          else if (plain.startsWith('Press')) col = '#0af';
          else if (idx === 0) col = variantColour[variant];

          linesNodes.push(
            <React.Fragment key={linesNodes.length}>
              <span style={{ color: variantColour[variant] }}>| </span>
              <span style={{ color: col, display: 'inline-block', width: `${contentWidth}ch` }}>{padded}</span>
              <span style={{ color: variantColour[variant] }}> |{newline}</span>
            </React.Fragment>
          );
        };

        // top border
        pushBorderLine(`+${horizontal}+`);

        visibleLines.forEach((ln, idx) => pushContentLine(typeof ln === 'string' ? ln : stripHtml(String(ln)), idx));

        // bottom border
        pushBorderLine(`+${horizontal}+`);

        return <pre style={{ ...boxStyle, whiteSpace: 'pre' }}>{linesNodes}</pre>;
      })()}
    </div>
  );
};

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

export default TerminalOverlay;