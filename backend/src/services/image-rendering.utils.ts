import path from "path";
import { promises as fs } from "fs";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";

const FONT_FAMILY = "Roboto";
let fontsReady: Promise<void> | null = null;

export const STYLE = {
  margin: 32,
  bodyFontSize: 14,
  smallFontSize: 12,
  headingFontSize: 18,
  titleFontSize: 28,
  cellPaddingX: 8,
  cellPaddingY: 6,
  lineGap: 1.35,
  sectionBarHeight: 28,
  blockGap: 10,
  bg: "#ffffff",
  fg: "#1a1a1d",
  muted: "#5a5a64",
  sectionBarFill: "#e4e4ea",
  tableHeadFill: "#d2d2da",
  tableBorder: "#bec3cd",
  rowAltFill: "#fafafa",
  kalkFill: "#f5fafc",
  negativeFg: "#a03232",
  minImageWidth: 800,
  defaultValueColumnMaxWidth: 1200,
};

function fontPathCandidates(name: string): string[] {
  return [
    path.resolve(__dirname, `../../fonts/${name}`),
    path.resolve(process.cwd(), `fonts/${name}`),
  ];
}

async function resolveFontPath(name: string): Promise<string> {
  for (const p of fontPathCandidates(name)) {
    try {
      await fs.access(p);
      return p;
    } catch {
      continue;
    }
  }
  throw new Error(`Font ${name} not found for image generation.`);
}

export function ensureRobotoRegistered(): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      const regular = await resolveFontPath("Roboto-Regular.ttf");
      const bold = await resolveFontPath("Roboto-Bold.ttf");
      GlobalFonts.registerFromPath(regular, FONT_FAMILY);
      GlobalFonts.registerFromPath(bold, FONT_FAMILY);
    })();
  }
  return fontsReady;
}

function fontString(size: number, bold = false): string {
  return `${bold ? "bold " : ""}${size}px "${FONT_FAMILY}"`;
}

function wrapParagraph(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  if (text === "") return [""];
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const tokens = text.split(/(\s+)/);
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const candidate = line + token;
    if (ctx.measureText(candidate.trimEnd()).width > maxWidth) {
      if (line.trim() !== "") {
        lines.push(line.trimEnd());
        line = token.replace(/^\s+/, "");
      } else {
        const chunks = charBreak(ctx, candidate, maxWidth);
        lines.push(...chunks.slice(0, -1));
        line = chunks[chunks.length - 1] ?? "";
      }
    } else {
      line = candidate;
    }
  }
  if (line.trim() !== "") lines.push(line.trimEnd());
  return lines;
}

function charBreak(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of Array.from(text)) {
    if (ctx.measureText(buf + ch).width > maxWidth && buf !== "") {
      out.push(buf);
      buf = ch;
    } else {
      buf += ch;
    }
  }
  if (buf !== "") out.push(buf);
  return out;
}

function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const value = text === undefined || text === null ? "" : String(text);
  const out: string[] = [];
  for (const para of value.split(/\r?\n/)) {
    out.push(...wrapParagraph(ctx, para, maxWidth));
  }
  return out.length > 0 ? out : [""];
}

export type Align = "left" | "center" | "right";

export interface ColumnSpec {
  align?: Align;
  maxWidth?: number;
  minWidth?: number;
  color?: string;
}

export type RowClassifier = (rowIndex: number, label: string) => "bold" | "negative" | undefined;

export interface TableSpec {
  head?: string[];
  body: string[][];
  columns?: ColumnSpec[];
  fontSize?: number;
  headFontSize?: number;
  headFill?: string;
  bodyFill?: string;
  rowAltFill?: string;
  border?: string;
  borderless?: boolean;
  rowClassifier?: RowClassifier;
}

interface TableLayout {
  width: number;
  height: number;
  columnWidths: number[];
  headHeight: number;
  rowHeights: number[];
  wrappedHead: string[][];
  wrappedBody: string[][][];
  spec: TableSpec;
}

