function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

// Phase 1 note:
// This renderer is intentionally Telegram-specific and string-based. It exists to
// make current bot replies readable in Telegram without pulling in the heavier
// text-runtime stack used by openclaw.
//
// Future direction:
// If BaliClaw starts adding more channels, do not keep expanding this regex-based
// approach into a cross-channel formatter. Move toward an openclaw-compatible
// pipeline: parse markdown/rich text into a channel-agnostic intermediate
// representation, then let each channel render from that IR into its own target
// format (Telegram HTML, Slack mrkdwn, etc.).
export function renderTelegramHtmlText(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];
  const tableBlocks: string[] = [];

  const withTableTokens = replaceMarkdownTables(normalized, tableBlocks);

  let html = escapeHtml(withTableTokens);

  html = html.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_match, code: string) => {
    const token = `@@BALICLAWCODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code>${code.trimEnd()}</code></pre>`);
    return token;
  });

  html = html.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const token = `@@BALICLAWINLINECODE${inlineCodes.length}@@`;
    inlineCodes.push(`<code>${code}</code>`);
    return token;
  });

  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label: string, href: string) => {
    return `<a href="${escapeHtmlAttr(href)}">${label}</a>`;
  });

  const lines = html.split("\n");
  const renderedLines = lines.map((line) => {
    if (line.startsWith("&gt; ")) {
      return `<blockquote>${renderInlineMarkdown(line.slice(5))}</blockquote>`;
    }

    if (/^\s*[-*] /.test(line)) {
      return `• ${renderInlineMarkdown(line.replace(/^\s*[-*] /, ""))}`;
    }

    if (/^\s*\d+\. /.test(line)) {
      return renderInlineMarkdown(line);
    }

    if (/^\s*#{1,6} /.test(line)) {
      return `<b>${renderInlineMarkdown(line.replace(/^\s*#{1,6} /, ""))}</b>`;
    }

    return renderInlineMarkdown(line);
  });

  html = renderedLines.join("\n");

  html = codeBlocks.reduce((result, block, index) => {
    return result.replace(`@@BALICLAWCODEBLOCK${index}@@`, block);
  }, html);

  html = inlineCodes.reduce((result, code, index) => {
    return result.replace(`@@BALICLAWINLINECODE${index}@@`, code);
  }, html);

  html = tableBlocks.reduce((result, table, index) => {
    return result.replace(`@@BALICLAWTABLE${index}@@`, table);
  }, html);

  return html;
}

// This splitter currently serves Telegram text delivery only. The chunking policy
// should eventually live beside a richer text IR so future channels can apply
// their own limits and formatting rules without re-implementing markdown parsing.
export function splitTelegramMarkdownChunks(text: string, limit: number): string[] {
  const normalizedLimit = Math.max(1, limit);
  const normalizedText = text.replace(/\r\n/g, "\n");
  const chunks: string[] = [];
  let remaining = normalizedText;

  while (remaining.length > normalizedLimit) {
    const candidate = remaining.slice(0, normalizedLimit);
    const splitIndex = Math.max(
      candidate.lastIndexOf("\n\n"),
      candidate.lastIndexOf("\n"),
      candidate.lastIndexOf(" ")
    );
    const cut = splitIndex > normalizedLimit / 2 ? splitIndex : normalizedLimit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

type TelegramHtmlTag = {
  name: string;
  openTag: string;
  closeTag: string;
};

const HTML_TAG_PATTERN = /(<\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?>/g;
const TELEGRAM_SELF_CLOSING_HTML_TAGS = new Set(["br"]);

export function splitTelegramHtmlChunks(html: string, limit: number): string[] {
  if (!html) {
    return [];
  }

  const normalizedLimit = Math.max(1, Math.floor(limit));
  if (html.length <= normalizedLimit) {
    return [html];
  }

  const chunks: string[] = [];
  const openTags: TelegramHtmlTag[] = [];
  let current = "";
  let chunkHasPayload = false;

  const resetCurrent = () => {
    current = buildTelegramHtmlOpenPrefix(openTags);
    chunkHasPayload = false;
  };

  const flushCurrent = () => {
    if (!chunkHasPayload) {
      return;
    }

    chunks.push(`${current}${buildTelegramHtmlCloseSuffix(openTags)}`);
    resetCurrent();
  };

  const appendText = (segment: string) => {
    let remaining = segment;

    while (remaining.length > 0) {
      const available = normalizedLimit - current.length - buildTelegramHtmlCloseSuffixLength(openTags);
      if (available <= 0) {
        if (!chunkHasPayload) {
          throw new Error(`Telegram HTML chunk limit exceeded by tag overhead (limit=${normalizedLimit})`);
        }

        flushCurrent();
        continue;
      }

      if (remaining.length <= available) {
        current += remaining;
        chunkHasPayload = true;
        break;
      }

      const splitAt = findTelegramHtmlSafeSplitIndex(remaining, available);
      if (splitAt <= 0) {
        if (!chunkHasPayload) {
          throw new Error(`Telegram HTML chunk limit exceeded by leading entity (limit=${normalizedLimit})`);
        }

        flushCurrent();
        continue;
      }

      current += remaining.slice(0, splitAt);
      chunkHasPayload = true;
      remaining = remaining.slice(splitAt);
      flushCurrent();
    }
  };

  resetCurrent();
  HTML_TAG_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HTML_TAG_PATTERN.exec(html)) !== null) {
    const tagStart = match.index;
    const tagEnd = HTML_TAG_PATTERN.lastIndex;
    appendText(html.slice(lastIndex, tagStart));

    const rawTag = match[0];
    const isClosing = match[1] === "</";
    const tagName = (match[2] ?? "").toLowerCase();
    const isSelfClosing =
      !isClosing && (TELEGRAM_SELF_CLOSING_HTML_TAGS.has(tagName) || rawTag.trimEnd().endsWith("/>"));

    if (!isClosing) {
      const nextCloseLength = isSelfClosing ? 0 : `</${tagName}>`.length;
      if (
        chunkHasPayload &&
        current.length + rawTag.length + buildTelegramHtmlCloseSuffixLength(openTags) + nextCloseLength > normalizedLimit
      ) {
        flushCurrent();
      }
    }

    current += rawTag;
    if (isSelfClosing) {
      chunkHasPayload = true;
    }

    if (isClosing) {
      popTelegramHtmlTag(openTags, tagName);
    } else if (!isSelfClosing) {
      openTags.push({
        name: tagName,
        openTag: rawTag,
        closeTag: `</${tagName}>`
      });
    }

    lastIndex = tagEnd;
  }

  appendText(html.slice(lastIndex));
  flushCurrent();
  return chunks.length > 0 ? chunks : [html];
}

function renderInlineMarkdown(text: string): string {
  let rendered = text;

  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  rendered = rendered.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>");
  rendered = rendered.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<i>$2</i>");
  rendered = rendered.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  rendered = rendered.replace(/\|\|([^|]+)\|\|/g, "<tg-spoiler>$1</tg-spoiler>");

  return rendered;
}

function buildTelegramHtmlOpenPrefix(tags: TelegramHtmlTag[]): string {
  return tags.map((tag) => tag.openTag).join("");
}

function buildTelegramHtmlCloseSuffix(tags: TelegramHtmlTag[]): string {
  return tags
    .slice()
    .reverse()
    .map((tag) => tag.closeTag)
    .join("");
}

function buildTelegramHtmlCloseSuffixLength(tags: TelegramHtmlTag[]): number {
  return tags.reduce((total, tag) => total + tag.closeTag.length, 0);
}

function popTelegramHtmlTag(tags: TelegramHtmlTag[], tagName: string): void {
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    if (tags[index]?.name === tagName) {
      tags.splice(index, 1);
      return;
    }
  }
}

