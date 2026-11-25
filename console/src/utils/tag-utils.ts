const TAG_LIST_API = "/apis/api.content.halo.run/v1alpha1/tags?size=1000";
const TAG_CREATE_API = "/apis/content.halo.run/v1alpha1/tags";
const POST_API = "/apis/uc.api.content.halo.run/v1alpha1/posts";

export interface TagInfo {
  name: string;
  displayName: string;
  slug: string;
  permalink: string;
  location: boolean;
  matchText: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const describeFailure = async (response: Response): Promise<string> => {
  if (response.status === 401) return "请先登录后再操作。";
  if (response.status === 403) return "当前账号没有操作权限。";
  try {
    const body = (await response.json()) as Record<string, any>;
    return String(body?.detail || body?.title || `请求失败（${response.status}）`);
  } catch {
    return `请求失败（${response.status}）`;
  }
};

const shortId = () => Math.random().toString(36).slice(2, 10);

/** Halo 文章编辑器把 metadata.name 放在路由的 name 参数里，兼容 hash 路由。 */
export const getPostNameFromRoute = (): string => {
  let search = window.location.search;
  if (!search.includes("?") && window.location.hash.includes("?")) {
    search = `?${window.location.hash.split("?")[1]}`;
  }
  return new URLSearchParams(search).get("name") || "";
};

const withPlainPath = (url: string): string => {
  try {
    const target = new URL(url, window.location.origin);
    return target.pathname + target.search + target.hash;
  } catch {
    return url;
  }
};

const withMomentScope = (url: string): string => {
  try {
    const target = new URL(url, window.location.origin);
    target.searchParams.set("scope", "moment");
    return target.pathname + target.search + target.hash;
  } catch {
    return `/tags/${encodeURIComponent(url)}?scope=moment`;
  }
};

export const parseTag = (raw: unknown): TagInfo | null => {
  const item = raw as Record<string, any>;
  const name = String(item?.metadata?.name ?? "");
  if (!name) return null;
  const displayName = String(item?.spec?.displayName ?? name);
  const slug = String(item?.spec?.slug ?? name);
  const permalink = String(item?.status?.permalink ?? `/tags/${slug}`);
  const prefixed = [displayName, name, slug].find((value) => /^loc[_-]/i.test(value));
  const location = Boolean(prefixed);
  let matchText = displayName;
  if (location) {
    const source = /^loc[_-]/i.test(displayName) ? displayName : prefixed || displayName;
    matchText = source.replace(/^loc[_-]/i, "");
  }
  if (!matchText) return null;
  return { name, displayName, slug, permalink, location, matchText };
};

export const loadAllTags = async (): Promise<TagInfo[]> => {
  try {
    const response = await fetch(TAG_LIST_API, { credentials: "same-origin" });
    if (!response.ok) return [];
    const data = (await response.json()) as Record<string, any>;
    const items = Array.isArray(data) ? data : (data?.items ?? []);
    return (items as unknown[])
      .map(parseTag)
      .filter((tag): tag is TagInfo => Boolean(tag));
  } catch {
    return [];
  }
};

/** 读取文章当前关联的标签名，优先取草稿上的值以反映未发布修改。 */
export const fetchPostTagNames = async (name: string): Promise<string[]> => {
  if (!name) return [];
  try {
    const [postResponse, draftResponse] = await Promise.all([
      fetch(`${POST_API}/${name}`, { credentials: "same-origin" }),
      fetch(`${POST_API}/${name}/draft?patched=false`, { credentials: "same-origin" }),
    ]);
    const response = draftResponse.ok ? draftResponse : postResponse;
    if (!response.ok) return [];
    const data = (await response.json()) as Record<string, any>;
    const tags = data?.spec?.tags;
    return Array.isArray(tags) ? tags.map(String) : [];
  } catch {
    return [];
  }
};

/** 把当前标签关联写入文章，只改 spec.tags，不碰正文/发布时间/可见性。 */
export const pushTagAssociations = async (name: string, tags: string[]): Promise<void> => {
  if (!name) return;
  const latestResponse = await fetch(`${POST_API}/${name}`, { credentials: "same-origin" });
  if (!latestResponse.ok) throw new Error(await describeFailure(latestResponse));
  const latest = (await latestResponse.json()) as Record<string, any>;
  const updated = { ...latest, spec: { ...latest.spec, tags } };
  const response = await fetch(`${POST_API}/${name}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  if (!response.ok) throw new Error(await describeFailure(response));
};

export const createTagByText = async (
  text: string,
  location: boolean,
  allTags: TagInfo[],
): Promise<TagInfo> => {
  const displayName = location ? `loc_${text}` : text;
  const slug = `${location ? "loc-" : "tag-"}${shortId()}`;
  const response = await fetch(TAG_CREATE_API, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiVersion: "content.halo.run/v1alpha1",
      kind: "Tag",
      metadata: { generateName: "tag-" },
      spec: { displayName, slug },
    }),
  });
  if (!response.ok) throw new Error(await describeFailure(response));
  const created = parseTag(await response.json());
  if (!created) throw new Error("标签已创建，但读取结果异常。");
  allTags.push(created);
  return created;
};

/** 优先复用已有标签，找不到就新建；位置标签统一补 loc_ 语义。 */
export const findOrCreateTag = async (
  text: string,
  location: boolean,
  allTags: TagInfo[],
): Promise<TagInfo> => {
  const trimmed = text.trim().replace(/^loc[_-]/i, "");
  const pool = allTags.filter((tag) => tag.location === location);
  const lower = trimmed.toLocaleLowerCase();
  const hit =
    pool.find(
      (tag) =>
        tag.matchText.toLocaleLowerCase() === lower ||
        tag.displayName.toLocaleLowerCase() === lower ||
        tag.name.toLocaleLowerCase() === lower,
    ) || pool.find((tag) => tag.matchText.toLocaleLowerCase().includes(lower));
  return hit || createTagByText(trimmed, location, allTags);
};

/** 把代码、已有链接、图片、裸 URL 遮住，避免标签匹配误伤。 */
const maskLine = (line: string, inFence: boolean): { masked: string; nextFence: boolean } => {
  const chars = line.split("");
  const flags = Array.from({ length: line.length }, () => false);
  const mark = (start: number, end: number) => {
    for (let i = start; i < end; i += 1) if (i >= 0 && i < flags.length) flags[i] = true;
  };
  const build = () => chars.map((char, index) => (flags[index] ? "\u0000" : char)).join("");

  if (/^\s*(```|~~~)/.test(line)) {
    mark(0, line.length);
    return { masked: build(), nextFence: !inFence };
  }
  if (inFence) {
    mark(0, line.length);
    return { masked: build(), nextFence: true };
  }

