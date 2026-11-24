<script setup lang="ts">
import Vditor from "vditor";
import { onMounted, onUnmounted, ref, watch } from "vue";

import "vditor/dist/index.css";

import MediaPreviewModal from "@/components/MediaPreviewModal.vue";
import SongPickerModal from "@/components/SongPickerModal.vue";
import DebugPanel from "@/model/DebugPanel.vue";
import TemplateModal from "@/model/TemplateModal.vue";
import joeProgress from "@/schema/joe-progress";
import type { Schema } from "@/type/editor";
import { defaultEditorConfig, type EditorConfig } from "@/utils/config-utils";
import { getCursor, setCursor } from "@/utils/cursor-utils";
import { addStyle } from "@/utils/dom-utils";
import { fetchAllCustomRenderScripts, fetchAllQuickInsert } from "@/utils/fetch-utils";
import { copyAsHTML } from "@/utils/html-utils";
import {
  buildGalleryMarker,
  buildMusicLink,
  buildMomentMusicMarker,
  buildSecretEditorBlock,
  decodeSecretRawForEditor,
  encodeSecretEditorForRaw,
  extractPendingFromRaw,
  type EditorGallery,
  type EditorSong,
} from "@/utils/marker-utils";
import { quickInsertInject } from "@/utils/quick-insert-utils";
import { getOptions, renderHTMLFromMarkdownHtml } from "@/utils/vditor-utils";
import type { Attachment } from "@halo-dev/api-client";
import { VLoading } from "@halo-dev/components";
import type { AttachmentLike } from "@halo-dev/console-shared";
import juice from "juice";

// 工具栏图标（用户提供的 SVG，统一使用 currentColor，跟随主题前景色）
const TOOLBAR_ICONS = {
  image: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 56 56">
<path d="M0 0h56v56H0z" fill="none" />
<path fill="currentColor" d="M7.715 49.574h40.57c4.899 0 7.36-2.437 7.36-7.265V13.69c0-4.828-2.461-7.265-7.36-7.265H7.715C2.84 6.426.355 8.84.355 13.69v28.62c0 4.851 2.485 7.265 7.36 7.265m31.57-21.633c-1.055-.937-2.25-1.43-3.515-1.43c-1.313 0-2.462.446-3.54 1.407l-10.593 9.469l-4.336-3.938c-.985-.867-2.04-1.336-3.164-1.336c-1.032 0-2.04.446-3 1.313L4.129 39.73V13.88c0-2.438 1.312-3.68 3.656-3.68h40.43c2.32 0 3.656 1.242 3.656 3.68v25.875Zm-21.469.258c3.024 0 5.508-2.484 5.508-5.531c0-3.023-2.484-5.531-5.508-5.531c-3.046 0-5.53 2.508-5.53 5.531a5.54 5.54 0 0 0 5.53 5.531" />
</svg>`,
  music: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
<path d="M0 0h24v24H0z" fill="none" />
<g fill="none" stroke="currentColor" stroke-width="2">
<path stroke-linecap="round" stroke-linejoin="round" d="M8 18V5.716a2 2 0 0 1 1.696-1.977l9-1.385A2 2 0 0 1 21 4.331V16" />
<path d="m8 9l13-2" />
<path stroke-linecap="round" stroke-linejoin="round" d="M8 18a3 3 0 1 1-6 0c0-1.657 1.343-2 3-2s3 .343 3 2m13-2a3 3 0 1 1-6 0c0-1.657 1.343-2 3-2s3 .343 3 2" />
</g>
</svg>`,
  secret: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
<path d="M0 0h24v24H0z" fill="none" />
<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
<rect width="18" height="12" x="3" y="10" rx="2" />
<path d="M6 6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4H6z" />
</g>
</svg>`,
  moment: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
<path d="M0 0h24v24H0z" fill="none" />
<path fill="currentColor" d="M18.809 19.325a10 10 0 0 1-3.791 2.212a10.1 10.1 0 0 1-3.798.434C4.821 21.477.532 15.093 2.463 8.982a10.03 10.03 0 0 1 6.519-6.519a10.1 10.1 0 0 1 3.798-.434c6.399.494 10.688 6.879 8.757 12.989a10.04 10.04 0 0 1-2.728 4.307M10 19.743c2.082.572 4.13.189 6.001-.816L10 15.462Zm-5.703-5.6c.567 2.065 1.89 3.679 3.703 4.784v-6.923Zm9.701 1.318l3.706 2.14a7.93 7.93 0 0 0 2.2-4.362c.083-.535.075-.7.095-1.243ZM10 10.85v2.303l1.998 1.153L14 13.15v-2.303l-1.998-1.153Zm-5.999 1.154l6.001-3.465l-3.706-2.14a7.93 7.93 0 0 0-2.2 4.362c-.083.535-.075.7-.095 1.243M16 11.996l3.703-2.139c-.567-2.064-1.89-3.679-3.703-4.785ZM7.999 5.073L14 8.538V4.257c-2.082-.572-4.13-.189-6.001.816" />
</svg>`,
  source: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">
<path d="M0 0h16v16H0z" fill="none" />
<path fill="currentColor" d="M13.5 1h-9A2.503 2.503 0 0 0 2 3.5v2.776a4.4 4.4 0 0 1 1-.226V3.499c0-.827.673-1.5 1.5-1.5h4v11.386l1.057 1.057c.157.149.274.344.35.557H13.5c1.378 0 2.5-1.122 2.5-2.5V3.5C16 2.122 14.878 1 13.5 1M15 12.5c0 .827-.673 1.5-1.5 1.5h-4V2h4c.827 0 1.5.673 1.5 1.5zm-8.71.09c.45-.58.71-1.31.71-2.09C7 8.57 5.43 7 3.5 7S0 8.57 0 10.5S1.57 14 3.5 14c.78 0 1.51-.26 2.09-.71l2.56 2.56c.09.1.22.15.35.15s.26-.05.35-.15c.2-.19.2-.51 0-.7zM5.5 12a2.5 2.5 0 0 1-2 1a2.5 2.5 0 0 1 0-5a2.5 2.5 0 0 1 2 4" />
</svg>`,
  fullscreen: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
<path d="M0 0h24v24H0z" fill="none" />
<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2 7V2h5m15 5V2h-5M7 22H2v-5m15 5h5v-5" />
</svg>`,
};

