<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

import type { EditorSong } from "@/utils/marker-utils";

const props = defineProps<{
  open: boolean;
  searchApi: string;
  resolveApi: string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "select", song: EditorSong): void;
}>();

const keyword = ref("");
const songs = ref<EditorSong[]>([]);
const server = ref("");
const mode = ref<"search" | "id">("search");
const loading = ref(false);
const searched = ref(false);
const error = ref("");

let timer: number | undefined;
let requestId = 0;

const clearTimer = () => {
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
};

const isValidId = (value: string) => /^[A-Za-z0-9_-]{3,}$/.test(value);

/** 从纯 ID、server:id 或音乐平台分享链接中提取歌曲 ID。 */
const extractSongId = (input: string): string | null => {
  const value = input.trim();
  if (!value) return null;

  const scoped = value.match(/^(?:netease|tencent|kugou|baidu|kuwo):([A-Za-z0-9_-]+)$/i);
  if (scoped) return scoped[1] ?? null;

  // 网易云等平台数字 ID；QQ 音乐 mid 通常是字母数字混合串。
  if (/^\d{3,}$/.test(value)) return value;
  if (/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{10,}$/.test(value)) return value;

  let url: URL;
  try {
    if (/^https?:\/\//i.test(value)) url = new URL(value);
    else if (value.startsWith("//")) url = new URL(`https:${value}`);
    else if (value.startsWith("/")) url = new URL(value, window.location.origin);
    else if (value.includes(".")) url = new URL(`https://${value}`);
    else return null;
  } catch {
    return null;
  }

  const hashQuery = url.hash.includes("?") ? url.hash.slice(url.hash.indexOf("?") + 1) : "";
  const fromQuery =
    new URLSearchParams(url.search).get("id") || new URLSearchParams(hashQuery).get("id");
  if (fromQuery && isValidId(fromQuery)) return fromQuery;

  const decodeSegments = (path: string) => {
    const parts = path.split("/").filter(Boolean);
    try {
      return parts.map(decodeURIComponent);
    } catch {
      return parts;
    }
  };
  const segments = [
    ...decodeSegments(url.pathname),
    ...decodeSegments(url.hash.replace(/^#/, "").split("?")[0] ?? ""),
  ];
  const markerIndex = segments.findIndex((segment) =>
    ["song", "songs", "songdetail"].includes(segment.toLowerCase()),
  );
  const candidate = markerIndex >= 0 ? segments[markerIndex + 1] : undefined;
  if (candidate && isValidId(candidate)) {
    return candidate;
  }
  const numeric = segments.reverse().find((segment) => /^\d{3,}$/.test(segment));
  return numeric ?? null;
};

const applyData = (data: Record<string, unknown>) => {
  server.value = String(data.server ?? "");
  songs.value = Array.isArray(data.songs)
    ? (data.songs as Record<string, unknown>[])
        .map((item) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? ""),
          artist: String(item.artist ?? ""),
          album: String(item.album ?? ""),
          url: String(item.url ?? ""),
          cover: String(item.cover ?? ""),
          lrc: String(item.lrc ?? ""),
        }))
        .filter((song) => Boolean(song.name && song.url))
    : [];
  searched.value = true;
};

const runSearch = async () => {
  const value = keyword.value.trim();
  clearTimer();
  if (!value) {
    songs.value = [];
    searched.value = false;
    error.value = "";
    mode.value = "search";
    return;
  }
  const id = extractSongId(value);
  mode.value = id ? "id" : "search";
  const current = ++requestId;
  loading.value = true;
  error.value = "";
  try {
    const url = id
      ? `${props.resolveApi}?id=${encodeURIComponent(id)}`
      : `${props.searchApi}?keyword=${encodeURIComponent(value)}`;
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    if (current !== requestId) return;
    applyData(data);
  } catch {
    if (current !== requestId) return;
    songs.value = [];
    searched.value = true;
    error.value = id
      ? "按 ID 解析失败，请检查歌曲 ID、平台与 Cookie 配置"
      : "搜索失败，请检查 aplayer-backend 插件设置与平台配置";
  } finally {
    if (current === requestId) loading.value = false;
  }
};