  const patterns = [/`[^`]*`/g, /!?\[[^\]]*\]\([^)]*\)/g, /https?:\/\/\S+/g];
  patterns.forEach((pattern) => {
    for (const match of line.matchAll(pattern)) {
      if (match.index !== undefined) mark(match.index, match.index + match[0].length);
    }
  });
  return { masked: build(), nextFence: false };
};

const maskedBody = (raw: string): string => {
  let fence = false;
  return raw
    .split("\n")
    .map((line) => {
      const result = maskLine(line, fence);
      fence = result.nextFence;
      return result.masked;
    })
    .join("\n")
    .toLocaleLowerCase();
};

/** 正文里匹配到的普通标签（位置标签只用于手动定位和联想，不自动关联）。 */
export const autoMatchTagNames = (raw: string, tags: TagInfo[]): TagInfo[] => {
  const masked = maskedBody(raw);
  return tags.filter(
    (tag) => !tag.location && tag.matchText.length >= 2 && masked.includes(tag.matchText.toLocaleLowerCase()),
  );
};

/** 正文里出现但不一定关联的位置标签：只把文字转链接，不写入 spec.tags。 */
export const matchLocationTags = (raw: string, tags: TagInfo[]): TagInfo[] => {
  const masked = maskedBody(raw);
  return tags.filter(
    (tag) => tag.location && tag.matchText.length >= 2 && masked.includes(tag.matchText.toLocaleLowerCase()),
  );
};

export const unlinkTagInMarkdown = (raw: string, tag: TagInfo): string => {
  const hrefs = Array.from(
    new Set([
      withMomentScope(tag.permalink),
      withPlainPath(tag.permalink),
      tag.permalink,
      `/tags/${tag.slug}?scope=moment`,
      `/tags/${tag.slug}?scop=moment`,
      `/tags/${tag.slug}`,
    ]),
  );
  const hrefPattern = hrefs.map(escapeRegExp).join("|");
  const pattern = new RegExp(`\\[${escapeRegExp(tag.matchText)}\\]\\((?:${hrefPattern})\\)`, "g");
  return raw.replace(pattern, tag.matchText);
};

/** 检测前把已有标签链接还原成纯文字，避免重复链接。 */
export const plainBodyForMatch = (raw: string, tags: TagInfo[]): string =>
  tags.reduce((acc, tag) => unlinkTagInMarkdown(acc, tag), raw);

/**
 * 只在生成 raw 时调用：把已关联标签与正文命中的位置标签转成链接。
 * 每个标签只替换正文第一处，不写回编辑器。
 */
export const linkTagsInMarkdown = (
  raw: string,
  tags: TagInfo[],
  selected: Set<string>,
  linkOnlyTags: TagInfo[] = [],
  momentScope = true,
): string => {
  const linkOnlyNames = new Set(linkOnlyTags.map((tag) => tag.name));
  const usable = tags
    .filter((tag) => (selected.has(tag.name) || linkOnlyNames.has(tag.name)) && tag.matchText.length >= 2)
    .sort((a, b) => b.matchText.length - a.matchText.length);
  if (!usable.length) return raw;

  let inFence = false;
  const linked = new Set<string>();
  return raw
    .split("\n")
    .map((line) => {
      const masked = maskLine(line, inFence);
      inFence = masked.nextFence;
      const lower = masked.masked.toLocaleLowerCase();
      const edits: { start: number; end: number; text: string }[] = [];

      usable.forEach((tag) => {
        if (linked.has(tag.name)) return;
        const needle = tag.matchText.toLocaleLowerCase();
        const index = lower.indexOf(needle);
        if (index < 0) return;
        const end = index + tag.matchText.length;
        if (edits.some((edit) => index < edit.end && end > edit.start)) return;
        const href = momentScope ? withMomentScope(tag.permalink) : withPlainPath(tag.permalink);
        edits.push({ start: index, end, text: `[${tag.matchText}](${href})` });
        linked.add(tag.name);
      });

      edits.sort((a, b) => b.start - a.start);
      return edits.reduce((acc, edit) => acc.slice(0, edit.start) + edit.text + acc.slice(edit.end), line);
    })
    .join("\n");
};