const props = withDefaults(
  defineProps<{
    title?: string;
    raw?: string;
    content?: string;
    uploadImage?: (file: File) => Promise<Attachment>;
  }>(),
  {
    title: "",
    raw: "",
    content: "",
    uploadImage: undefined,
  },
);

const vditor = ref<Vditor>();
const vditorRef = ref();
const vditorLoaded = ref(false);
const attachmentSelectorModalShow = ref(false);
const attachmentSelectionMode = ref<"image" | "gallery">("image");
const songPickerShow = ref(false);
const songPickerMode = ref<"inline" | "moment">("inline");
const songs = ref<EditorSong[]>([]);
// 九宫格与瞬间音乐只在内存中缓存，编辑区不显示，发布时追加到 raw 末尾
const pendingGallery = ref<EditorGallery>({ images: [] });
const pendingMomentSongs = ref<EditorSong[]>([]);
const mediaPreviewShow = ref(false);
const reopenMediaPreview = ref(false);
const isFullscreen = ref(false);
const editorConfig = ref<EditorConfig>();
// 特殊插入框， 当前支持none/tips/git
// 自定义插入
const customInsertOpen = ref(false);
const customInsertSchema = ref<Schema>(joeProgress);
let lastSelectionRange: Range | undefined = undefined;
// Image Upload
const imageUploadLock = false;
let allowImageUpload: string[] = [];
// Debug
const debugMode = ref<boolean>(false);
// 防止内部标题更新触发updateContent
const internalTitle = ref<string>("");

const emit = defineEmits<{
  (event: "update:raw", value: string): void;
  (event: "update:content", value: string): void;
  (event: "update", value: string): void;
  (event: "update:title", value: string): void;
}>();