function findTelegramHtmlSafeSplitIndex(text: string, maxLength: number): number {
  if (text.length <= maxLength) {
    return text.length;
  }

  const preferred = Math.max(
    text.lastIndexOf("\n\n", maxLength),
    text.lastIndexOf("\n", maxLength),
    text.lastIndexOf(" ", maxLength)
  );
  let splitAt = preferred > maxLength / 2 ? preferred : maxLength;

  if (text[splitAt] === "&") {
    splitAt -= 1;
  }

  const entityStart = text.lastIndexOf("&", splitAt);
  if (entityStart >= 0) {
    const entityEnd = findTelegramHtmlEntityEnd(text, entityStart);
    if (entityEnd > splitAt) {
      splitAt = entityStart;
    }
  }

  return splitAt;
}

function findTelegramHtmlEntityEnd(text: string, start: number): number {
  if (text[start] !== "&") {
    return -1;
  }

  const end = text.indexOf(";", start + 1);
  if (end < 0) {
    return -1;
  }

  const entityBody = text.slice(start + 1, end);
  if (!/^#?[a-zA-Z0-9]+$/.test(entityBody)) {
    return -1;
  }

  return end + 1;
}

function replaceMarkdownTables(text: string, tableBlocks: string[]): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index] ?? "";
    const next = lines[index + 1];

    if (next && isMarkdownTableHeader(current, next)) {
      const tableLines = [current, next];
      let cursor = index + 2;

      while (cursor < lines.length && isMarkdownTableRow(lines[cursor] ?? "")) {
        tableLines.push(lines[cursor] ?? "");
        cursor += 1;
      }

      const token = `@@BALICLAWTABLE${tableBlocks.length}@@`;
      tableBlocks.push(renderMarkdownTableBlock(tableLines));
      result.push(token);
      index = cursor - 1;
      continue;
    }

    result.push(current);
  }

  return result.join("\n");
}

function isMarkdownTableHeader(header: string, separator: string): boolean {
  return isMarkdownTableRow(header) && isMarkdownTableSeparator(separator);
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.length > 0;
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function renderMarkdownTableBlock(lines: string[]): string {
  const rows = lines.map(splitMarkdownTableRow);
  const header = rows[0] ?? [];
  const body = rows.slice(2);
  const widths = calculateColumnWidths([header, ...body]);
  const renderedRows = [
    formatTableRow(header, widths),
    formatTableSeparator(widths),
    ...body.map((row) => formatTableRow(row, widths))
  ];

  return `<pre><code>${escapeHtml(renderedRows.join("\n"))}</code></pre>`;
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function calculateColumnWidths(rows: string[][]): number[] {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const widths = Array.from({ length: columnCount }, () => 0);

  for (const row of rows) {
    for (let index = 0; index < columnCount; index += 1) {
      const cell = row[index] ?? "";
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    }
  }

  return widths;
}

function formatTableRow(row: string[], widths: number[]): string {
  return row
    .map((cell, index) => padCell(cell ?? "", widths[index] ?? 0))
    .join(" | ");
}

function formatTableSeparator(widths: number[]): string {
  return widths.map((width) => "-".repeat(Math.max(3, width))).join("-|-");
}

function padCell(value: string, width: number): string {
  return value.padEnd(width, " ");
}
