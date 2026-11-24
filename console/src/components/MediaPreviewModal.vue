<script setup lang="ts">
import type { EditorSong } from "@/utils/marker-utils";

const props = defineProps<{
  open: boolean;
  galleryImages: string[];
  momentSongs: EditorSong[];
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "editGallery"): void;
  (event: "editMoment"): void;
  (event: "removeGallery", index: number): void;
  (event: "removeMoment", index: number): void;
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="hs-media-mask" @click.self="emit('close')">
      <div class="hs-media-modal" role="dialog" aria-modal="true" aria-label="已添加的内容">
        <div class="hs-media-head">
          <strong>已添加的内容</strong>
          <button type="button" class="hs-media-close" aria-label="关闭" @click="emit('close')">×</button>
        </div>
        <p class="hs-media-hint">这些内容在编辑区不显示，发布时自动追加到正文末尾。</p>

        <div class="hs-media-section">
          <div class="hs-media-section-head">
            <span>九宫格（{{ galleryImages.length }}）</span>
            <button type="button" class="hs-media-edit" @click="emit('editGallery')">添加</button>
          </div>
          <div v-if="galleryImages.length" class="hs-media-grid">
            <div v-for="(url, index) in galleryImages" :key="`${url}-${index}`" class="hs-media-thumb">
              <img :src="url" alt="" />
              <button type="button" class="hs-media-remove" title="移除" @click="emit('removeGallery', index)">×</button>
            </div>
          </div>
          <div v-else class="hs-media-empty">尚未选择图片</div>
        </div>

        <div class="hs-media-section">
          <div class="hs-media-section-head">
            <span>瞬间音乐（{{ momentSongs.length }}）</span>
            <button type="button" class="hs-media-edit" @click="emit('editMoment')">添加</button>
          </div>
          <ul v-if="momentSongs.length" class="hs-media-songs">
            <li v-for="(song, index) in momentSongs" :key="`${song.url}-${index}`">
              <span>{{ song.name }}<em v-if="song.artist"> - {{ song.artist }}</em></span>
              <button type="button" class="hs-media-remove-inline" title="移除" @click="emit('removeMoment', index)">×</button>
            </li>
          </ul>
          <div v-else class="hs-media-empty">尚未选择音乐</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.hs-media-mask {
  position: fixed;
  inset: 0;
  z-index: 2050;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.hs-media-modal {
  box-sizing: border-box;
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 16px;
  border-radius: 10px;
  background: var(--halo-surface, #fff);
  color: inherit;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.hs-media-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hs-media-close {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  color: inherit;
}

.hs-media-hint {
  margin: 6px 0 12px;
  font-size: 12px;
  opacity: 0.7;
}

.hs-media-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--halo-divider, #e5e7eb);
}

.hs-media-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 600;
}

.hs-media-edit {
  padding: 4px 10px;
  border: 1px solid var(--halo-divider, #d1d5db);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.hs-media-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.hs-media-thumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 6px;
  background: var(--halo-fill, rgba(0, 0, 0, 0.05));
}

.hs-media-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hs-media-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}

.hs-media-songs {
  margin: 0;
  padding: 0;
  list-style: none;
}

.hs-media-songs li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--halo-divider, #f0f0f0);
}

.hs-media-songs em {
  opacity: 0.7;
  font-style: normal;
}

.hs-media-remove-inline {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
}

.hs-media-empty {
  padding: 12px 0;
  font-size: 12px;
  opacity: 0.6;
}
</style>