// Watch Title Change
watch(
  () => props.title,
  (val) => {
    // When option disabled or nothing to update
    if (!editorConfig.value?.basic.firstH1AsTitle || internalTitle.value === val) {
      return;
    }
    // Get title
    const vdiVal = vditor.value?.getValue();
    if (vdiVal?.startsWith("# ")) {
      internalTitle.value = val;
      vditor.value?.setValue(vdiVal.replace(/# .*?\n/, `# ${val}\n`));
    }
  },
);

// Update content：编辑器里是明文，落库 raw 前自动加密，content 从密文 raw 渲染
let updateSequence = 0;
const debounceOnUpdate = async () => {
  const sequence = ++updateSequence;
  let value = vditor.value?.getValue();
  if (!value) return;
  if (editorConfig.value?.basic.firstH1AsTitle && value.startsWith("# ")) {
    const lines = value.match(/^.*/);
    if (!lines) return;
    const firstLine = lines[0];
    console.log(`title is ${firstLine.substring(2)}`);
    internalTitle.value = firstLine.substring(2);
    emit("update:title", internalTitle.value);
    value = value.substring(firstLine.length + 2);
  }

  const password = editorConfig.value?.security.encryptionKey || "";
  let rawValue = value;
  try {
    rawValue = await encodeSecretEditorForRaw(value, password);
  } catch (error) {
    console.error("[hs-secret] 自动加密失败", error);
  }
  if (sequence !== updateSequence) return;

  // 发布时把内存里的九宫格/瞬间音乐追加到末尾：音乐在前，九宫格在后
  const pendingMarkers: string[] = [];
  pendingMomentSongs.value.forEach((song) => pendingMarkers.push(buildMomentMusicMarker(song)));
  if (pendingGallery.value.images.length) {
    pendingMarkers.push(buildGalleryMarker({ images: pendingGallery.value.images.slice(0, 9) }));
  }
  if (pendingMarkers.length) {
    const separator = rawValue.endsWith("\n\n") ? "" : rawValue.endsWith("\n") ? "\n" : "\n\n";
    rawValue = `${rawValue}${separator}${pendingMarkers.join("\n\n")}`;
  }

  const config = editorConfig.value || defaultEditorConfig;
  const customRenders = vditor.value?.vditor?.options?.customRenders;
  let html = "";
  try {
    // 直接复用实例的 lute 引擎同步渲染，避免 Vditor.md2html 需要额外 options/动态加载脚本
    const rendered = vditor.value?.vditor?.lute?.Md2HTML(rawValue) || "";
    html = renderHTMLFromMarkdownHtml(rendered, config, customRenders);
  } catch (error) {
    console.error("[Vditor] 渲染 HTML 失败", error);
  }
  if (sequence !== updateSequence) return;

  emit("update:raw", rawValue);
  emit("update:content", html);
  emit("update", rawValue);
};

// 选取附件后处理
const attachmentSelect = (attachments: AttachmentLike[]) => {
  setCursor(lastSelectionRange);
  // Reference https://github.com/guqing/willow-mde/blob/4b8e697132f8a8f4b08dd0f92cf10d070cb26793/console/src/components/toolbar/Toolbar.vue#L104
  if (attachmentSelectionMode.value === "gallery") {
    const images: string[] = [];
    attachments.forEach((attachment) => {
      if (typeof attachment === "string") {
        images.push(attachment);
      } else if ("url" in attachment) {
        images.push(String(attachment.url));
      } else if ("spec" in attachment) {
        const { permalink } = attachment.status || {};
        if (permalink) images.push(permalink);
      }
    });
    if (!images.length) return;
    // 追加而非覆盖：保留已有图片，合并去重，最多 9 张
    const merged = [...pendingGallery.value.images, ...images].filter(
      (url, index, arr) => arr.indexOf(url) === index,
    ).slice(0, 9);
    pendingGallery.value = { images: merged };
    debounceOnUpdate();
    if (reopenMediaPreview.value) {
      reopenMediaPreview.value = false;
      mediaPreviewShow.value = true;
    }
    return;
  }
  attachments.forEach((attachment) => {
    if (typeof attachment === "string") {
      vditor.value?.insertValue(`\n\n![](${attachment})\n\n`);
    } else if ("url" in attachment) {
      vditor.value?.insertValue(`\n\n![${attachment.type}](${attachment.url})\n\n`);
    } else if ("spec" in attachment) {
      const { displayName } = attachment.spec;
      const { permalink } = attachment.status || {};
      vditor.value?.insertValue(`\n\n![${displayName}](${permalink})\n\n`);
    }
  });
};

const openAttachmentPicker = (mode: "image" | "gallery") => {
  lastSelectionRange = getCursor();
  attachmentSelectionMode.value = mode;
  attachmentSelectorModalShow.value = true;
};

const loadSongs = async () => {
  const api = editorConfig.value?.extension.songsApi || defaultEditorConfig.extension.songsApi;
  try {
    const response = await fetch(api);
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const list = Array.isArray(data) ? data : (data.songs ?? []);
    songs.value = (list as Record<string, unknown>[])
      .map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        artist: String(item.artist ?? ""),
        url: String(item.url ?? ""),
        cover: String(item.cover ?? ""),
        lrc: String(item.lrc ?? ""),
      }))
      .filter((song) => Boolean(song.name && song.url));
  } catch {
    songs.value = [];
    vditor.value?.tip("歌曲列表加载失败，请检查 aplayer-backend 插件与歌曲接口配置", 3000);
  }
};