function measureTable(ctx: SKRSContext2D, t: TableSpec): TableLayout {
  const fSize = t.fontSize ?? STYLE.bodyFontSize;
  const hSize = t.headFontSize ?? fSize;
  const numCols = Math.max(t.head?.length ?? 0, ...t.body.map((r) => r.length), 1);
  const cols: ColumnSpec[] = Array.from({ length: numCols }, (_, i) => t.columns?.[i] ?? {});
  const padX = STYLE.cellPaddingX;
  const padY = STYLE.cellPaddingY;

  const naturalText = new Array<number>(numCols).fill(0);
  if (t.head) {
    ctx.font = fontString(hSize, true);
    for (let i = 0; i < numCols; i++) {
      const w = ctx.measureText(t.head[i] ?? "").width;
      if (w > naturalText[i]) naturalText[i] = w;
    }
  }
  ctx.font = fontString(fSize, false);
  for (const row of t.body) {
    for (let i = 0; i < numCols; i++) {
      const w = ctx.measureText(row[i] ?? "").width;
      if (w > naturalText[i]) naturalText[i] = w;
    }
  }

  const columnWidths = naturalText.map((w, i) => {
    let cw = w + 2 * padX;
    const col = cols[i];
    if (col.minWidth && cw < col.minWidth) cw = col.minWidth;
    if (col.maxWidth && cw > col.maxWidth) cw = col.maxWidth;
    return Math.ceil(cw);
  });

  const wrappedHead: string[][] = [];
  let headHeight = 0;
  if (t.head) {
    ctx.font = fontString(hSize, true);
    let maxLines = 1;
    for (let i = 0; i < numCols; i++) {
      const lines = wrapText(ctx, t.head[i] ?? "", columnWidths[i] - 2 * padX);
      wrappedHead.push(lines);
      if (lines.length > maxLines) maxLines = lines.length;
    }
    headHeight = Math.ceil(maxLines * hSize * STYLE.lineGap + 2 * padY);
  }

  ctx.font = fontString(fSize, false);
  const wrappedBody: string[][][] = [];
  const rowHeights: number[] = [];
  for (const row of t.body) {
    const cells: string[][] = [];
    let maxLines = 1;
    for (let i = 0; i < numCols; i++) {
      const lines = wrapText(ctx, row[i] ?? "", columnWidths[i] - 2 * padX);
      cells.push(lines);
      if (lines.length > maxLines) maxLines = lines.length;
    }
    wrappedBody.push(cells);
    rowHeights.push(Math.ceil(maxLines * fSize * STYLE.lineGap + 2 * padY));
  }

  return {
    width: columnWidths.reduce((a, b) => a + b, 0),
    height: headHeight + rowHeights.reduce((a, b) => a + b, 0),
    columnWidths,
    headHeight,
    rowHeights,
    wrappedHead,
    wrappedBody,
    spec: t,
  };
}

function drawCellLines(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  cellWidth: number,
  fontSize: number,
  lines: string[],
  align: Align,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.textAlign = align;
  const lineH = fontSize * STYLE.lineGap;
  let ax = x;
  if (align === "center") ax = x + cellWidth / 2;
  else if (align === "right") ax = x + cellWidth;
  let dy = y;
  for (const line of lines) {
    ctx.fillText(line, ax, dy);
    dy += lineH;
  }
}

