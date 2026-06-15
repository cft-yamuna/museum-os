import type { ReactNode } from 'react';

const BOLD_SEGMENT_PATTERN = /\*([^*]+)\*/g;

export function renderAsteriskBold(text: string): ReactNode[] {
  if (!text) return [''];

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;
  let match = BOLD_SEGMENT_PATTERN.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(<strong key={`bold-${matchIndex}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
    matchIndex += 1;
    match = BOLD_SEGMENT_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}