const openSongPicker = async (mode: "inline" | "moment") => {
  lastSelectionRange = getCursor();
  songPickerMode.value = mode;
  songPickerShow.value = true;
  await loadSongs();
};

const selectSong = (song: EditorSong) => {
  if (songPickerMode.value === "moment") {
    // 瞬间音乐只进内存缓存，发布时追加到 raw 末尾
    pendingMomentSongs.value = [...pendingMomentSongs.value, song];
    debounceOnUpdate();
    if (reopenMediaPreview.value) {
      reopenMediaPreview.value = false;
      mediaPreviewShow.value = true;
    }
  } else {
    // 普通音乐：插入简短链接到光标位置，信息藏在 URL 参数里，原位渲染
    setCursor(lastSelectionRange);
    vditor.value?.insertValue(`\n\n${buildMusicLink(song)}\n\n`);
  }
  songPickerShow.value = false;
  vditor.value?.focus();
};

const openMediaPreview = () => {
  mediaPreviewShow.value = true;
};

// 从预览面板里点「添加」时，先关掉面板再开选择器，避免弹窗被面板遮住
const editGalleryFromPreview = () => {
  reopenMediaPreview.value = true;
  mediaPreviewShow.value = false;
  openAttachmentPicker("gallery");
};
const editMomentFromPreview = () => {
  reopenMediaPreview.value = true;
  mediaPreviewShow.value = false;
  openSongPicker("moment");
};

const FULLSCREEN_STYLE_ID = "plugin-vditor-fullscreen-token";

// 全屏 Token：按插件设置里的名称取对应配色变量，只在全屏容器内生效
const removeFullscreenToken = () => {
  document.getElementById(FULLSCREEN_STYLE_ID)?.remove();
};

const applyFullscreenToken = () => {
  removeFullscreenToken();
  if (!isFullscreen.value) return;
  const config = editorConfig.value?.fullscreen;
  const name = config?.activeToken?.trim();
  if (!name) return;
  const token = (config?.tokens || []).find((item) => item?.name?.trim() === name);
  const css = token?.css?.trim();
  if (!css) return;
  const style = document.createElement("style");
  style.id = FULLSCREEN_STYLE_ID;
  // Vditor 原生变量定义在 .vditor 上（会覆盖继承值），必须直接在选择器上映射；
  // 标题下边框在内容主题里是硬编码颜色，也需要显式覆盖。
  style.textContent = `
#plugin-vditor-mde.is-fullscreen {
${css}
}
#plugin-vditor-mde.is-fullscreen .vditor {
  --border-color: var(--hs-vditor-border, #d1d5da);
  --second-color: var(--hs-vditor-muted, rgba(88, 96, 105, 0.36));
  --panel-background-color: var(--hs-vditor-bg, #fff);
  --panel-shadow: var(--hs-vditor-panel-shadow, 0 1px 2px rgba(0, 0, 0, 0.2));
  --toolbar-background-color: var(--hs-vditor-toolbar-bg, #f6f8fa);
  --toolbar-icon-color: var(--hs-vditor-fg, #586069);
  --toolbar-icon-hover-color: var(--hs-vditor-link, #4285f4);
  --textarea-background-color: var(--hs-vditor-bg, #fff);
  --textarea-text-color: var(--hs-vditor-fg, #24292e);
  --resize-icon-color: var(--hs-vditor-fg, #586069);
  --resize-background-color: var(--hs-vditor-toolbar-bg, #f6f8fa);
  --resize-hover-icon-color: var(--hs-vditor-bg, #fff);
  --resize-hover-background-color: var(--hs-vditor-link, #4285f4);
  --count-background-color: var(--hs-vditor-selection, rgba(27, 31, 35, 0.05));
  --heading-border-color: var(--hs-vditor-border, #eaecef);
  --blockquote-color: var(--hs-vditor-muted, #6a737d);
  --ir-heading-color: var(--hs-vditor-fg, #660e7a);
  --ir-title-color: var(--hs-vditor-muted, #808080);
  --ir-bi-color: var(--hs-vditor-link, #0033b3);
  --ir-link-color: var(--hs-vditor-link, #008000);
  --ir-bracket-color: var(--hs-vditor-link, #0000ff);
  --ir-paren-color: var(--hs-vditor-link, #008000);
}
#plugin-vditor-mde.is-fullscreen .vditor-reset h1,
#plugin-vditor-mde.is-fullscreen .vditor-reset h2,
#plugin-vditor-mde.is-fullscreen .vditor-reset h3,
#plugin-vditor-mde.is-fullscreen .vditor-reset h4,
#plugin-vditor-mde.is-fullscreen .vditor-reset h5,
#plugin-vditor-mde.is-fullscreen .vditor-reset h6 {
  border-bottom-color: var(--hs-vditor-border, #eaecef);
}
`;
  document.head.appendChild(style);
};

