import React, { Fragment, useMemo } from 'react';

interface MarkdownRendererProps {
  text: string;
  className?: string;
}

type Segment =
  | { type: 'text'; value: string }
  | { type: 'code'; lang: string; value: string };

const normalizeEscapedNewlines = (input: string): string => {
  return (input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n');
};

const splitCodeBlocks = (input: string): Segment[] => {
  const segments: Segment[] = [];
  const regex = /```([\w-]+)?\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: 'text', value: input.slice(cursor, match.index) });
    }
    segments.push({
      type: 'code',
      lang: (match[1] || '').trim(),
      value: (match[2] || '').trimEnd(),
    });
    cursor = regex.lastIndex;
  }

  if (cursor < input.length) {
    segments.push({ type: 'text', value: input.slice(cursor) });
  }

  return segments;
};

const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<Fragment key={`${keyPrefix}-txt-${idx++}`}>{text.slice(last, m.index)}</Fragment>);
    }

    const token = m[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${idx++}`} className="font-semibold text-gray-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-code-${idx++}`} className="rounded bg-gray-100 px-1 py-0.5 text-[0.92em] text-gray-800">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={`${keyPrefix}-link-${idx++}`}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
          >
            {link[1]}
          </a>
        );
      } else {
        nodes.push(<Fragment key={`${keyPrefix}-raw-${idx++}`}>{token}</Fragment>);
      }
    }

    last = m.index + token.length;
  }

  if (last < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-tail`}>{text.slice(last)}</Fragment>);
  }

  return nodes;
};

const renderTextBlock = (text: string): React.ReactNode[] => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const textVal = heading[2].trim();
      const className =
        level === 1
          ? 'text-[18px] font-bold text-gray-900 mt-2 mb-2'
          : level === 2
            ? 'text-[15px] font-semibold text-gray-900 mt-2 mb-1.5'
            : 'text-[13px] font-semibold text-gray-800 mt-1.5 mb-1';
      blocks.push(
        <div key={`h-${i}`} className={className}>
          {renderInline(textVal, `h-${i}`)}
        </div>
      );
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').trim());
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="mb-2 list-disc pl-5 text-[13px] text-gray-800 space-y-1">
          {items.map((item, idx) => (
            <li key={`uli-${idx}`}>{renderInline(item, `uli-${i}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, '').trim());
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="mb-2 list-decimal pl-5 text-[13px] text-gray-800 space-y-1">
          {items.map((item, idx) => (
            <li key={`oli-${idx}`}>{renderInline(item, `oli-${i}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s+/.test(lines[i].trim()) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }

    blocks.push(
      <p key={`p-${i}`} className="mb-2 text-[13px] leading-[1.65] text-gray-800 whitespace-pre-wrap">
        {renderInline(paragraph.join(' '), `p-${i}`)}
      </p>
    );
  }

  return blocks;
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text, className }) => {
  const normalizedText = useMemo(() => normalizeEscapedNewlines(text || ''), [text]);
  const segments = useMemo(() => splitCodeBlocks(normalizedText), [normalizedText]);

  return (
    <div className={className || ''}>
      {segments.map((segment, idx) => {
        if (segment.type === 'code') {
          return (
            <div key={`code-${idx}`} className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-950">
              <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1.5 text-[10px] text-gray-300">
                <span>{segment.lang || 'code'}</span>
              </div>
              <pre className="max-h-72 overflow-auto px-3 py-2 text-[12px] leading-relaxed text-gray-100">
                <code>{segment.value}</code>
              </pre>
            </div>
          );
        }

        return <div key={`txt-${idx}`}>{renderTextBlock(segment.value)}</div>;
      })}
    </div>
  );
};
