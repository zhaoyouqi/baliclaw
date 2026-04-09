import { describe, expect, it } from "vitest";
import { renderTelegramHtmlText, splitTelegramHtmlChunks, splitTelegramMarkdownChunks } from "../src/channel/telegram/format.js";

describe("renderTelegramHtmlText", () => {
  it("renders core markdown patterns into Telegram HTML", () => {
    expect(renderTelegramHtmlText("**bold** and *italic*")).toBe("<b>bold</b> and <i>italic</i>");
    expect(renderTelegramHtmlText("[docs](https://example.com)")).toBe(
      '<a href="https://example.com">docs</a>'
    );
    expect(renderTelegramHtmlText("```js\nconst x = 1;\n```")).toBe(
      "<pre><code>const x = 1;</code></pre>"
    );
    expect(renderTelegramHtmlText("> Quote")).toBe("<blockquote>Quote</blockquote>");
    expect(renderTelegramHtmlText("- item")).toBe("• item");
    expect(renderTelegramHtmlText("| Name | Score |\n| --- | --- |\n| Alice | 10 |")).toBe(
      "<pre><code>Name  | Score\n------|------\nAlice | 10   </code></pre>"
    );
  });
});

describe("splitTelegramMarkdownChunks", () => {
  it("prefers natural boundaries before the hard limit", () => {
    const chunks = splitTelegramMarkdownChunks(`${"a".repeat(3980)}\nsecond line\n${"b".repeat(30)}`, 4000);

    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(`${"a".repeat(3980)}\nsecond line`);
  });
});

describe("splitTelegramHtmlChunks", () => {
  it("keeps HTML tags balanced across chunks", () => {
    const chunks = splitTelegramHtmlChunks(`<b>${"a".repeat(5000)}</b>`, 4000);

    expect(chunks.length).toBe(2);
    expect(chunks[0]).toMatch(/^<b>/);
    expect(chunks[0]).toMatch(/<\/b>$/);
    expect(chunks[1]).toMatch(/^<b>/);
    expect(chunks[1]).toMatch(/<\/b>$/);
  });
});