const setFullscreen = (value: boolean) => {
  isFullscreen.value = value;
  if (value) {
    applyFullscreenToken();
  } else {
    removeFullscreenToken();
  }
};

const toggleFullscreen = () => {
  setFullscreen(!isFullscreen.value);
};

// 支持 ?mode=fullscreen 自动进入全屏（兼容 full-screen / fullscreen=1，以及 hash 路由参数）
const detectAutoFullscreen = () => {
  const search = window.location.search.includes("?")
    ? window.location.search
    : window.location.hash.includes("?")
      ? `?${window.location.hash.split("?")[1]}`
      : "";
  const params = new URLSearchParams(search);
  const mode = (params.get("mode") || "").toLowerCase();
  return (
    mode === "fullscreen" ||
    mode === "full-screen" ||
    (params.get("fullscreen") || "").toLowerCase() === "1"
  );
};

const removeGalleryImage = (index: number) => {
  pendingGallery.value = { images: pendingGallery.value.images.filter((_url, i) => i !== index) };
  debounceOnUpdate();
};

const removeMomentSong = (index: number) => {
  pendingMomentSongs.value = pendingMomentSongs.value.filter((_song, i) => i !== index);
  debounceOnUpdate();
};

// 加密按钮：只把选中内容包成编辑器开闭块，实际加解密全自动
const markSelectionSecret = () => {
  if (!editorConfig.value?.security.encryptionKey) {
    vditor.value?.tip("请先在插件设置中填写加密密钥", 3000);
    return;
  }
  const selected = vditor.value?.getSelection() || "";
  if (selected.trim()) {
    vditor.value?.deleteValue();
    vditor.value?.insertValue(`\n${buildSecretEditorBlock(selected)}\n`);
    vditor.value?.tip("已标记为加密内容，保存时自动加密", 2000);
  } else {
    // 未选中：插入带空行的开闭块，空行处可直接输入
    vditor.value?.insertValue(`\n${buildSecretEditorBlock("")}\n`);
    vditor.value?.tip("已在空行处插入加密块，直接输入即可", 2000);
  }
};

const toggleSourceMode = () => {
  const currentMode = vditor.value?.getCurrentMode();
  const nextMode = currentMode === "sv" ? "ir" : "sv";
  const button = document.querySelector<HTMLButtonElement>(
    `#plugin-vditor-mde .vditor-toolbar button[data-mode="${nextMode}"]`,
  );
  if (!button) {
    vditor.value?.tip("源码模式切换失败", 2000);
    return;
  }
  setCursor(lastSelectionRange);
  button.click();
};

const handleSourceShortcut = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "/") {
    event.preventDefault();
    toggleSourceMode();
    return;
  }
  if (event.key === "Escape" && isFullscreen.value) {
    // 有自己的弹窗打开时优先让弹窗处理 Esc
    if (mediaPreviewShow.value || songPickerShow.value || attachmentSelectorModalShow.value) return;
    setFullscreen(false);
  }
};

onUnmounted(async () => {
  window.removeEventListener("keydown", handleSourceShortcut);
  removeFullscreenToken();
  document.querySelectorAll("script[id^='vditor']").forEach((el) => el.remove());
  document.querySelectorAll("link[id^='vditor']").forEach((el) => el.remove());
  vditorLoaded.value = false;
});

