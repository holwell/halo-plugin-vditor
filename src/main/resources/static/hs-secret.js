/**
 * 前台加密内容解密脚本
 *
 * 编辑器把密文以 ::hs-secret:v1:<base64url>:: 写入 raw，
 * 渲染管线把它展开成 <div class="hs-secret" data-hs-secret="...">。
 * 这里只在访客主动输入密钥后用 WebCrypto 在浏览器本地解密，
 * 密钥不会随页面下发，也不会被保存。
 */
(function () {
  if (window.__hsSecretReady) return;
  window.__hsSecretReady = true;

  var MODAL_ID = "hs-secret-modal";
  var ITERATIONS = 210000;
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();
  var activeTarget = null;

  function fromBase64Url(value) {
    var normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    var padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    var binary = atob(padded);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function deriveKey(password, salt, usages) {
    return crypto.subtle
      .importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (material) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" },
          material,
          { name: "AES-GCM", length: 256 },
          false,
          usages,
        );
      });
  }

  function parsePayload(value) {
    var text = String(value || "").trim();
    if (text.charAt(0) === "{") return JSON.parse(text);
    var normalized = text.replace(/-/g, "+").replace(/_/g, "/");
    var padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(fromBase64Url(padded)));
  }

  function decryptText(payloadText, password) {
    var payload = parsePayload(payloadText);
    if (!payload || payload.version !== 1 || !payload.salt || !payload.iv || !payload.cipher) {
      throw new Error("密文格式不支持");
    }
    return deriveKey(password, fromBase64Url(payload.salt), ["decrypt"]).then(function (key) {
      return crypto.subtle
        .decrypt({ name: "AES-GCM", iv: fromBase64Url(payload.iv) }, key, fromBase64Url(payload.cipher))
        .then(function (plain) {
          return decoder.decode(plain);
        });
    });
  }

  function sanitizeHtml(html) {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  }

  function renderMarkdown(markdown) {
    if (window.Vditor && typeof window.Vditor.md2html === "function") {
      return Promise.resolve(window.Vditor.md2html(markdown)).then(sanitizeHtml);
    }
    // 没有加载 Vditor 时退化为纯文本，保证内容仍可读
    return Promise.resolve(
      '<div class="hs-secret-plaintext">' + escapeHtml(markdown).replace(/\n/g, "<br />") + "</div>",
    );
  }

  function ensureModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "hs-secret-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="hs-secret-modal-mask" data-hs-secret-close></div>' +
      '<div class="hs-secret-modal-panel" role="dialog" aria-modal="true" aria-label="解密内容">' +
      '<div class="hs-secret-modal-title">解密内容</div>' +
      '<input type="password" class="hs-secret-modal-input" placeholder="请输入密钥" autocomplete="off" />' +
      '<div class="hs-secret-modal-error" hidden></div>' +
      '<div class="hs-secret-modal-actions">' +
      '<button type="button" class="hs-secret-modal-cancel" data-hs-secret-close>取消</button>' +
      '<button type="button" class="hs-secret-modal-confirm">解密</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(modal);
    return modal;
  }

  function closeModal(modal) {
    modal.hidden = true;
    activeTarget = null;
  }

  function openModal(target) {
    var modal = ensureModal();
    activeTarget = target;
    var input = modal.querySelector(".hs-secret-modal-input");
    var error = modal.querySelector(".hs-secret-modal-error");
    input.value = "";
    error.hidden = true;
    error.textContent = "";
    modal.hidden = false;
    input.focus();
  }

  function showError(modal, message) {
    var error = modal.querySelector(".hs-secret-modal-error");
    error.textContent = message;
    error.hidden = false;
  }

  function confirm(modal) {
    if (!activeTarget) return;
    var target = activeTarget;
    var password = modal.querySelector(".hs-secret-modal-input").value;
    if (!password) {
      showError(modal, "请输入密钥");
      return;
    }
    var button = modal.querySelector(".hs-secret-modal-confirm");
    button.disabled = true;
    button.textContent = "解密中";
    decryptText(target.getAttribute("data-hs-secret") || "", password)
      .then(function (plain) {
        return renderMarkdown(plain);
      })
      .then(function (html) {
        var content = document.createElement("div");
        content.className = "hs-secret-content";
        content.innerHTML = html;
        target.replaceWith(content);
        closeModal(modal);
        if (window.vditorRender && typeof window.vditorRender.render === "function") {
          try {
            window.vditorRender.render();
          } catch (e) {
            console.warn("[hs-secret] 重新渲染公式失败", e);
          }
        }
      })
      .catch(function (e) {
        showError(modal, "解密失败，请确认密钥是否正确");
        console.warn("[hs-secret] 解密失败", e);
      })
      .finally(function () {
        button.disabled = false;
        button.textContent = "解密";
      });
  }

  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) return;
    var modal = document.getElementById(MODAL_ID);
    if (modal && !modal.hidden && event.target.closest("[data-hs-secret-close]")) {
      closeModal(modal);
      return;
    }
    var lock = event.target.closest(".hs-secret-lock");
    if (lock) {
      var target = lock.closest(".hs-secret");
      if (target) openModal(target);
      return;
    }
    if (modal && !modal.hidden && event.target.closest(".hs-secret-modal-confirm")) {
      confirm(modal);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    var modal = document.getElementById(MODAL_ID);
    if (modal && !modal.hidden) closeModal(modal);
  });
})();
