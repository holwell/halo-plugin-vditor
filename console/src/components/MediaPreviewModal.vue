<script setup lang="ts">
import { computed, ref } from "vue";

import type { EditorSong } from "@/utils/marker-utils";
import type { TagInfo } from "@/utils/tag-utils";

const props = defineProps<{
  open: boolean;
  galleryImages: string[];
  momentSongs: EditorSong[];
  allTags: TagInfo[];
  associatedNames: string[];
  matchedNames: string[];
  candidateNames: string[];
  locOrder: string[];
  postName: string;
  /** 标签写请求进行中：冻结所有交互，避免中途退出或重复点击 */
  pending?: boolean;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "editGallery"): void;
  (event: "editMoment"): void;
  (event: "removeGallery", index: number): void;
  (event: "removeMoment", index: number): void;
  (event: "associate", name: string): void;
  (event: "unassociate", name: string): void;
  (event: "addByText", payload: { text: string; location: boolean }): void;
  (event: "refreshScopes"): void;
}>();

const LOCATION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="10" r="3" /><path d="M12 2a8 8 0 0 0-8 8c0 1.892.402 3.13 1.5 4.5L12 22l6.5-7.5c1.098-1.37 1.5-2.608 1.5-4.5a8 8 0 0 0-8-8" /></g></svg>`;

const MUSIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M8 18V5.716a2 2 0 0 1 1.696-1.977l9-1.385A2 2 0 0 1 21 4.331V16" /><path d="m8 9l13-2" /><path d="M8 18a3 3 0 1 1-6 0c0-1.657 1.343-2 3-2s3 .343 3 2m13-2a3 3 0 1 1-6 0c0-1.657 1.343-2 3-2s3 .343 3 2" /></g></svg>`;