onMounted(async () => {
  window.addEventListener("keydown", handleSourceShortcut);
  // URL 带 mode=fullscreen 时自动进入全屏（配置异步加载后由下方逻辑补上 Token）
  if (detectAutoFullscreen()) setFullscreen(true);
  // 实验性功能: 获取当前语言
  const lang = localStorage.getItem("locale") || "zh-CN";
  try {
    const response = await fetch("/apis/api.vditor.mczhengyi.top/editor-options");
    editorConfig.value = await response.json();
  } catch {
    // ignore this
    editorConfig.value = defaultEditorConfig;
  }
  if (!editorConfig.value) return;
  // 配置异步返回后，若已处于全屏则应用对应 Token
  if (isFullscreen.value) applyFullscreenToken();
  // Assign allowImage
  allowImageUpload = allowImageUpload.concat(
    editorConfig.value.extension.allowImageType.split(",").map((i) => i.trim()),
  );
  console.log("ALLOW", allowImageUpload);
  // 禁用HTML代码块隐藏
  if (editorConfig.value.basic.disableHTMLBlockPreview)
    addStyle(
      "[data-type=html-block] pre {display: block!important;}\n" +
        ".vditor-ir__node[data-type=html-block] .vditor-ir__marker {height: auto; width: auto; display: inline;}",
      "vditor-mde-hide-html",
    );
  // Debug Mode
  debugMode.value = editorConfig.value.developer.debugger;
  // Quick Insert Process
  const qil = await fetchAllQuickInsert(editorConfig.value.basic.quickInsertUrl);
  qil.forEach((q) => {
    quickInsertInject(q.inject || [], q.provider);
  });
  // Get all custom render script
  const renderScripts = await fetchAllCustomRenderScripts(editorConfig.value?.basic.customRenders);
  // Create Vditor
  vditor.value = new Vditor(
    vditorRef.value,
    getOptions({
      defaultRenderMode: editorConfig.value.basic.defaultRenderMode,
      typeWriterMode: editorConfig.value.basic.typeWriterMode,
      after: async () => {
        let content = props.raw || "";
        // 九宫格/瞬间音乐交给内存缓存管理，编辑区里不显示这些标记
        const pending = extractPendingFromRaw(content);
        content = pending.editorRaw;
        pendingGallery.value = { images: pending.galleryImages };
        pendingMomentSongs.value = pending.momentSongs;
        // raw 里是密文，加载时用设置里的密钥自动解密成编辑器明文
        const password = editorConfig.value?.security.encryptionKey || "";
        try {
          content = await decodeSecretRawForEditor(content, password);
        } catch (error) {
          console.error("[hs-secret] 自动解密失败", error);
        }
        if (editorConfig.value?.basic.firstH1AsTitle) {
          internalTitle.value = props.title;
          content = `# ${props.title}\n\n` + content;
        }
        vditor.value?.setValue(content);
        vditorLoaded.value = true;
        debounceOnUpdate();
      },
      input: debounceOnUpdate,
      showAttachment: () => {
        openAttachmentPicker("image");
      },
      language: lang,
      codeBlockPreview: editorConfig.value.basic.codeBlockPreview,
      uploadImage: (files: File[]) => {
        console.log("UPLOAD IMAGE");
        if (imageUploadLock) {
          vditor.value?.tip("当前已经存在正在上传的文件，请等待上传完成", 2000);
          return;
        }

        if (files.length < 1) {
          vditor.value?.tip("未选择文件或文件无效，请重试", 2000);
          return null;
        }
        // Upload
        if (props.uploadImage) {
          vditor.value?.disabled();
          vditor.value?.tip("正在上传图片...", 2000);
          // Check image extensions
          const rest = files.filter((f) => {
            const ext = f.name.slice(f.name.lastIndexOf(".") + 1).toLowerCase();
            return allowImageUpload.indexOf(ext) !== -1;
          });
          const skipped = files.length - rest.length;
          if (skipped > 0) {
            vditor.value?.tip(`有 ${skipped} 个文件类型不被允许，已跳过`, 2000);
          }
          // Upload images
          (async () => {
            const result = await Promise.allSettled(rest.map((f) => props.uploadImage!(f)));
            let hasError = false;
            for (const r of result) {
              if (r && r.status === "rejected") {
                hasError = true;
              } else {
                const ret = r.value;
                if (ret && ret.status) {
                  vditor.value?.insertValue(`\n\n![${ret.spec.displayName}](${ret.status.permalink})\n\n`);
                }
              }
            }
            if (hasError) {
              vditor.value?.tip("图片上传完成，有文件上传失败，请检查网络", 2000);
            } else {
              vditor.value?.tip("图片上传完成", 2000);
            }
            vditor.value?.enable();
            vditor.value?.focus();
          })();
        }
        return null;
      },
      openModal: (schema: Schema) => {
        lastSelectionRange = getCursor();
        customInsertSchema.value = schema;
        customInsertOpen.value = true;
      },
      enableQuickInsert: editorConfig.value.basic.enableQuickInsert,
      quickInsertList: qil,
      config: editorConfig.value,
      customRenders: renderScripts,
      actions: [
        "desktop",
        "mobile",
        "tablet",
        "mp-wechat",
        "zhihu",
        {
          key: "mp-wechat-custom",
          text: "复制到微信公众号（测试版）",
          click: () => {
            const doc = vditor.value?.vditor.preview?.previewElement;
            if (!doc) return;
            const options = vditor.value?.vditor.options;
            if (!options) return;
            // Load vditor css file
            const cdn = options.cdn;
            const themePath = options.preview?.theme?.path || `${cdn}/dist/css/content-theme`;
            const theme = options.preview?.theme?.current || "light";
            const hljsTheme = options.preview?.hljs?.style || "github";
            const css = [
              `${cdn}/dist/index.css`,
              `${themePath}/${theme}.css`,
              `${cdn}/dist/js/highlight.js/styles/${hljsTheme}.min.css`,
              `${cdn}/dist/js/katex/katex.min.css`,
            ];
            Promise.all(css.map((url) => fetch(url).then((res) => res.text()))).then((contentList) => {
              let css = "";
              contentList.forEach((content) => (css += content + "\n\n"));
              doc.querySelectorAll(".katex-html .base").forEach((item: Element) => {
                (item as HTMLElement).style.display = "initial";
              });
              const html = juice(`<div class="vditor-reset">${doc.innerHTML}</div>`, {
                extraCss: css,
              });
              copyAsHTML(html).then(() => {
                vditor.value?.tip("已复制，部分样式可能会丢失！", 2000);
              });
            });
          },
        },
      ],
    }),
  );
});

