import { decryptText, encryptText, fromBase64Url, toBase64Url } from "@/utils/crypto-utils";

export type EditorSong = {
  id?: string;
  name: string;
  artist: string;
  url: string;
  cover?: string;
  lrc?: string;
};

export type EditorGallery = {
  images: string[];
};

export type SecretMarkerPayload = {
  version: 1;
  salt: string;
  iv: string;
  cipher: string;
};

const encoder = new TextEncoder();

export function encodeMarkerData(data: unknown): string {
  return toBase64Url(encoder.encode(JSON.stringify(data)));
}

export function escapeHtmlAttribute(value: string | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

export function buildInlineMusicMarker(song: EditorSong): string {
  return `::hs-player:v1:${encodeMarkerData(song)}::`;
}

export function buildInlineMusicHtml(song: EditorSong): string {
  return [
    '<div class="hs-music-player" data-hs-music',
    ` data-name="${escapeHtmlAttribute(song.name)}"`,
    ` data-artist="${escapeHtmlAttribute(song.artist)}"`,
    ` data-url="${escapeHtmlAttribute(song.url)}"`,
    ` data-cover="${escapeHtmlAttribute(song.cover)}"`,
    ` data-lrc="${escapeHtmlAttribute(song.lrc)}"`,
    "></div>",
  ].join("");
}

/** 编辑器内的加密块表示：只显示开闭符号与明文，不显示密文 */
export const SECRET_EDITOR_START = "::hs-secret-begin::";
export const SECRET_EDITOR_END = "::hs-secret-end::";

export function buildSecretEditorBlock(plain: string): string {
  return `${SECRET_EDITOR_START}\n${plain}\n${SECRET_EDITOR_END}`;
}

export function buildSecretMarker(payload: SecretMarkerPayload): string {
  return `::hs-secret:v1:${encodeMarkerData(payload)}::`;
}

/**
 * raw（密文）→ 编辑器（明文 + 开闭符号）。解密失败时保留原密文，避免丢数据。
 */
export async function decodeSecretRawForEditor(raw: string, password: string): Promise<string> {
  if (!password) return raw;
  const tokens = raw.match(/::hs-secret:v1:[A-Za-z0-9_-]+::/g) || [];
  if (!tokens.length) return raw;
  let output = raw;
  for (const token of tokens) {
    const payloadText = token.slice("::hs-secret:v1:".length, -2);
    const payload = decodeMarkerData<SecretMarkerPayload>(payloadText);
    if (!payload) continue;
    try {
      const plain = await decryptText(JSON.stringify(payload), password);
      output = output.replace(token, buildSecretEditorBlock(plain));
    } catch (error) {
      console.warn("[hs-secret] 自动解密失败，保留原密文", error);
    }
  }
  return output;
}

/**
 * 编辑器（明文 + 开闭符号）→ raw（密文）。加密失败时保留编辑器原文。
 */
export async function encodeSecretEditorForRaw(editorValue: string, password: string): Promise<string> {
  if (!password) return editorValue;
  const pattern = new RegExp(
    `${SECRET_EDITOR_START}\\s*([\\s\\S]*?)\\s*${SECRET_EDITOR_END}`,
    "g",
  );
  const blocks = [...editorValue.matchAll(pattern)];
  if (!blocks.length) return editorValue;
  let output = editorValue;
  for (const block of blocks) {
    try {
      const encrypted = await encryptText(block[1] ?? "", password);
      const payload = JSON.parse(encrypted) as SecretMarkerPayload;
      output = output.replace(block[0], buildSecretMarker(payload));
    } catch (error) {
      console.warn("[hs-secret] 自动加密失败，保留原明文", error);
    }
  }
  return output;
}

export function buildGalleryMarker(gallery: EditorGallery): string {
  return `::hs-gallery:v1:${encodeMarkerData(gallery)}::`;
}

export function buildMomentMusicMarker(song: EditorSong): string {
  return `::hs-music:v1:${encodeMarkerData(song)}::`;
}

function replaceParagraphMarker(html: string, name: string, render: (payload: string) => string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<p>\\s*::${escaped}:v1:([A-Za-z0-9_-]+)\\s*::\\s*</p>`,
    "g",
  );
  return html.replace(pattern, (_match, payload: string) => render(payload));
}

export function decodeMarkerData<T>(payload: string): T | undefined {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as T;
  } catch {
    return undefined;
  }
}

function extractParagraphMarkers(html: string, name: string): [string, string[]] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<p>\\s*::${escaped}:v1:([A-Za-z0-9_-]+)\\s*::\\s*</p>`,
    "g",
  );
  const payloads: string[] = [];
  const output = html.replace(pattern, (_match, payload: string) => {
    payloads.push(payload);
    return "";
  });
  return [output, payloads];
}

export function renderCustomMarkers(html: string): string {
  let output = replaceParagraphMarker(html, "hs-secret", (payload) => {
    return `<div class="hs-secret" data-hs-secret="${escapeHtmlAttribute(payload)}"><button type="button" class="hs-secret-lock" aria-label="解密内容">🔒 已加密内容，点击输入密钥</button></div>`;
  });

  // 普通音乐原位渲染：插在哪就出现在哪
  output = replaceParagraphMarker(output, "hs-player", (payload) => {
    const song = decodeMarkerData<EditorSong>(payload);
    return song?.url ? buildInlineMusicHtml(song) : "";
  });

  // 瞬间音乐与九宫格仍统一放到正文末尾，音乐在九宫格之前
  let musicPayloads: string[] = [];
  [output, musicPayloads] = extractParagraphMarkers(output, "hs-music");

  let galleryPayloads: string[] = [];
  [output, galleryPayloads] = extractParagraphMarkers(output, "hs-gallery");

  const musicHtml = musicPayloads
    .map((payload) => decodeMarkerData<EditorSong>(payload))
    .filter((song): song is EditorSong => Boolean(song?.url))
    .map((song) => buildInlineMusicHtml(song))
    .join("");

  const galleryHtml = galleryPayloads
    .map((payload) => decodeMarkerData<EditorGallery>(payload))
    .map((gallery) => (gallery?.images ?? []).filter((url) => Boolean(url)))
    .filter((images) => images.length > 0)
    .map((images) => {
      const items = images
        .map((url) => `<figure class="hs-moment-gallery-item"><img src="${escapeHtmlAttribute(url)}" alt="" /></figure>`)
        .join("");
      return `<div class="hs-moment-gallery is-${Math.min(images.length, 9)}">${items}</div>`;
    })
    .join("");

  return `${output}${musicHtml}${galleryHtml}`;
}