const scheduleSearch = () => {
  clearTimer();
  timer = window.setTimeout(runSearch, 320);
};

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (keyword.value.trim()) {
        void runSearch();
      } else {
        songs.value = [];
        searched.value = false;
        error.value = "";
        mode.value = "search";
      }
    } else {
      clearTimer();
    }
  },
);

watch(keyword, () => {
  if (props.open) scheduleSearch();
});

onBeforeUnmount(clearTimer);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="hs-song-mask" @click.self="emit('close')">
      <div class="hs-song-modal" role="dialog" aria-modal="true" aria-label="搜索音乐">
        <div class="hs-song-modal-head">
          <strong>
            搜索音乐
            <span v-if="server" class="hs-song-server">{{ server }}</span>
            <span v-if="mode === 'id'" class="hs-song-mode">ID 解析</span>
          </strong>
          <button type="button" class="hs-song-close" aria-label="关闭" @click="emit('close')">×</button>
        </div>
        <input
          v-model="keyword"
          class="hs-song-search"
          type="search"
          placeholder="输入歌名/歌手，或粘贴歌曲 ID / 分享链接"
          @keyup.enter="runSearch"
        />
        <div v-if="error" class="hs-song-error">{{ error }}</div>
        <div v-if="loading" class="hs-song-empty">搜索中…</div>
        <div v-else class="hs-song-list">
          <button
            v-for="(song, index) in songs"
            :key="song.id || `${song.name}-${index}`"
            type="button"
            class="hs-song-item"
            @click="emit('select', song)"
          >
            <span class="hs-song-text">
              <span class="hs-song-name">{{ song.name }}</span>
              <span class="hs-song-artist">
                {{ [song.artist, song.album].filter(Boolean).join(" · ") || "未知歌手" }}
              </span>
            </span>
          </button>
          <div v-if="!songs.length" class="hs-song-empty">
            {{
              error
                ? ""
                : searched
                  ? mode === "id"
                    ? "没有解析到歌曲，可检查 ID 或改用关键词搜索"
                    : "没有匹配的歌曲，也可粘贴歌曲 ID / 分享链接"
                  : "输入歌名/歌手自动搜索；也可粘贴歌曲 ID / 分享链接按回车解析"
            }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.hs-song-mask {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.hs-song-modal {
  box-sizing: border-box;
  width: min(560px, calc(100vw - 32px));
  max-height: min(620px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: var(--halo-surface, #fff);
  border-radius: 10px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.hs-song-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--halo-divider, #e5e7eb);
}

.hs-song-server {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 400;
  opacity: 0.6;
}

.hs-song-mode {
  margin-left: 8px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--halo-fill, rgba(0, 0, 0, 0.06));
  font-size: 11px;
  font-weight: 400;
  opacity: 0.75;
}

.hs-song-close {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.hs-song-search {
  margin: 12px 16px;
  padding: 8px 12px;
  border: 1px solid var(--halo-divider, #d1d5db);
  border-radius: 6px;
  background: var(--halo-input-bg, #fff);
  color: inherit;
}

.hs-song-error {
  margin: 0 16px 8px;
  color: #d9534f;
  font-size: 12px;
}

.hs-song-list {
  padding: 0 16px 16px;
  overflow: auto;
}

.hs-song-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border: 0;
  border-bottom: 1px solid var(--halo-divider, #f0f0f0);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.hs-song-item:hover {
  background: var(--halo-fill, rgba(0, 0, 0, 0.05));
}

.hs-song-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.hs-song-name {
  font-weight: 600;
}

.hs-song-artist {
  opacity: 0.7;
  font-size: 12px;
}

.hs-song-empty {
  padding: 24px 0;
  text-align: center;
  opacity: 0.7;
  font-size: 13px;
}
</style>