const update = (val: string | null) => {
  setCursor(lastSelectionRange);
  if (!val) {
    vditor.value?.tip("未知错误，插入失败", 3000);
  } else {
    vditor.value?.focus();
    vditor.value?.insertValue(`${val}`);
  }
  customInsertOpen.value = false;
};
</script>

<template>
  <div
    id="plugin-vditor-mde"
    :class="{ h1AsTitle: editorConfig?.basic.firstH1AsTitle, 'is-fullscreen': isFullscreen }"
  >
    <VLoading v-if="!vditorLoaded" class="hs-vditor-loading" />
    <DebugPanel v-if="debugMode" :config="editorConfig" :vditor="vditor" :cursor="lastSelectionRange" />
    <div id="vditor" ref="vditorRef"></div>

    <div class="hs-editor-toolbar" aria-label="编辑器工具栏">
      <button type="button" title="插入图片" @click="openAttachmentPicker('image')">
        <span class="hs-toolbar-icon" aria-hidden="true" v-html="TOOLBAR_ICONS.image"></span>
      </button>
      <button type="button" title="插入音乐播放器" @click="openSongPicker('inline')">
        <span class="hs-toolbar-icon" aria-hidden="true" v-html="TOOLBAR_ICONS.music"></span>
      </button>
      <button type="button" title="将选中内容标记为加密（保存时自动加密）" @click="markSelectionSecret">
        <span class="hs-toolbar-icon" aria-hidden="true" v-html="TOOLBAR_ICONS.secret"></span>
      </button>
      <button type="button" title="管理九宫格图片与瞬间音乐" @click="openMediaPreview">
        <span class="hs-toolbar-icon" aria-hidden="true" v-html="TOOLBAR_ICONS.moment"></span>
      </button>
      <button type="button" title="切换源码模式（Ctrl+/）" @click="toggleSourceMode">
        <span class="hs-toolbar-icon" aria-hidden="true" v-html="TOOLBAR_ICONS.source"></span>
      </button>
      <button type="button" :title="isFullscreen ? '退出全屏（Esc）' : '全屏编辑'" @click="toggleFullscreen">
        <span class="hs-toolbar-icon" aria-hidden="true" v-html="TOOLBAR_ICONS.fullscreen"></span>
      </button>
    </div>

    <TemplateModal
      :open="customInsertOpen"
      :schema="customInsertSchema"
      @close="customInsertOpen = false"
      @done="update"
    />
    <SongPickerModal
      :open="songPickerShow"
      :songs="songs"
      @close="songPickerShow = false"
      @select="selectSong"
    />
    <MediaPreviewModal
      :open="mediaPreviewShow"
      :gallery-images="pendingGallery.images"
      :moment-songs="pendingMomentSongs"
      @close="mediaPreviewShow = false"
      @edit-gallery="editGalleryFromPreview"
      @edit-moment="editMomentFromPreview"
      @remove-gallery="removeGalleryImage"
      @remove-moment="removeMomentSong"
    />

    <AttachmentSelectorModal
      v-model:visible="attachmentSelectorModalShow"
      :accepts="['image/*']"
      :max="attachmentSelectionMode === 'gallery' ? 9 : 20"
      @select="attachmentSelect"
    />
  </div>
