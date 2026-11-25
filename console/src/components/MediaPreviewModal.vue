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
}>();

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
  emit("associate", name);
  if (location) locInput.value = "";
  else tagInput.value = "";
};

const submitInput = (event: KeyboardEvent, location: boolean) => {
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
    <div v-if="open" class="hs-media-mask" @click.self="emit('close')">
      <div class="hs-media-modal" role="dialog" aria-modal="true" aria-label="瞬间内容设置">
        <div class="hs-media-head">
          <strong>瞬间内容设置</strong>
          <button type="button" class="hs-media-close" aria-label="关闭" @click="emit('close')">×</button>
        </div>
        <p class="hs-media-hint">图片、音乐、标签与位置在编辑区不显示，发布时自动写入正文或文章属性。</p>
        <p v-if="!postName" class="hs-media-warning">
          当前是新建文章，暂时无法同步标签关联。发布后重新编辑，即可在这里匹配和关联标签。
        </p>

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

        <div class="hs-media-section">
          <div class="hs-media-section-head">
            <span>已匹配待确认标签</span>
          </div>
          <div v-if="candidateTags.length" class="hs-tag-row">
            <button
              v-for="tag in candidateTags"
              :key="tag.name"
              type="button"
              class="hs-tag-chip is-candidate"
              :title="`点击关联「${tag.displayName}」`"
              @click="emit('associate', tag.name)"
            >
              #{{ tag.displayName }}
            </button>
          </div>
          <div v-else class="hs-media-empty">正文里还没有匹配到新的标签</div>
        </div>

        <div class="hs-media-section">
          <div class="hs-media-section-head">
            <span>当前标签</span>
          </div>
          <div v-if="associatedNormalTags.length" class="hs-tag-row">
            <button
              v-for="tag in associatedNormalTags"
              :key="tag.name"
              type="button"
              class="hs-tag-chip is-associated"
              :class="matched(tag.name) ? 'is-matched' : 'is-unmatched'"
              :title="`点击取消关联「${tag.displayName}」`"
              @click="emit('unassociate', tag.name)"
            >
              #{{ tag.displayName }}<span class="hs-tag-chip-remove">×</span>
            </button>
          </div>
          <div v-else class="hs-media-empty">尚未关联普通标签</div>
          <div class="hs-tag-input-wrap">
            <input
              v-model="tagInput"
              class="hs-tag-input"
              type="text"
              placeholder="输入标签，空格/回车新建或关联"
              @keydown="submitInput($event, false)"
            />
            <div v-if="tagSuggestions.length" class="hs-tag-suggest">
              <button
                v-for="tag in tagSuggestions"
                :key="tag.name"
                type="button"
                @mousedown.prevent
                @click="associateSuggestion(tag.name, false)"
              >
                #{{ tag.displayName }}
              </button>
            </div>
          </div>
        </div>

        <div class="hs-media-section">
          <div class="hs-media-section-head">
            <span>位置</span>
          </div>
          <div v-if="associatedLocationTags.length" class="hs-tag-row">
            <button
              v-for="tag in associatedLocationTags"
              :key="tag.name"
              type="button"
              class="hs-tag-chip is-associated is-location"
              :class="matched(tag.name) ? 'is-matched' : 'is-unmatched'"
              :title="`点击取消位置「${tag.matchText}」`"
              @click="emit('unassociate', tag.name)"
            >
              {{ tag.matchText }}<span class="hs-tag-chip-remove">×</span>
            </button>
          </div>
          <div v-else class="hs-media-empty">尚未选择位置</div>
          <div class="hs-tag-input-wrap">
            <input
              v-model="locInput"
              class="hs-tag-input"
              type="text"
              placeholder="输入位置，空格/回车新建或联想"
              @keydown="submitInput($event, true)"
            />
            <div v-if="locSuggestions.length" class="hs-tag-suggest">
              <button
                v-for="tag in locSuggestions"
                :key="tag.name"
                type="button"
                @mousedown.prevent
                @click="associateSuggestion(tag.name, true)"
              >
                位置：{{ tag.matchText }}
              </button>
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
  z-index: 2050;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.hs-media-modal {
  box-sizing: border-box;
  width: min(620px, calc(100vw - 32px));
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

.hs-media-warning {
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(234, 179, 8, 0.12);
  color: var(--halo-text, inherit);
  font-size: 12px;
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
  padding: 10px 0;
  font-size: 12px;
  opacity: 0.6;
}

.hs-tag-row {
  display: flex;
  flex-wrap: wrap;
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
  background: color-mix(in srgb, var(--halo-primary, #2563eb) 18%, transparent);
  font-weight: 600;
}

.hs-tag-chip.is-unmatched {
  opacity: 0.62;
}

.hs-tag-chip.is-location {
  border-radius: 6px;
}

.hs-tag-chip-remove {
  opacity: 0.6;
  font-size: 13px;
}

.hs-tag-input-wrap {
  position: relative;
  margin-top: 8px;
}

.hs-tag-input {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 8px;
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
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--halo-divider, #d1d5db);
  border-radius: 6px;
  background: var(--halo-surface, #fff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}

.hs-tag-suggest button {
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
</style>
