<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { EditorSong } from "@/utils/marker-utils";

const props = defineProps<{
  open: boolean;
  songs: EditorSong[];
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "select", song: EditorSong): void;
}>();

const keyword = ref("");

const filteredSongs = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return props.songs;
  return props.songs.filter((song) => {
    return [song.name, song.artist, song.id]
      .filter(Boolean)
      .some((item) => String(item).toLowerCase().includes(value));
  });
});

watch(
  () => props.open,
  (open) => {
    if (open) keyword.value = "";
  },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="hs-song-mask" @click.self="emit('close')">
      <div class="hs-song-modal" role="dialog" aria-modal="true" aria-label="选择音乐">
        <div class="hs-song-modal-head">
          <strong>选择音乐</strong>
          <button type="button" class="hs-song-close" aria-label="关闭" @click="emit('close')">×</button>
        </div>
        <input v-model="keyword" class="hs-song-search" type="search" placeholder="搜索歌名 / 歌手 / ID" />
        <div class="hs-song-list">
          <button
            v-for="(song, index) in filteredSongs"
            :key="song.id || `${song.name}-${index}`"
            type="button"
            class="hs-song-item"
            @click="emit('select', song)"
          >
            <span class="hs-song-name">{{ song.name }}</span>
            <span class="hs-song-artist">{{ song.artist || "未知歌手" }}</span>
          </button>
          <div v-if="!filteredSongs.length" class="hs-song-empty">没有匹配的歌曲</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.hs-song-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
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
}
</style>
