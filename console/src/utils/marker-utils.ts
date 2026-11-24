import { fromBase64Url, toBase64Url } from "@/utils/crypto-utils";

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

export function buildSecretMarker(payload: SecretMarkerPayload): string {
  return `::hs-secret:v1:${encodeMarkerData(payload)}::`;
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

function decodeMarkerData<T>(payload: string): T | undefined {
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