const GRID_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><g fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></g></svg>`;

const tagInput = ref("");
const locInput = ref("");

const tagByName = (name: string) => props.allTags.find((tag) => tag.name === name);
const matched = (name: string) => props.matchedNames.includes(name);

const candidateTags = computed(() =>
  props.candidateNames
    .map(tagByName)
    .filter((tag): tag is TagInfo => Boolean(tag) && !tag!.location),
);

const associatedNormalTags = computed(() =>
  props.associatedNames
    .map(tagByName)
    .filter((tag): tag is TagInfo => Boolean(tag) && !tag!.location),
);

const associatedLocationTags = computed(() => {
  const ordered = Array.from(new Set([...props.locOrder, ...props.associatedNames]));
  return ordered
    .map(tagByName)
    .filter((tag): tag is TagInfo => Boolean(tag) && tag!.location);
});

const tagSuggestions = computed(() => {
  const keyword = tagInput.value.trim().toLocaleLowerCase();
  if (!keyword) return [];
  return props.allTags
    .filter((tag) => !tag.location && !props.associatedNames.includes(tag.name))
    .filter(
      (tag) =>
        tag.displayName.toLocaleLowerCase().includes(keyword) ||
        tag.name.toLocaleLowerCase().includes(keyword),
    )
    .slice(0, 8);
});

const locSuggestions = computed(() => {
  const keyword = locInput.value.trim().replace(/^loc[_-]/i, "").toLocaleLowerCase();
  if (!keyword) return [];
  return props.allTags
    .filter((tag) => tag.location && !props.associatedNames.includes(tag.name))
    .filter(
      (tag) =>
        tag.matchText.toLocaleLowerCase().includes(keyword) ||
        tag.displayName.toLocaleLowerCase().includes(keyword),
    )
    .slice(0, 8);
});

const associateSuggestion = (name: string, location: boolean) => {
  if (props.pending) return;
  emit("associate", name);
  if (location) locInput.value = "";
  else tagInput.value = "";
};

const submitInput = (event: KeyboardEvent, location: boolean) => {
  if (props.pending) return;
  if (event.isComposing || event.keyCode === 229) return;
  const target = event.target as HTMLInputElement;
  if (event.key === "Backspace" && !target.value) {
    const list = location ? associatedLocationTags.value : associatedNormalTags.value;
    const last = list[list.length - 1];
    if (last) emit("unassociate", last.name);
    return;
  }
  if (event.key !== " " && event.key !== "Spacebar" && event.key !== "Enter") return;
  const text = target.value.trim();
  if (!text) return;
  event.preventDefault();
  emit("addByText", { text, location });
  target.value = "";
};
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="hs-media-mask" :class="{ 'is-pending': pending }" @click.self="!pending && emit('close')">
      <div class="hs-media-modal" role="dialog" aria-modal="true" aria-label="瞬间内容">
        <div class="hs-media-head">
          <span v-if="pending" class="hs-media-pending-hint">正在同步标签…请勿关闭</span>
          <span v-else></span>
          <button
            type="button"
            class="hs-media-close"
            aria-label="关闭"
            :disabled="pending"
            @click="emit('close')"
          >
            ×
          </button>
        </div>

        <div class="hs-media-row">
          <span class="hs-media-label">待确认标签</span>
          <div class="hs-media-value hs-tag-row">
            <button
              v-for="tag in candidateTags"
              :key="tag.name"
              type="button"
              class="hs-tag-chip is-candidate"
              :title="`点击关联「${tag.displayName}」`"
              :disabled="pending"
              @click="emit('associate', tag.name)"
            >
              #{{ tag.displayName }}
            </button>
          </div>
        </div>

        <div class="hs-media-row">
          <button
            type="button"
            class="hs-media-label is-action"
            title="按当前文章分类重新刷新正文里的标签链接"
            :disabled="pending"
            @click="emit('refreshScopes')"
          >
            当前标签
          </button>
          <div class="hs-media-value hs-tag-line">
            <button
              v-for="tag in associatedNormalTags"
              :key="tag.name"
              type="button"
              class="hs-tag-chip is-associated"
              :class="matched(tag.name) ? 'is-matched' : 'is-unmatched'"
              :title="`点击取消关联「${tag.displayName}」`"
              :disabled="pending"
              @click="emit('unassociate', tag.name)"
            >
              #{{ tag.displayName }}<span class="hs-tag-chip-remove">×</span>
            </button>
            <div class="hs-tag-input-wrap">
              <input
                v-model="tagInput"
                class="hs-tag-input"
                type="text"
                placeholder="标签"
                :disabled="pending"
                @keydown="submitInput($event, false)"
              />
              <div v-if="tagSuggestions.length" class="hs-tag-suggest">
                <button
                  v-for="tag in tagSuggestions"
                  :key="tag.name"
                  type="button"
                  :disabled="pending"
                  @mousedown.prevent
                  @click="associateSuggestion(tag.name, false)"
                >
                  #{{ tag.displayName }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="hs-media-row">
          <span class="hs-media-label">位置</span>
          <div class="hs-media-value hs-tag-line">
            <button
              v-for="tag in associatedLocationTags"
              :key="tag.name"
              type="button"
              class="hs-tag-chip is-associated is-location"
              :class="matched(tag.name) ? 'is-matched' : 'is-unmatched'"
              :title="`点击取消位置「${tag.matchText}」`"
              :disabled="pending"
              @click="emit('unassociate', tag.name)"
            >
              <span class="hs-chip-icon" v-html="LOCATION_ICON"></span>
              {{ tag.matchText }}<span class="hs-tag-chip-remove">×</span>
            </button>
            <div class="hs-tag-input-wrap">
              <input
                v-model="locInput"
                class="hs-tag-input"
                type="text"
                placeholder="位置"
                :disabled="pending"
                @keydown="submitInput($event, true)"
              />
              <div v-if="locSuggestions.length" class="hs-tag-suggest">
                <button
                  v-for="tag in locSuggestions"
                  :key="tag.name"
                  type="button"
                  :disabled="pending"
                  @mousedown.prevent
                  @click="associateSuggestion(tag.name, true)"
                >
                  <span class="hs-chip-icon" v-html="LOCATION_ICON"></span>
                  {{ tag.matchText }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="hs-media-row">
          <span class="hs-media-label">瞬间音乐</span>
          <div class="hs-media-value">
            <div class="hs-media-inline">
              <span class="hs-media-icon" v-html="MUSIC_ICON"></span>
              <ul v-if="momentSongs.length" class="hs-media-songs">
                <li v-for="(song, index) in momentSongs" :key="`${song.url}-${index}`">
                  <span>{{ song.name }}<em v-if="song.artist"> - {{ song.artist }}</em></span>
                  <button type="button" class="hs-media-remove-inline" title="移除" :disabled="pending" @click="emit('removeMoment', index)">×</button>
                </li>
              </ul>
              <button type="button" class="hs-media-add" title="添加瞬间音乐" :disabled="pending" @click="emit('editMoment')">添加</button>
            </div>
          </div>
        </div>

        <div class="hs-media-row">
          <span class="hs-media-label">九宫格</span>
          <div class="hs-media-value">
            <div class="hs-media-inline">
              <span class="hs-media-icon" v-html="GRID_ICON"></span>
              <button type="button" class="hs-media-add" title="添加九宫格图片" :disabled="pending" @click="emit('editGallery')">添加</button>
            </div>
            <div v-if="galleryImages.length" class="hs-media-grid">
              <div v-for="(url, index) in galleryImages" :key="`${url}-${index}`" class="hs-media-thumb">
                <img :src="url" alt="" />
                <button type="button" class="hs-media-remove" title="移除" :disabled="pending" @click="emit('removeGallery', index)">×</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.hs-media-mask {
  position: fixed;
  inset: 0;
  /* 与音乐弹框同处高位段，音乐框 10010 再高一级，保证从本面板打开时盖在其上 */
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

/* 标签写请求期间：整块面板冻结，避免中途点击退出造成"显示已添加但实际没成功" */
.hs-media-mask.is-pending .hs-media-modal {
  opacity: 0.72;
  pointer-events: none;
}

.hs-media-pending-hint {
  font-size: 12px;
  font-weight: 400;
  opacity: 0.7;
}

.hs-media-modal {
  box-sizing: border-box;
  width: min(620px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 12px 16px 16px;
  border-radius: 10px;
  background: var(--halo-surface, #fff);
  color: inherit;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.hs-media-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
}

.hs-media-close {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  color: inherit;
}

.hs-media-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--halo-divider, #e5e7eb);
}

.hs-media-row:first-of-type {
  margin-top: 6px;
  border-top: 0;
}

.hs-media-label {
  padding: 5px 0 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 600;
  font-size: 13px;
  text-align: left;
  cursor: default;
}

.hs-media-label.is-action {
  cursor: pointer;
}

.hs-media-label.is-action::after {
  content: " ↻";
  opacity: 0.5;
}

.hs-media-value {
  min-width: 0;
}

.hs-media-row:first-of-type .hs-media-value {
  padding-top: 2px;
}

.hs-tag-row,
.hs-tag-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.hs-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--halo-divider, #d1d5db);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}

.hs-tag-chip.is-candidate {
  border-color: var(--halo-primary, #2563eb);
}

.hs-tag-chip.is-matched {
  border-color: var(--halo-primary, #2563eb);
  background: var(--halo-primary, #2563eb);
  color: #fff;
  font-weight: 600;
}

.hs-tag-chip.is-matched .hs-tag-chip-remove {
  opacity: 0.85;
}

.hs-tag-chip.is-unmatched {
  background: transparent;
  opacity: 0.65;
}

.hs-tag-chip.is-location {
  border-radius: 6px;
}

.hs-tag-chip-remove {
  opacity: 0.6;
  font-size: 13px;
}

.hs-chip-icon,
.hs-media-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hs-chip-icon svg,
.hs-media-icon svg {
  display: block;
  width: 14px;
  height: 14px;
}

.hs-tag-input-wrap {
  position: relative;
  flex: 0 1 110px;
  min-width: 90px;
}

.hs-tag-input {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--halo-divider, #d1d5db);
  border-radius: 6px;
  background: var(--halo-surface, #fff);
  color: inherit;
  font: inherit;
  font-size: 12px;
}

.hs-tag-suggest {
  position: absolute;
  z-index: 5;
  top: calc(100% + 4px);
  left: 0;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--halo-divider, #d1d5db);
  border-radius: 6px;
  background: var(--halo-surface, #fff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}

.hs-tag-suggest button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.hs-tag-suggest button:hover {
  background: var(--halo-fill, rgba(0, 0, 0, 0.05));
}

.hs-media-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
}

.hs-media-add {
  padding: 4px 10px;
  border: 1px solid var(--halo-divider, #d1d5db);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.hs-media-songs {
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hs-media-songs li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
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

.hs-media-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 8px;
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
</style>
