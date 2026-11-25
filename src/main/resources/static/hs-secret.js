/**
 * 前台加密内容解密脚本
 *
 * 编辑器把密文以 ::hs-secret:v1:<base64url>:: 写入 raw，
 * 渲染管线把它展开成 <p class="hs-secret" data-hs-secret="...">。
 * 登录态由主题模板的 sec:authorize 标记提供（data-hs-auth），匿名不启用任何点击。
 * 密钥只在本次页面会话的内存中保存，刷新即丢失；不写 localStorage。
 */
(function () {
  if (window.__hsSecretReady) return;
  window.__hsSecretReady = true;

  var MODAL_ID = "hs-secret-modal";
  var ITERATIONS = 210000;
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();


  var activeTarget = null;
  // pjax 换页不重载此脚本，密钥跨 pjax 保留；只有整页刷新才会清空。
  var sessionPassword = "";
  var eventsBound = false;

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
    // 插件已注入自带 Lute，直接同步渲染，保留 h1~h6 / 列表 / 引用等结构
    if (window.Lute && typeof window.Lute.New === "function") {
      var lute = window.Lute.New();
      if (typeof lute.SetHeadingID === "function") lute.SetHeadingID(false);
      return Promise.resolve(lute.Md2HTML(markdown)).then(sanitizeHtml);
    }
    // 极端情况下 Lute 未加载，退化为纯文本，保证内容仍可读
    return Promise.resolve(
      '<div class="hs-secret-plaintext">' + escapeHtml(markdown).replace(/\n/g, "<br />") + "</div>",
    );
  }

  function rerenderMath() {
    if (window.vditorRender && typeof window.vditorRender.render === "function") {
      try {
        window.vditorRender.render();
      } catch (e) {
        console.warn("[hs-secret] 重新渲染公式失败", e);
      }
    }
  }

  function setTargetLabel(target, expanded) {
    var lock = target.querySelector(".hs-secret-lock");
    if (!lock) return;
    if (expanded) {
      if (!target.__hsSecretCollapsedHtml) target.__hsSecretCollapsedHtml = lock.innerHTML;
      lock.innerHTML =
        "<span class=\"hs-secret-lock-icon\" aria-hidden=\"true\">🔓</span>" +
        "<span>以下部分仅自己可见</span>" +
        "<span class=\"hs-secret-lock-arrow\" aria-hidden=\"true\">🔽</span>";
      lock.setAttribute("aria-label", "收起加密内容");
    } else if (target.__hsSecretCollapsedHtml) {
      lock.innerHTML = target.__hsSecretCollapsedHtml;
      lock.setAttribute("aria-label", "该部分仅登录用户可见");
    }
  }

  function setOpen(target, open) {
    var content = target.__hsSecretContent;
    var end = target.__hsSecretEnd;
    if (!content) return;
    var body = content.querySelector(".hs-secret-content-body");
    if (content._toggleTimer) {
      clearTimeout(content._toggleTimer);
      content._toggleTimer = 0;
    }
    setTargetLabel(target, open);
    if (open) {
      target.hidden = false;
      content.hidden = false;
      content.classList.add("is-open");
      if (end) end.hidden = false;
      body.style.overflow = "hidden";
      body.style.maxHeight = "0px";
      // 强制一次布局后再展开，确保 transition 生效
      void body.offsetHeight;
      requestAnimationFrame(function () {
        body.style.maxHeight = body.scrollHeight + "px";
      });
      content._toggleTimer = setTimeout(function () {
        body.style.maxHeight = "";
        body.style.overflow = "";
      }, 320);
    } else {
      body.style.overflow = "hidden";
      body.style.maxHeight = body.scrollHeight + "px";
      void body.offsetHeight;
      requestAnimationFrame(function () {
        body.style.maxHeight = "0px";
      });
      content._toggleTimer = setTimeout(function () {
        content.hidden = true;
        content.classList.remove("is-open");
        if (end) end.hidden = true;
        body.style.maxHeight = "";
        body.style.overflow = "";
      }, 300);
    }
  }


  function decryptInto(target, password) {
    return decryptText(target.getAttribute("data-hs-secret") || "", password)
      .then(function (plain) {
        return renderMarkdown(plain);
      })
      .then(function (html) {
        var content = document.createElement("div");
        content.className = "hs-secret-content";
        content.hidden = true;

        var body = document.createElement("div");
        body.className = "hs-secret-content-body";
        body.innerHTML = html;
        content.appendChild(body);

        var end = document.createElement("p");
        end.className = "hs-secret hs-secret-end";
        end.hidden = true;
        end.__hsSecretTarget = target;
        var endLock = document.createElement("button");
        endLock.type = "button";
        endLock.className = "hs-secret-lock hs-secret-end-lock";
        endLock.setAttribute("aria-label", "收起加密内容");
        endLock.innerHTML =
          "<span class=\"hs-secret-lock-icon\" aria-hidden=\"true\">🔓</span>" +
          "<span>以上部分仅自己可见</span>" +
          "<span class=\"hs-secret-lock-arrow\" aria-hidden=\"true\">🔼</span>";
        end.appendChild(endLock);

        target.__hsSecretContent = content;
        target.__hsSecretEnd = end;
        target.parentNode.insertBefore(content, target.nextSibling);
        target.parentNode.insertBefore(end, content.nextSibling);
        setOpen(target, true);
        rerenderMath();
      });
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
      '<div class="hs-secret-modal-title">该部分仅登录用户可见</div>' +
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

  function openModal(target, message) {
    var modal = ensureModal();
    activeTarget = target;
    var input = modal.querySelector(".hs-secret-modal-input");
    var error = modal.querySelector(".hs-secret-modal-error");
    input.value = "";
    error.hidden = true;
    error.textContent = "";
    modal.hidden = false;
    if (message) showError(modal, message);
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
    decryptInto(target, password)
      .then(function () {
        // 仅在本次页面会话内存中保留，刷新即失效
        sessionPassword = password;
        closeModal(modal);
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

  function onClick(event) {
    if (!isLoggedIn() || !(event.target instanceof Element)) return;
    var modal = document.getElementById(MODAL_ID);
    if (modal && !modal.hidden && event.target.closest("[data-hs-secret-close]")) {
      closeModal(modal);
      return;
    }

    var endLock = event.target.closest(".hs-secret-end-lock");
    if (endLock && !endLock.disabled) {
      var endHost = endLock.closest(".hs-secret");
      var endTarget = endHost && endHost.__hsSecretTarget;
      if (endTarget) setOpen(endTarget, false);
      return;
    }

    var lock = event.target.closest(".hs-secret-lock");
    if (lock && !lock.disabled) {
      var target = lock.closest(".hs-secret");
      if (!target) return;
      if (target.__hsSecretContent) {
        var content = target.__hsSecretContent;
        setOpen(target, !content.classList.contains("is-open"));
        return;
      }
      if (!sessionPassword) {
        openModal(target);
        return;
      }
      lock.setAttribute("aria-busy", "true");
      decryptInto(target, sessionPassword)
        .catch(function () {
          sessionPassword = "";
          openModal(target, "会话内密钥已失效，请重新输入");
        })
        .finally(function () {
          lock.removeAttribute("aria-busy");
        });
      return;
    }

    if (modal && !modal.hidden && event.target.closest(".hs-secret-modal-confirm")) {
      confirm(modal);
    }
  }


  function onKeydown(event) {
    if (!isLoggedIn() || event.key !== "Escape") return;
    var modal = document.getElementById(MODAL_ID);
    if (modal && !modal.hidden) closeModal(modal);
  }

  function isLoggedIn() {
    return !!document.querySelector('[data-hs-auth="logged-in"]');
  }

  function setLocksEnabled(enabled) {
    var locks = document.querySelectorAll(".hs-secret-lock");
    for (var i = 0; i < locks.length; i += 1) locks[i].disabled = !enabled;
  }

  function bindEvents() {
    if (eventsBound) return;
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
    eventsBound = true;
  }

  function unbindEvents() {
    if (!eventsBound) return;
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeydown);
    eventsBound = false;
  }

  function syncFromTemplate() {
    // pjax 可能换掉正文节点；若弹窗指向的旧节点已脱离文档，关掉弹窗，
    // 但保留 sessionPassword，避免同会话内重复输密钥。
    var modal = document.getElementById(MODAL_ID);
    if (modal && !modal.hidden && activeTarget && !document.contains(activeTarget)) closeModal(modal);
    var loggedIn = isLoggedIn();
    setLocksEnabled(loggedIn);
    if (loggedIn) bindEvents();
    else unbindEvents();
  }

  // 主题 pjax 在 window 上派发完成事件；这里同时兼容在 document 上派发的实现。
  // 新插入的加密块需要重新按模板登录态启用，sessionPassword 保持不变以维持同会话免密。
  ["pjax:complete", "halo:pjax:complete", "hs:pjax:ready", "hs:pjax:complete"].forEach(function (name) {
    window.addEventListener(name, syncFromTemplate);
    document.addEventListener(name, syncFromTemplate);
  });

  // 脚本由 PostContentHandler 注入在正文最前面，执行时加密按钮还没进入 DOM，
  // 必须等 DOM 就绪后再移除 disabled，否则登录用户也点不动。
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncFromTemplate, { once: true });
  } else {
    syncFromTemplate();
  }
})();
