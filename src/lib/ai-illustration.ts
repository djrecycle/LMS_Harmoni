import { AiError } from "./ai-error";

/**
 * Illustrations drawn by a text AI (Claude) as SVG code. The browser turns the SVG into a PNG (svg-render.ts), so
 * what is stored and shown everywhere (exam, Word file) is an ordinary picture. The SVG itself is never served.
 */

export type IllustrationShape = "question" | "option";

/** Canvas size of the drawing (the PNG is made at twice this size). */
export const ILLUSTRATION_SIZE: Record<IllustrationShape, { width: number; height: number }> = {
  question: { width: 800, height: 600 },
  option: { width: 600, height: 600 },
};

export const ILLUSTRATION_SYSTEM = `You are an illustrator for Indonesian school music lessons (SMP/SMA). You draw pictures as SVG code.
Rules:
- Reply with ONLY one complete <svg> element: no explanation, no markdown code fence.
- Use only basic SVG shapes, paths, gradients and <text>. No <script>, no <foreignObject>, no <image>, no external links, fonts or CSS imports, no animation.
- Clean flat illustration style for students: clear outlines, friendly colors, good contrast, a plain light background (a full-size rect).
- Draw things correctly: instruments with their real shape and parts (e.g. a soprano recorder has 7 holes on the front and a thumb hole at the back; a pianika has a keyboard and a mouthpiece), keyboards with the right pattern of black keys (groups of 2 and 3), staff notation on 5 lines.
- Do NOT write words, letters or numbers in the picture unless the description asks for them; if it does, use font-family="Arial, Helvetica, sans-serif".
- Keep the code compact (under 25 KB): reuse shapes with <g> and <use href="#id">, no needless detail.`;

export function illustrationPrompt(description: string, shape: IllustrationShape) {
  const { width, height } = ILLUSTRATION_SIZE[shape];
  return [
    `Draw this picture as SVG with viewBox="0 0 ${width} ${height}".`,
    shape === "option"
      ? "It is ONE answer choice of a multiple-choice question: show only the thing described, centered, filling most of the frame."
      : "It goes with the question text and helps students answer it.",
    `Picture description (from the teacher, may be in Indonesian): ${description}`,
  ].join("\n");
}

const MAX_SVG = 400_000;
/** Elements that could run code, load something from outside, or animate: removed with their content. */
const BLOCKED = "script|foreignObject|iframe|object|embed|audio|video|image|animate\\w*|set";

/**
 * The <svg> element from the AI reply, made safe and given a fixed pixel size so a browser can draw it on a canvas:
 * scripts, foreign content, event handlers and links to anything outside the drawing are removed.
 */
export function cleanSvg(reply: string, shape: IllustrationShape): string {
  const match = /<svg[\s>][\s\S]*<\/svg>/i.exec(reply);
  if (!match) throw new AiError("The AI did not draw a picture. Try again or describe it differently.");
  let svg = match[0];
  if (svg.length > MAX_SVG) throw new AiError("The AI drawing is too large. Ask for a simpler picture.");

  svg = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(new RegExp(`<(${BLOCKED})\\b[^>]*\\/>`, "gi"), "")
    .replace(new RegExp(`<(${BLOCKED})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "")
    .replace(new RegExp(`<\\/?(${BLOCKED})\\b[^>]*>`, "gi"), "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Only links inside the drawing (#id) are kept: <use href="#a">, fill="url(#g)".
    .replace(/\s+(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none")
    .replace(/@import[^;]*;?/gi, "");

  const { width, height } = ILLUSTRATION_SIZE[shape];
  svg = svg.replace(/^<svg\b[^>]*>/i, (open) => {
    const viewBox = /\sviewBox\s*=\s*("[^"]*"|'[^']*')/i.exec(open)?.[1] ?? `"0 0 ${width} ${height}"`;
    const attrs = open
      .replace(/^<svg\b/i, "")
      .replace(/>$/, "")
      .replace(/\s(width|height|viewBox|xmlns|xmlns:xlink)\s*=\s*("[^"]*"|'[^']*')/gi, "");
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox=${viewBox}${attrs.replace(/\/$/, "")}>`;
  });
  return svg;
}