</template>

<style>
#plugin-vditor-mde {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* 全屏 = 非全屏布局 + 放大，只改定位与底色，其余全部复用非全屏样式 */
#plugin-vditor-mde.is-fullscreen {
  position: fixed;
  inset: 0;
  /* 低于所有弹窗层级（我们的 2050/2200、Halo 的 2000/9999+），保证全屏下弹窗仍可操作 */
  z-index: 1990;
  min-height: 0;
  background: var(--hs-vditor-bg, var(--halo-surface, #fff));
}

#plugin-vditor-mde.is-fullscreen #vditor {
  flex: 1 1 auto;
  height: auto;
}

/* 与主题一致的字体策略（苹方优先），只换字体、不改布局 */
#plugin-vditor-mde.is-fullscreen .vditor-reset {
  font-family: var(
    --hs-vditor-font-family,
    "PingFang SC",
    system-ui,
    -apple-system,
    "Segoe UI",
    "Microsoft YaHei",
    sans-serif
  );
}

#plugin-vditor-mde .hs-vditor-loading {
  min-height: 480px;
}

#plugin-vditor-mde #vditor {
  flex: 1 1 auto;
  min-height: 320px;
}

#plugin-vditor-mde .vditor-toolbar,
#plugin-vditor-mde .vditor-outline,
#plugin-vditor-mde .vditor-counter,
#plugin-vditor-mde .vditor-preview {
  display: none !important;
}

.hs-editor-toolbar {
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--hs-vditor-border, var(--halo-divider, #e5e7eb));
  background: var(--hs-vditor-toolbar-bg, var(--halo-surface, #fff));
  color: var(--hs-vditor-fg, inherit);
}

.hs-editor-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--hs-vditor-border, var(--halo-divider, #d1d5db));
  border-radius: 50%;
  background: var(--hs-vditor-toolbar-bg, var(--halo-surface, #fff));
  color: var(--hs-vditor-fg, inherit);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.hs-editor-toolbar .hs-toolbar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  line-height: 0;
}

.hs-editor-toolbar .hs-toolbar-icon svg {
  display: block;
  width: 100%;
  height: 100%;
}

.hs-editor-toolbar button:hover:not(:disabled) {
  background: var(--hs-vditor-selection, var(--halo-fill, rgba(0, 0, 0, 0.05)));
}

.hs-editor-toolbar button:disabled {
  opacity: 0.55;
  cursor: wait;
}

#plugin-vditor-mde ol {
  list-style: decimal;
}

/** Fix Link color in wysiwyg mode */

#plugin-vditor-mde a {
  color: var(--hs-vditor-link, #3478cd);
}

/** Fix content was covered by vditor panel in wysiwyg mode  */
#plugin-vditor-mde button,
#plugin-vditor-mde input {
  line-height: normal;
}

.insert-modals label {
  width: 100%;
  display: flex;
}

.insert-modals label span {
  width: 60px;
  text-align: right;
}

.insert-modals select {
  border: 1px solid #cccccc;
  border-radius: 3px;
  padding-top: 8px;
  padding-bottom: 8px;
  margin-left: 10px;
  flex: 1;
}

.insert-modals textarea {
  border: 1px solid #cccccc;
  border-radius: 3px;
  margin-left: 10px;
  flex: 1;
}

.insert-modals input[type="text"] {
  border: 1px solid #cccccc;
  border-radius: 3px;
  margin-left: 10px;
  flex: 1;
  padding: 8px 10px;
}

/* title */
#plugin-vditor-mde.h1AsTitle .vditor-ir h1:first-child::before,
#plugin-vditor-mde.h1AsTitle .vditor-wysiwyg h1:first-child::before {
  content: "T";
}

#plugin-vditor-mde.h1AsTitle .vditor-ir h1:first-child,
#plugin-vditor-mde.h1AsTitle .vditor-wysiwyg h1:first-child {
  border-bottom: 2px solid var(--hs-vditor-border, var(--heading-border-color, #eaecef));
  color: var(--hs-vditor-fg, #333333);
  text-align: left;
  text-decoration: none;
  font-size: 2rem;
  background: none;
}

/**
 Fix compatible issues with docsme.
 https://github.com/justice2001/halo-plugin-vditor/issues/38
*/
#plugin-vditor-mde code[class*="language-"],
#plugin-vditor-mde pre[class*="language-"] {
  color: #000000;
}
</style>
