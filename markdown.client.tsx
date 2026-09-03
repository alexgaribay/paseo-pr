import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactNode } from "react";
import { Image, Text, View } from "react-native";
import { isAllowedHttpsUrl, openHttpsUrl, resolveMarkdownUrl } from "./open-url.client";

type MarkdownInline =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "strong"; children: MarkdownInline[] }
  | { kind: "em"; children: MarkdownInline[] }
  | { kind: "del"; children: MarkdownInline[] }
  | { kind: "link"; href: string; children: MarkdownInline[] }
  | { kind: "image"; alt: string; href: string };

type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; value: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: MarkdownListItem[] }
  | { kind: "image"; alt: string; href: string }
  | { kind: "hr" };

interface MarkdownListItem {
  text: string;
  checked: boolean | null;
}

export function MarkdownBody(props: {
  theme: PluginTheme;
  compact: boolean;
  platform: "ios" | "android" | "web";
  source: string;
  host: string;
  baseUrl: string;
}) {
  const blocks = parseBlocks(props.source);
  if (blocks.length === 0) return null;
  const styles = markdownStyles(props.theme, props.platform);
  return (
    <View style={{ gap: props.compact ? 8 : 10 }}>
      {blocks.map((block, index) => (
        <MarkdownBlockView
          key={`${block.kind}:${index}`}
          block={block}
          styles={styles}
          theme={props.theme}
          platform={props.platform}
          compact={props.compact}
          host={props.host}
          baseUrl={props.baseUrl}
          depth={0}
        />
      ))}
    </View>
  );
}

