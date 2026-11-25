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
const MEDIA_BASE = "/apis/api.aplayer-backend/v1alpha1/media/v1";

const mediaUrl = (kind: string, server: string, id: string): string =>
  `${MEDIA_BASE}/${kind}?server=${encodeURIComponent(server)}&id=${encodeURIComponent(id)}`;

/** song.id 形如 server:songId，用它生成永久资源链接，不再写静态缓存地址。 */
const normalizeSong = (song: EditorSong): EditorSong => {
  const raw = song.id || "";
  const index = raw.indexOf(":");
  if (index <= 0) return song;
  const server = raw.slice(0, index);
  const id = raw.slice(index + 1);
  if (!server || !id) return song;
  return {
    ...song,
    url: mediaUrl("audio", server, id),
    cover: song.cover ? mediaUrl("cover", server, id) : "",
    lrc: song.lrc ? mediaUrl("lrc", server, id) : "",
  };
};

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

/**
 * 普通音乐用 Markdown 链接表示：编辑器里只显示「♪ 歌曲名 - 歌手」，
 * 歌曲信息全部放进 URL 查询参数（hs-* 前缀），音乐源本身作为链接地址，点击即可试听。
 */
export function buildMusicLink(song: EditorSong): string {
  const item = normalizeSong(song);
  const url = new URL(item.url, "https://local.invalid");
  url.searchParams.set("hs-music", "1");
  url.searchParams.set("hs-name", item.name || "");
  url.searchParams.set("hs-artist", item.artist || "");
  url.searchParams.set("hs-cover", item.cover || "");
  url.searchParams.set("hs-lrc", item.lrc || "");
  const href =
    item.url.startsWith("http://") || item.url.startsWith("https://")
      ? url.toString()
      : `${url.pathname}${url.search}`;
  const label = item.artist ? `${item.name} - ${item.artist}` : item.name;
  return `[♪ ${label}](${href})`;
}

/** 从带 hs-* 参数的链接中还原歌曲信息；不是音乐链接则返回 undefined */
export function parseMusicLink(href: string): EditorSong | undefined {
  let url: URL;
  try {
    url = new URL(href, "https://local.invalid");
  } catch {
    return undefined;
  }
  if (url.searchParams.get("hs-music") !== "1") return undefined;
  const name = url.searchParams.get("hs-name") || "";
  const artist = url.searchParams.get("hs-artist") || "";
  const cover = url.searchParams.get("hs-cover") || "";
  const lrc = url.searchParams.get("hs-lrc") || "";
  for (const key of ["hs-music", "hs-name", "hs-artist", "hs-cover", "hs-lrc"]) {
    url.searchParams.delete(key);
  }
  const isAbsolute = href.startsWith("http://") || href.startsWith("https://");
  const source = isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
  if (!source) return undefined;
  return { name, artist, cover, lrc, url: source };
}

export function buildInlineMusicHtml(song: EditorSong): string {
  const item = normalizeSong(song);
  return [
    '<div class="hs-music-player" data-hs-music',
    ` data-name="${escapeHtmlAttribute(item.name)}"`,
    ` data-artist="${escapeHtmlAttribute(item.artist)}"`,
    ` data-url="${escapeHtmlAttribute(item.url)}"`,
    ` data-cover="${escapeHtmlAttribute(item.cover)}"`,
    ` data-lrc="${escapeHtmlAttribute(item.lrc)}"`,
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
  return `::hs-music:v1:${encodeMarkerData(normalizeSong(song))}::`;
}

/**
 * 从 raw 中抽出九宫格/瞬间音乐标记，交给编辑器内存缓存管理。
 * 编辑区里不保留这些标记，发布时再统一追加回末尾。
 */
export function extractPendingFromRaw(raw: string): {
  editorRaw: string;
  galleryImages: string[];
  momentSongs: EditorSong[];
} {
  let editorRaw = raw;
  let galleryImages: string[] = [];
  const momentSongs: EditorSong[] = [];

  editorRaw = editorRaw.replace(/::hs-gallery:v1:([A-Za-z0-9_-]+)::/g, (_match, payload: string) => {
    const data = decodeMarkerData<EditorGallery>(payload);
    if (data?.images?.length) galleryImages = galleryImages.concat(data.images);
    return "";
  });
  editorRaw = editorRaw.replace(/::hs-music:v1:([A-Za-z0-9_-]+)::/g, (_match, payload: string) => {
    const song = decodeMarkerData<EditorSong>(payload);
    if (song?.url) momentSongs.push(song);
    return "";
  });

  return {
    editorRaw: editorRaw.replace(/\n{3,}/g, "\n\n").trim(),
    galleryImages: galleryImages.slice(0, 9),
    momentSongs,
  };
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
  // 普通音乐链接：<a href="...?hs-music=1&...">♪ 歌曲 - 歌手</a> → 原位播放器
  // lute 会把 href 中的 & 转义为 &amp;，先还原再解析
  let output = html.replace(/<a\s+href="([^"]*hs-music=1[^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (match, href: string) => {
    const song = parseMusicLink(href.replace(/&amp;/g, "&"));
    return song?.url ? buildInlineMusicHtml(song) : match;
  });

  output = replaceParagraphMarker(output, "hs-secret", (payload) => {
    return `<p class="hs-secret" data-hs-secret="${escapeHtmlAttribute(payload)}"><button type="button" class="hs-secret-lock" disabled aria-label="该部分仅登录用户可见"><span class="hs-secret-lock-icon" aria-hidden="true">🔒</span><span>该部分仅登录用户可见</span></button></p>`;
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