function drawTable(ctx: SKRSContext2D, x: number, y: number, layout: TableLayout): void {
  const t = layout.spec;
  const fSize = t.fontSize ?? STYLE.bodyFontSize;
  const hSize = t.headFontSize ?? fSize;
  const padX = STYLE.cellPaddingX;
  const padY = STYLE.cellPaddingY;
  const cols = layout.columnWidths;
  const headFill = t.headFill ?? STYLE.tableHeadFill;
  const bodyFill = t.bodyFill ?? null;
  const altFill = t.rowAltFill ?? null;
  const border = t.border ?? STYLE.tableBorder;

  let cy = y;

  if (layout.headHeight > 0) {
    ctx.fillStyle = headFill;
    ctx.fillRect(x, cy, layout.width, layout.headHeight);
    ctx.font = fontString(hSize, true);
    let cx = x;
    for (let i = 0; i < cols.length; i++) {
      drawCellLines(
        ctx,
        cx + padX,
        cy + padY,
        cols[i] - 2 * padX,
        hSize,
        layout.wrappedHead[i] ?? [""],
        t.columns?.[i]?.align ?? "left",
        STYLE.fg
      );
      cx += cols[i];
    }
    cy += layout.headHeight;
  }

  for (let r = 0; r < t.body.length; r++) {
    const rh = layout.rowHeights[r];
    const labelText = t.body[r]?.[0] ?? "";
    const klass = t.rowClassifier?.(r, labelText);
    let rowFill: string | null = bodyFill;
    if (altFill && r % 2 === 1) rowFill = altFill;
    if (rowFill) {
      ctx.fillStyle = rowFill;
      ctx.fillRect(x, cy, layout.width, rh);
    }
    let cx = x;
    for (let i = 0; i < cols.length; i++) {
      const lines = layout.wrappedBody[r]?.[i] ?? [""];
      const colSpec = t.columns?.[i];
      const align = colSpec?.align ?? "left";
      const bold = klass === "bold";
      const fg =
        klass === "negative" ? STYLE.negativeFg : (colSpec?.color ?? STYLE.fg);
      ctx.font = fontString(fSize, bold);
      drawCellLines(ctx, cx + padX, cy + padY, cols[i] - 2 * padX, fSize, lines, align, fg);
      cx += cols[i];
    }
    cy += rh;
  }

  if (t.borderless) return;

  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x + 0.5, y + 0.5, layout.width - 1, layout.height - 1);
  let cx = x;
  for (let i = 0; i < cols.length - 1; i++) {
    cx += cols[i];
    ctx.moveTo(cx + 0.5, y);
    ctx.lineTo(cx + 0.5, y + layout.height);
  }
  let yy = y;
  if (layout.headHeight > 0) {
    yy += layout.headHeight;
    ctx.moveTo(x, yy + 0.5);
    ctx.lineTo(x + layout.width, yy + 0.5);
  }
  for (let r = 0; r < layout.rowHeights.length - 1; r++) {
    yy += layout.rowHeights[r];
    ctx.moveTo(x, yy + 0.5);
    ctx.lineTo(x + layout.width, yy + 0.5);
  }
  ctx.stroke();
}

export type Block =
  | { kind: "spacer"; height: number }
  | { kind: "text"; text: string; fontSize?: number; bold?: boolean; color?: string; align?: Align }
  | {
      kind: "title-line";
      left: { text: string; fontSize: number; bold?: boolean };
      right?: { text: string; fontSize: number };
    }
  | { kind: "section-bar"; text: string; fontSize?: number; height?: number }
  | { kind: "table"; spec: TableSpec };

interface MeasuredBlock {
  block: Block;
  width: number;
  height: number;
  layout?: TableLayout;
}

export class ImagePage {
  private blocks: Block[] = [];

  add(block: Block): void {
    this.blocks.push(block);
  }

  spacer(height: number): void {
    this.blocks.push({ kind: "spacer", height });
  }

  text(text: string, opts?: { fontSize?: number; bold?: boolean; color?: string; align?: Align }): void {
    this.blocks.push({ kind: "text", text, ...opts });
  }

  titleLine(
    left: { text: string; fontSize: number; bold?: boolean },
    right?: { text: string; fontSize: number }
  ): void {
    this.blocks.push({ kind: "title-line", left, right });
  }

  sectionBar(text: string, opts?: { fontSize?: number; height?: number }): void {
    this.blocks.push({ kind: "section-bar", text, ...opts });
  }

  table(spec: TableSpec): void {
    this.blocks.push({ kind: "table", spec });
  }