function MarkdownBlockView(props: {
  block: MarkdownBlock;
  styles: ReturnType<typeof markdownStyles>;
  theme: PluginTheme;
  platform: "ios" | "android" | "web";
  compact: boolean;
  host: string;
  baseUrl: string;
  depth: number;
}) {
  const { block, styles } = props;
  if (block.kind === "heading") {
    return (
      <Text selectable style={headingStyle(styles, block.level)}>
        {renderInlines(parseInlines(block.text), props)}
      </Text>
    );
  }
  if (block.kind === "paragraph") {
    return (
      <Text selectable style={styles.paragraph}>
        {renderInlines(parseInlines(block.text), props)}
      </Text>
    );
  }
  if (block.kind === "code") {
    return (
      <View style={styles.codeBlock}>
        <Text selectable style={styles.codeText}>
          {block.value}
        </Text>
      </View>
    );
  }
  if (block.kind === "hr") {
    return <View style={styles.hr} />;
  }
  if (block.kind === "image") {
    return <MarkdownImage alt={block.alt} href={block.href} styles={styles} host={props.host} baseUrl={props.baseUrl} />;
  }
  if (block.kind === "quote") {
    if (props.depth >= 3) {
      return (
        <View style={styles.quote}>
          <Text selectable style={styles.paragraph}>
            {block.text}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.quote}>
        {parseBlocks(block.text).map((child, index) => (
          <MarkdownBlockView
            key={`quote:${index}`}
            block={child}
            styles={styles}
            theme={props.theme}
            platform={props.platform}
            compact={props.compact}
            host={props.host}
            baseUrl={props.baseUrl}
            depth={props.depth + 1}
          />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {block.items.map((item, index) => (
        <View key={`${index}:${item.text}`} style={styles.listItem}>
          <Text style={styles.listMark}>
            {item.checked === true ? "☑" : item.checked === false ? "☐" : block.ordered ? `${index + 1}.` : "•"}
          </Text>
          <Text selectable style={styles.listText}>
            {renderInlines(parseInlines(item.text), props)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MarkdownImage(props: {
  alt: string;
  href: string;
  styles: ReturnType<typeof markdownStyles>;
  host: string;
  baseUrl: string;
}) {
  const resolved = resolveMarkdownUrl(props.href, props.baseUrl);
  if (!resolved || !isAllowedHttpsUrl(resolved, props.host)) {
    return props.alt.length > 0 ? <Text style={props.styles.muted}>{props.alt}</Text> : null;
  }
  return (
    <Image
      accessibilityLabel={props.alt.length > 0 ? props.alt : "Image"}
      source={{ uri: resolved }}
      resizeMode="contain"
      style={props.styles.image}
    />
  );
}

function renderInlines(
  nodes: MarkdownInline[],
  ctx: {
    styles: ReturnType<typeof markdownStyles>;
    host: string;
    baseUrl: string;
  },
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${node.kind}:${index}`;
    if (node.kind === "text") {
      return (
        <Text key={key} selectable>
          {node.value}
        </Text>
      );
    }
    if (node.kind === "code") {
      return (
        <Text key={key} selectable style={ctx.styles.inlineCode}>
          {node.value}
        </Text>
      );
    }
    if (node.kind === "strong") {
      return (
        <Text key={key} selectable style={ctx.styles.strong}>
          {renderInlines(node.children, ctx)}
        </Text>
      );
    }
    if (node.kind === "em") {
      return (
        <Text key={key} selectable style={ctx.styles.em}>
          {renderInlines(node.children, ctx)}
        </Text>
      );
    }
    if (node.kind === "del") {
      return (
        <Text key={key} selectable style={ctx.styles.del}>
          {renderInlines(node.children, ctx)}
        </Text>
      );
    }
    if (node.kind === "image") {
      return (
        <Text key={key} selectable style={ctx.styles.muted}>
          {node.alt.length > 0 ? node.alt : "image"}
        </Text>
      );
    }
    const href = resolveMarkdownUrl(node.href, ctx.baseUrl);
    if (!href || !isAllowedHttpsUrl(href, ctx.host)) {
      return (
        <Text key={key} selectable style={ctx.styles.linkMuted}>
          {renderInlines(node.children, ctx)}
        </Text>
      );
    }
    return (
      <Text
        key={key}
        selectable
        style={ctx.styles.link}
        onPress={() => {
          openHttpsUrl(href, ctx.host);
        }}
      >
        {renderInlines(node.children, ctx)}
      </Text>
    );
  });
}

function parseBlocks(markdown: string): MarkdownBlock[] {
  const source = markdown.replace(/\r\n/gu, "\n").replace(/<!--[\s\S]*?-->/gu, "");
  const lines = source.split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", value: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^(\*\s*){3,}$/u.test(line.trim()) || /^(-{3,}|_{3,})\s*$/u.test(line.trim())) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }

    const onlyImage = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/u.exec(line.trim());
    if (onlyImage) {
      blocks.push({ kind: "image", alt: onlyImage[1], href: onlyImage[2] });
      index += 1;
      continue;
    }

    if (/^>\s?/u.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^>\s?/u, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", text: quote.join("\n") });
      continue;
    }

    const unordered = parseList(lines, index, false);
    if (unordered) {
      blocks.push({ kind: "list", ordered: false, items: unordered.items });
      index = unordered.next;
      continue;
    }

    const ordered = parseList(lines, index, true);
    if (ordered) {
      blocks.push({ kind: "list", ordered: true, items: ordered.items });
      index = ordered.next;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim().length === 0 || isBlockStart(current)) break;
      paragraph.push(current);
      index += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    }
  }

  return blocks;
}

function parseList(
  lines: string[],
  start: number,
  ordered: boolean,
): { items: MarkdownListItem[]; next: number } | null {
  const items: MarkdownListItem[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const match = ordered
      ? /^\d+[.)]\s+(.+)$/u.exec(line)
      : /^[-*+]\s+(?:\[([ xX])\]\s+)?(.+)$/u.exec(line);
    if (!match) break;
    if (ordered) {
      items.push({ text: match[1], checked: null });
    } else {
      const mark = match[1];
      items.push({
        text: match[2],
        checked: mark === undefined ? null : mark.toLowerCase() === "x",
      });
    }
    index += 1;
  }
  if (items.length === 0) return null;
  return { items, next: index };
}

function isBlockStart(line: string): boolean {
  if (line.startsWith("```")) return true;
  if (/^#{1,6}\s+/u.test(line)) return true;
  if (/^>\s?/u.test(line)) return true;
  if (/^(\*\s*){3,}$/u.test(line.trim()) || /^(-{3,}|_{3,})\s*$/u.test(line.trim())) return true;
  if (/^[-*+]\s+/u.test(line) || /^\d+[.)]\s+/u.test(line)) return true;
  return false;
}

function parseInlines(input: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let index = 0;
  let textStart = 0;

  const flush = (end: number) => {
    if (end > textStart) nodes.push({ kind: "text", value: input.slice(textStart, end) });
  };

  while (index < input.length) {
    if (input.startsWith("![", index)) {
      const match = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/u.exec(input.slice(index));
      if (match) {
        flush(index);
        nodes.push({ kind: "image", alt: match[1], href: match[2] });
        index += match[0].length;
        textStart = index;
        continue;
      }
    }
    if (input[index] === "[") {
      const match = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/u.exec(input.slice(index));
      if (match) {
        flush(index);
        nodes.push({ kind: "link", href: match[2], children: parseInlines(match[1]) });
        index += match[0].length;
        textStart = index;
        continue;
      }
    }
    if (input[index] === "`") {
      const match = /^`([^`]+)`/u.exec(input.slice(index));
      if (match) {
        flush(index);
        nodes.push({ kind: "code", value: match[1] });
        index += match[0].length;
        textStart = index;
        continue;
      }
    }
    if (input.startsWith("**", index) || input.startsWith("__", index)) {
      const delim = input.slice(index, index + 2);
      const close = input.indexOf(delim, index + 2);
      if (close > index + 2) {
        flush(index);
        nodes.push({ kind: "strong", children: parseInlines(input.slice(index + 2, close)) });
        index = close + 2;
        textStart = index;
        continue;
      }
    }
    if (input.startsWith("~~", index)) {
      const close = input.indexOf("~~", index + 2);
      if (close > index + 2) {
        flush(index);
        nodes.push({ kind: "del", children: parseInlines(input.slice(index + 2, close)) });
        index = close + 2;
        textStart = index;
        continue;
      }
    }
    const mark = input[index];
    if (mark === "*" || mark === "_") {
      const prev = index === 0 ? "" : input[index - 1] ?? "";
      const wordy = mark === "_" && /[A-Za-z0-9]/u.test(prev);
      if (!wordy && input[index + 1] !== mark) {
        const close = input.indexOf(mark, index + 1);
        if (close > index + 1) {
          flush(index);
          nodes.push({ kind: "em", children: parseInlines(input.slice(index + 1, close)) });
          index = close + 1;
          textStart = index;
          continue;
        }
      }
    }
    if (input.startsWith("https://", index) || input.startsWith("http://", index)) {
      const match = /^(https?:\/\/[^\s<]+)/u.exec(input.slice(index));
      if (match) {
        const href = match[1].replace(/[),.;:!?]+$/u, "");
        flush(index);
        nodes.push({ kind: "link", href, children: [{ kind: "text", value: href }] });
        index += href.length;
        textStart = index;
        continue;
      }
    }
    index += 1;
  }

  flush(input.length);
  return nodes;
}

function headingStyle(styles: ReturnType<typeof markdownStyles>, level: number) {
  if (level <= 1) return styles.h1;
  if (level === 2) return styles.h2;
  return styles.h3;
}

function markdownStyles(theme: PluginTheme, platform: "ios" | "android" | "web") {
  const mono = platform === "ios" ? "Menlo" : platform === "android" ? "monospace" : "ui-monospace, SFMono-Regular, Menlo, monospace";
  return {
    paragraph: { color: theme.colors.foreground, fontSize: 14, lineHeight: 20 },
    h1: { color: theme.colors.foreground, fontSize: 18, fontWeight: "600" as const, lineHeight: 24 },
    h2: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const, lineHeight: 22 },
    h3: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const, lineHeight: 20 },
    strong: { fontWeight: "600" as const, color: theme.colors.foreground },
    em: { fontStyle: "italic" as const, color: theme.colors.foreground },
    del: { textDecorationLine: "line-through" as const, color: theme.colors.foregroundMuted },
    link: { color: theme.colors.accent, textDecorationLine: "underline" as const },
    linkMuted: { color: theme.colors.foregroundMuted },
    inlineCode: {
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface2,
      fontFamily: mono,
      fontSize: 13,
      paddingHorizontal: 3,
      borderRadius: 4,
    },
    codeBlock: {
      backgroundColor: theme.colors.surface2,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 10,
    },
    codeText: { color: theme.colors.foreground, fontFamily: mono, fontSize: 13, lineHeight: 18 },
    quote: {
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.border,
      paddingLeft: 10,
      gap: 8,
    },
    list: { gap: 6 },
    listItem: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 8 },
    listMark: { color: theme.colors.foregroundMuted, fontSize: 14, lineHeight: 20, minWidth: 16 },
    listText: { color: theme.colors.foreground, fontSize: 14, lineHeight: 20, flex: 1 },
    hr: { height: 1, backgroundColor: theme.colors.border, marginVertical: 4 },
    image: { width: "100%" as const, height: 180, borderRadius: 8, backgroundColor: theme.colors.surface2 },
    muted: { color: theme.colors.foregroundMuted, fontSize: 14 },
  };
}
