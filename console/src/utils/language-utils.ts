export function getLanguage(lang = "zh-CN"): keyof II18n {
  switch (lang) {
    case "zh-CN":
      return "zh_CN";
    case "zh-TW":
      return "zh_TW";
    case "en-US":
      return "en_US";
    case "es":
      return "en_US";
    default:
      return "zh_CN";
  }
}