  async toPng(opts?: { minWidth?: number }): Promise<Buffer> {
    await ensureRobotoRegistered();

    const measureCanvas = createCanvas(1, 1);
    const mctx = measureCanvas.getContext("2d");

    const measured: MeasuredBlock[] = this.blocks.map((block) => {
      switch (block.kind) {
        case "spacer":
          return { block, width: 0, height: block.height };
        case "text": {
          const size = block.fontSize ?? STYLE.bodyFontSize;
          mctx.font = fontString(size, block.bold);
          return {
            block,
            width: Math.ceil(mctx.measureText(block.text).width),
            height: Math.ceil(size * STYLE.lineGap),
          };
        }
        case "title-line": {
          mctx.font = fontString(block.left.fontSize, block.left.bold);
          const lw = mctx.measureText(block.left.text).width;
          let rw = 0;
          if (block.right) {
            mctx.font = fontString(block.right.fontSize, false);
            rw = mctx.measureText(block.right.text).width;
          }
          const height = Math.ceil(
            Math.max(block.left.fontSize, block.right?.fontSize ?? 0) * STYLE.lineGap
          );
          return {
            block,
            width: Math.ceil(lw + (block.right ? rw + 32 : 0)),
            height,
          };
        }
        case "section-bar": {
          const size = block.fontSize ?? STYLE.headingFontSize;
          mctx.font = fontString(size, false);
          const w = mctx.measureText(block.text).width;
          const h = block.height ?? STYLE.sectionBarHeight;
          return { block, width: Math.ceil(w + 16), height: h };
        }
        case "table": {
          const layout = measureTable(mctx, block.spec);
          return { block, width: layout.width, height: layout.height, layout };
        }
      }
    });

    const margin = STYLE.margin;
    const naturalWidth = measured.reduce((m, b) => Math.max(m, b.width), 0);
    const width = Math.max(opts?.minWidth ?? STYLE.minImageWidth, naturalWidth + 2 * margin);
    const contentWidth = width - 2 * margin;

    const totalContentHeight = measured.reduce(
      (acc, b, i) => acc + b.height + (i === 0 ? 0 : STYLE.blockGap),
      0
    );
    const height = Math.ceil(totalContentHeight + 2 * margin);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = STYLE.bg;
    ctx.fillRect(0, 0, width, height);

    let y = margin;
    for (let i = 0; i < measured.length; i++) {
      if (i > 0) y += STYLE.blockGap;
      const mb = measured[i];
      drawMeasuredBlock(ctx, margin, y, contentWidth, mb);
      y += mb.height;
    }

    return canvas.toBuffer("image/png");
  }
}

function drawMeasuredBlock(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  contentWidth: number,
  mb: MeasuredBlock
): void {
  const { block } = mb;
  switch (block.kind) {
    case "spacer":
      return;
    case "text": {
      const size = block.fontSize ?? STYLE.bodyFontSize;
      ctx.font = fontString(size, block.bold);
      ctx.fillStyle = block.color ?? STYLE.fg;
      ctx.textBaseline = "top";
      const align = block.align ?? "left";
      ctx.textAlign = align;
      const ax = align === "right" ? x + contentWidth : align === "center" ? x + contentWidth / 2 : x;
      ctx.fillText(block.text, ax, y);
      return;
    }
    case "title-line": {
      ctx.fillStyle = STYLE.fg;
      ctx.textBaseline = "top";
      ctx.font = fontString(block.left.fontSize, block.left.bold);
      ctx.textAlign = "left";
      ctx.fillText(block.left.text, x, y);
      if (block.right) {
        ctx.font = fontString(block.right.fontSize, false);
        ctx.fillStyle = STYLE.muted;
        ctx.textAlign = "right";
        const dy = (block.left.fontSize - block.right.fontSize) * 0.5;
        ctx.fillText(block.right.text, x + contentWidth, y + Math.max(0, dy));
      }
      return;
    }
    case "section-bar": {
      const size = block.fontSize ?? STYLE.headingFontSize;
      const h = block.height ?? STYLE.sectionBarHeight;
      ctx.fillStyle = STYLE.sectionBarFill;
      ctx.fillRect(x, y, contentWidth, h);
      ctx.font = fontString(size, false);
      ctx.fillStyle = STYLE.fg;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(block.text, x + 10, y + h / 2);
      return;
    }
    case "table": {
      if (mb.layout) drawTable(ctx, x, y, mb.layout);
      return;
    }
  }
}

export function formatGeneratedAt(d: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(d);
}
