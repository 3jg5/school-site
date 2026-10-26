(function () {
  "use strict";

  var UI = window.FarooqUI;
  var Store = window.FarooqStore;
  var config = window.SITE_CONFIG || {};

  var DRIVE_API = "https://www.googleapis.com/drive/v3/files";
  var DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
  var FOLDER_MIME = "application/vnd.google-apps.folder";
  var DRIVE_SCOPE = "openid email profile https://www.googleapis.com/auth/drive";

  var state = {
    authenticated: false,
    dataStarted: false,
    news: [],
    announcements: [],
    libraryMeta: [],
    settings: {},
    loaded: { news: false, announcements: false, settings: false },
    editingNewsId: null,
    editingAnnouncementId: null,
    editingDriveItem: null,
    deleteTarget: null,
    uploadedImage: null,
    existingImage: "",
    settingsFilled: false,
    driveAdmin: {
      rootId: "",
      stack: [],
      items: [],
      loading: false,
      error: "",
      token: "",
      email: "",
      tokenExpiresAt: 0,
      tokenTimer: null,
      tokenClient: null,
      tokenClientId: "",
      connectedAt: null
    },
    status: Store.getStatus(),
    auth: Store.getAuthState()
  };

  var els = {};

  function formatCount(value) {
    try {
      return new Intl.NumberFormat("ar-OM").format(value);
    } catch (error) {
      return String(value);
    }
  }

  function todayValue() {
    var now = new Date();
    var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.idleHtml = button.innerHTML;
      button.disabled = true;
      button.textContent = busyLabel || "جارٍ الحفظ…";
    } else {
      button.disabled = false;
      if (button.dataset.idleHtml) button.innerHTML = button.dataset.idleHtml;
    }
  }

  function setSubmitLabel(button, label) {
    if (!button) return;
    button.innerHTML = UI.escapeHtml(label);
    button.disabled = false;
  }

  function friendlyError(error) {
    var message = String((error && (error.code || error.message)) || "");
    if (/permission|insufficient/i.test(message)) {
      return "ليست لديك صلاحية الكتابة في قاعدة البيانات. راجع قواعد Firestore في Firebase.";
    }
    if (/maximum|too large|exceeds/i.test(message)) {
      return "حجم البيانات أو الصورة كبير جدًا. اختر صورة أصغر وحاول مرة أخرى.";
    }
    if (/network|unavailable|offline/i.test(message)) {
      return "تعذر الاتصال بالسحابة. تحقق من اتصال الإنترنت ثم أعد المحاولة.";
    }
    return "تعذر إتمام العملية. حاول مرة أخرى، أو راجع إعدادات Firebase.";
  }

  function authErrorMessage(error) {
    var code = String((error && error.code) || "");
    var messages = {
      "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
      "auth/missing-password": "أدخل كلمة مرور الحساب.",
      "auth/user-disabled": "تم تعطيل هذا الحساب. راجع إعدادات المستخدمين في Firebase.",
      "auth/user-not-found": "لا يوجد حساب إدارة بهذا البريد الإلكتروني.",
      "auth/wrong-password": "كلمة المرور غير صحيحة. حاول مرة أخرى.",
      "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      "auth/invalid-login-credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      "auth/too-many-requests": "عدد المحاولات كبير. انتظر قليلًا ثم أعد المحاولة.",
      "auth/network-request-failed": "تعذر الاتصال بخدمة Firebase. تحقق من الإنترنت ثم أعد المحاولة.",
      "auth/operation-not-allowed": "تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase Authentication.",
      "auth/unauthorized-domain": "هذا النطاق غير مصرّح به في Firebase Authentication. أضفه إلى النطاقات المصرّح بها.",
      "auth/auth-domain-config-required": "إعداد authDomain مفقود في firebaseConfig.",
      "auth/api-key-not-valid": "مفتاح Firebase API غير صالح. راجع js/config.js."
    };
    if (messages[code]) return messages[code];
    return "تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور وإعدادات Firebase.";
  }

  function showLoginError(message) {
    els.loginError.textContent = message;
    els.loginError.classList.add("is-visible");
  }

  function clearLoginError() {
    els.loginError.classList.remove("is-visible");
  }

  function setLoginBusy(busy, label) {
    els.loginSubmitBtn.disabled = busy;
    els.loginBtnLabel.textContent = label || "دخول لوحة الإدارة";
  }

  function updateAdminUser(user) {
    var email = (user && user.email) || "";
    els.adminUser.hidden = !email;
    els.adminUserEmail.textContent = email;
    els.adminUser.title = email;
  }

  function configureLogin() {
    var auth = state.auth;
    var demo = Store.mode !== "cloud";

    els.emailField.hidden = demo;
    els.adminEmail.required = !demo;
    els.demoLoginHint.hidden = !demo;
    els.cloudLoginHint.hidden = demo;
    els.loginSub.textContent = demo
      ? "أدخل كلمة مرور الإدارة للوصول إلى أدوات نشر الأخبار وإدارة المكتبة."
      : "سجّل الدخول بحساب الإدارة المعتمد في Firebase للوصول إلى أدوات نشر الأخبار وإدارة المكتبة.";
    els.adminPassLabel.textContent = demo ? "كلمة مرور الإدارة" : "كلمة مرور الحساب";

    if (demo) {
      setLoginBusy(false);
      return;
    }

    if (!auth.available) {
      setLoginBusy(true, "خدمة الدخول غير متاحة");
      showLoginError("تعذر تحميل Firebase Authentication. تحقق من اتصال الإنترنت وإعدادات Firebase.");
      return;
    }

    if (!auth.ready) {
      setLoginBusy(true, "جارٍ التحقق من الجلسة…");
      return;
    }

    setLoginBusy(false);
  }

  function enterAdmin(user) {
    updateAdminUser(user || null);
    if (state.authenticated) return;

    clearLoginError();
    state.authenticated = true;
    els.loginScreen.style.display = "none";
    els.adminShell.classList.add("is-visible");
    startData();
    applyAdminDriveRoot();
    var folder = currentAdminFolder();
    if (folder && !state.driveAdmin.loading) loadAdminFolder(folder.id);
    els.addNewsBtn.focus({ preventScroll: true });
  }

  function leaveAdmin() {
    var wasAuthenticated = state.authenticated;
    state.authenticated = false;
    if (state.driveAdmin.token) disconnectDrive(false);
    updateAdminUser(null);
    els.adminShell.classList.remove("is-visible");
    els.loginScreen.style.display = "grid";
    els.adminPass.value = "";
    clearLoginError();
    if (!wasAuthenticated) return;
    setLoginBusy(false);
    if (Store.mode === "cloud" && !els.emailField.hidden) els.adminEmail.focus();
    else els.adminPass.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleAuth(authState) {
    state.auth = authState;
    configureLogin();
    updateAdminUser(authState.user);

    if (Store.mode !== "cloud") return;

    if (authState.user) {
      enterAdmin(authState.user);
    } else if (state.authenticated) {
      leaveAdmin();
    }
  }

  function adminLoading(title, text) {
    return '<div class="admin-empty"><span class="spinner" aria-hidden="true"></span><h3>' +
      UI.escapeHtml(title) + "</h3><p>" + UI.escapeHtml(text) + "</p></div>";
  }

  function adminEmpty(title, text, iconName) {
    return '<div class="admin-empty">' + window.icon(iconName || "news") +
      "<h3>" + UI.escapeHtml(title) + "</h3><p>" + UI.escapeHtml(text) + "</p></div>";
  }

  function wireThumbFallback(container) {
    container.querySelectorAll("img.admin-row__thumb").forEach(function (image) {
      image.addEventListener("error", function () {
        var fallback = document.createElement("span");
        fallback.className = "admin-row__thumb admin-row__thumb--empty";
        fallback.innerHTML = window.icon("image");
        image.replaceWith(fallback);
      });
    });
  }

  function renderNewsList() {
    if (!state.loaded.news) {
      els.newsList.innerHTML = state.status.connection === "error"
        ? adminEmpty("تعذر تحميل الأخبار", state.status.message, "alert")
        : adminLoading("جارٍ تحميل الأخبار", "يتم جلب المحتوى من قاعدة البيانات.");
      return;
    }

    if (!state.news.length) {
      els.newsList.innerHTML = adminEmpty("لا توجد أخبار منشورة", "ابدأ بإضافة أول خبر من زر «إضافة خبر جديد».", "news");
      return;
    }

    els.newsList.innerHTML = state.news.map(function (item) {
      var image = UI.safeImage(item.image);
      var thumb = image
        ? '<img class="admin-row__thumb" src="' + UI.escapeHtml(image) + '" alt="" loading="lazy">'
        : '<span class="admin-row__thumb admin-row__thumb--empty">' + window.icon("image") + "</span>";
      return '<div class="admin-row">' +
        thumb +
        '<div class="admin-row__info">' +
        '<p class="admin-row__title">' + UI.escapeHtml(item.title || "خبر بدون عنوان") + "</p>" +
        '<div class="admin-row__meta">' +
        '<span class="tag">' + UI.escapeHtml(item.category || "عام") + "</span>" +
        "<span>" + window.icon("calendar") + " " + UI.escapeHtml(UI.formatDate(item.date, "short")) + "</span>" +
        (item.pinned ? "<span>" + window.icon("pin") + " خبر مثبت</span>" : "") +
        "</div></div>" +
        '<div class="admin-row__actions">' +
        '<button class="icon-btn" type="button" data-edit-news="' + UI.escapeHtml(item.id) + '" aria-label="تعديل ' + UI.escapeHtml(item.title || "الخبر") + '">' + window.icon("pen") + "</button>" +
        '<button class="icon-btn icon-btn--danger" type="button" data-delete-news="' + UI.escapeHtml(item.id) + '" aria-label="حذف ' + UI.escapeHtml(item.title || "الخبر") + '">' + window.icon("trash") + "</button>" +
        "</div></div>";
    }).join("");

    wireThumbFallback(els.newsList);
  }

  function renderAnnouncementsList() {
    if (!state.loaded.announcements) {
      els.announcementsList.innerHTML = state.status.connection === "error"
        ? adminEmpty("تعذر تحميل الإعلانات", state.status.message, "alert")
        : adminLoading("جارٍ تحميل الإعلانات", "يتم جلب المحتوى من قاعدة البيانات.");
      return;
    }

    if (!state.announcements.length) {
      els.announcementsList.innerHTML = adminEmpty("لا توجد إعلانات منشورة", "ابدأ بإضافة أول إعلان من زر «إضافة إعلان جديد».", "book-open");
      return;
    }

    els.announcementsList.innerHTML = state.announcements.map(function (item) {
      var link = UI.safeLink(item.link);
      return '<div class="admin-row">' +
        '<span class="admin-row__thumb admin-row__thumb--empty">' + window.icon("book-open") + "</span>" +
        '<div class="admin-row__info">' +
        '<p class="admin-row__title">' + UI.escapeHtml(item.title || "إعلان بدون عنوان") + "</p>" +
        '<div class="admin-row__meta">' +
        "<span>" + window.icon("calendar") + " " + UI.escapeHtml(UI.formatDate(item.date, "short")) + "</span>" +
        "<span>" + window.icon(link ? "link" : "alert") + " " + (link ? "ملف درايف مرفق" : "دون مرفق") + "</span>" +
        "</div></div>" +
        '<div class="admin-row__actions">' +
        '<button class="icon-btn" type="button" data-edit-announcement="' + UI.escapeHtml(item.id) + '" aria-label="تعديل ' + UI.escapeHtml(item.title || "الإعلان") + '">' + window.icon("pen") + "</button>" +
        '<button class="icon-btn icon-btn--danger" type="button" data-delete-announcement="' + UI.escapeHtml(item.id) + '" aria-label="حذف ' + UI.escapeHtml(item.title || "الإعلان") + '">' + window.icon("trash") + "</button>" +
        "</div></div>";
    }).join("");
  }

  function latestUpdate() {
    var dates = [];
    state.news.forEach(function (item) { dates.push(item.updatedAt || item.createdAt || item.date); });
    state.announcements.forEach(function (item) { dates.push(item.updatedAt || item.createdAt || item.date); });
    if (state.settings.updatedAt) dates.push(state.settings.updatedAt);
    var latest = null;
    dates.forEach(function (value) {
      var date = UI.toDate(value);
      if (date && (!latest || date.getTime() > latest.getTime())) latest = date;
    });
    return latest ? UI.relativeTime(latest) : "—";
  }

  function refreshStats() {
    els.statNews.textContent = state.loaded.news ? formatCount(state.news.length) : "—";
    els.statAnnouncements.textContent = state.loaded.announcements ? formatCount(state.announcements.length) : "—";
    els.statUpdated.textContent = latestUpdate();
  }

  function updateSeedButton() {
    var show = Store.mode === "cloud" &&
      state.loaded.news && state.loaded.announcements &&
      state.news.length === 0 && state.announcements.length === 0;
    els.seedButton.hidden = !show;
  }

  function handleStatus(status) {
    state.status = status;
    var mode = status.mode;
    var connection = mode === "demo" ? "demo" : status.connection;

    UI.updateModePills(mode);

    if (connection === "error") {
      els.connectionBadge.textContent = "تعذر الاتصال بالسحابة";
      els.connectionBadge.className = "badge badge--error";
      els.statMode.textContent = "غير متصل";
      els.syncError.classList.add("is-visible");
      els.syncErrorText.textContent = status.message;
    } else if (mode === "demo") {
      els.connectionBadge.textContent = "وضع تجريبي";
      els.connectionBadge.className = "badge badge--warn";
      els.statMode.textContent = "تجريبي (مؤقت)";
      els.syncError.classList.remove("is-visible");
    } else if (connection === "online") {
      els.connectionBadge.textContent = "متصل سحابيًا";
      els.connectionBadge.className = "badge badge--ok";
      els.statMode.textContent = "سحابي متصل";
      els.syncError.classList.remove("is-visible");
    } else {
      els.connectionBadge.textContent = "جارٍ الاتصال…";
      els.connectionBadge.className = "badge";
      els.statMode.textContent = "جارٍ الاتصال";
      els.syncError.classList.remove("is-visible");
    }

    els.demoNotice.style.display = mode === "demo" ? "flex" : "none";

    if (connection === "error") {
      if (!state.loaded.news) renderNewsList();
      if (!state.loaded.announcements) renderAnnouncementsList();
    }
  }

  function startData() {
    if (state.dataStarted) return;
    state.dataStarted = true;

    Store.subscribeNews(function (news) {
      state.news = news || [];
      state.loaded.news = true;
      renderNewsList();
      refreshStats();
      updateSeedButton();
    });

    Store.subscribeAnnouncements(function (announcements) {
      state.announcements = announcements || [];
      state.loaded.announcements = true;
      renderAnnouncementsList();
      refreshStats();
      updateSeedButton();
    });

    Store.subscribeLibrary(function (libraryMeta) {
      state.libraryMeta = libraryMeta || [];
      if (state.driveAdmin.rootId) renderAdminDrive();
    });

    Store.subscribeSettings(function (settings) {
      state.settings = settings || {};
      state.loaded.settings = true;
      if (!state.settingsFilled) {
        fillSettingsForm();
        state.settingsFilled = true;
      }
      refreshStats();
      applyAdminDriveRoot();
    });

    Store.subscribeStatus(handleStatus);
  }

  function fillSettingsForm() {
    els.settingInstagram.value = state.settings.instagram || "";
    els.settingTwitter.value = state.settings.twitter || "";
    els.settingDrive.value = state.settings.libraryDrive || "";
    els.settingDriveClientId.value = state.settings.driveClientId || config.driveClientId || "";
  }

  function setTab(name) {
    document.querySelectorAll(".tab").forEach(function (tab) {
      var active = tab.getAttribute("data-tab") === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    var map = { news: "panelNews", announcements: "panelAnnouncements", drive: "panelDrive", settings: "panelSettings" };
    Object.keys(map).forEach(function (key) {
      var panel = document.getElementById(map[key]);
      panel.classList.toggle("is-active", key === name);
      panel.hidden = key !== name;
    });

    if (name === "drive" && state.authenticated) {
      applyAdminDriveRoot();
      var folder = currentAdminFolder();
      if (folder && !state.driveAdmin.loading) loadAdminFolder(folder.id);
    }
  }

  function formatBytes(size) {
    var bytes = Number(size);
    if (!bytes) return "";
    var units = ["بايت", "ك.ب", "م.ب", "ج.ب"];
    var index = 0;
    while (bytes >= 1024 && index < units.length - 1) {
      bytes /= 1024;
      index += 1;
    }
    return formatCount(index === 0 ? Math.round(bytes) : Math.round(bytes * 10) / 10) + " " + units[index];
  }

  function extractFolderId(raw) {
    var text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    var match = text.match(/\/folders\/([A-Za-z0-9_-]+)/) || text.match(/[?&]id=([A-Za-z0-9_-]+)/);
    return match ? match[1] : "";
  }

  function driveTypeInfo(mimeType, name) {
    var mime = String(mimeType || "");
    var lower = String(name || "").toLowerCase();
    if (mime === FOLDER_MIME) return { kind: "folder", label: "مجلد", icon: "folder" };
    if (mime === "application/pdf" || /\.pdf$/.test(lower)) return { kind: "pdf", label: "PDF", icon: "file" };
    if (mime.indexOf("image/") === 0) return { kind: "image", label: "صورة", icon: "image" };
    if (mime.indexOf("video/") === 0) return { kind: "video", label: "فيديو", icon: "video" };
    if (mime.indexOf("audio/") === 0) return { kind: "audio", label: "صوت", icon: "music" };
    if (mime === "application/vnd.google-apps.spreadsheet") return { kind: "sheet", label: "جدول", icon: "grid" };
    if (mime === "application/vnd.google-apps.presentation") return { kind: "slides", label: "عرض", icon: "presentation" };
    if (/zip|rar|7z|tar|gzip/.test(mime) || /\.(zip|rar|7z)$/.test(lower)) return { kind: "archive", label: "أرشيف", icon: "archive" };
    return { kind: "file", label: "ملف", icon: "file" };
  }

  function driveMetaFor(id) {
    return state.libraryMeta.find(function (entry) { return entry.id === id; }) || null;
  }

  function driveDisplayName(item) {
    var meta = driveMetaFor(item.id);
    if (meta && meta.title) return meta.title;
    var name = String(item.name || "ملف بدون اسم");
    if (item.mimeType === FOLDER_MIME) return name;
    return name.replace(/\.[A-Za-z0-9]{2,5}$/, "") || name;
  }

  function isDriveConnected() {
    return Boolean(state.driveAdmin.token) && Date.now() < state.driveAdmin.tokenExpiresAt;
  }

  function currentAdminFolder() {
    var stack = state.driveAdmin.stack;
    return stack.length ? stack[stack.length - 1] : null;
  }

  function notifyLibraryChanged() {
    try {
      if ("BroadcastChannel" in window) {
        var channel = new BroadcastChannel("farooq-library-updates");
        channel.postMessage({ type: "changed", at: Date.now() });
        channel.close();
      }
    } catch (error) {
      /* الإشعار اللحظي اختياري */
    }
  }

  function driveFriendlyError(error) {
    var message = String((error && error.message) || "");
    if (/401|credential|expired|invalid_token/i.test(message)) {
      return "انتهت جلسة Google. أعد ربط الدرايف ثم حاول مرة أخرى.";
    }
    if (/403|permission|insufficient/i.test(message)) {
      return "ليست لديك صلاحية تعديل هذا المجلد. استخدم حساب Google المالك للمجلد أو حسابًا مُنح صلاحية تعديل.";
    }
    if (/404|notFound|not found/i.test(message)) {
      return "لم يعد العنصر موجودًا في الدرايف. حدّث القائمة ثم أعد المحاولة.";
    }
    if (/network|failed to fetch|load failed/i.test(message)) {
      return "تعذر الاتصال بالدرايف. تحقق من الإنترنت ثم أعد المحاولة.";
    }
    return "تعذر تنفيذ العملية في الدرايف. تحقق من الاتصال والصلاحيات.";
  }

  function updateDriveConnectUI() {
    var connected = isDriveConnected();
    els.driveConnectBtn.hidden = connected;
    els.driveDisconnectBtn.hidden = !connected;
    els.driveAdminUpload.disabled = !connected;
    els.driveAdminFolder.disabled = !connected;

    if (connected) {
      els.driveConnectTitle.textContent = state.driveAdmin.email
        ? "متصل بحساب " + state.driveAdmin.email
        : "متصل بحساب Google";
      els.driveConnectText.textContent = "يمكنك الآن رفع الملفات وإنشاء المجلدات وتعديل الأسماء وحذف العناصر من مجلد المكتبة.";
      els.driveConnectBadge.textContent = "متصل";
      els.driveConnectBadge.className = "badge badge--ok";
      els.driveConnectState.classList.add("is-connected");
    } else {
      els.driveConnectTitle.textContent = "لم يتم ربط الدرايف بعد";
      els.driveConnectText.textContent = "اربط حساب Google المالك للمجلد أو حسابًا لديه صلاحية تعديل، لتتمكن من رفع الملفات وحذفها. يمكنك مشاهدة الملفات وتعديل أوصافها دون ربط.";
      els.driveConnectBadge.textContent = "غير متصل";
      els.driveConnectBadge.className = "badge";
      els.driveConnectState.classList.remove("is-connected");
    }
  }

  function waitForGis(timeout) {
    return new Promise(function (resolve) {
      var started = Date.now();
      var timer = window.setInterval(function () {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          window.clearInterval(timer);
          resolve(true);
        } else if (Date.now() - started > timeout) {
          window.clearInterval(timer);
          resolve(false);
        }
      }, 250);
    });
  }

  function handleDriveToken(response) {
    if (!response || !response.access_token) {
      UI.showToast("تعذر ربط الدرايف. أعد المحاولة واختر حساب Google المناسب.", "error");
      return;
    }
    var expiresIn = Number(response.expires_in) || 3600;
    state.driveAdmin.token = response.access_token;
    state.driveAdmin.tokenExpiresAt = Date.now() + expiresIn * 1000;
    state.driveAdmin.connectedAt = new Date();
    if (state.driveAdmin.tokenTimer) window.clearTimeout(state.driveAdmin.tokenTimer);
    state.driveAdmin.tokenTimer = window.setTimeout(function () {
      disconnectDrive(true);
    }, Math.max(60000, (expiresIn - 120) * 1000));

    updateDriveConnectUI();
    var folder = currentAdminFolder();
    if (folder) loadAdminFolder(folder.id);
    loadAdminRootName();

    fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + response.access_token }
    }).then(function (result) {
      return result.ok ? result.json() : null;
    }).then(function (info) {
      if (info && info.email) {
        state.driveAdmin.email = info.email;
        updateDriveConnectUI();
      }
    }).catch(function () { return null; });

    UI.showToast("تم ربط الدرايف. يمكنك الآن رفع الملفات وإدارتها.", "success");
  }

  function connectDrive() {
    var clientId = String(state.settings.driveClientId || config.driveClientId || "").trim();
    if (!clientId) {
      UI.showToast("أضف معرّف OAuth من تبويب «إعدادات البوابة» أولًا، ثم احفظ الإعدادات وأعد المحاولة.", "error");
      setTab("settings");
      return;
    }
    setBusy(els.driveConnectBtn, true, "جارٍ فتح نافذة Google…");
    waitForGis(9000).then(function (ready) {
      setBusy(els.driveConnectBtn, false);
      if (!ready) {
        UI.showToast("تعذر تحميل خدمة Google. تحقق من الإنترنت ثم أعد المحاولة.", "error");
        return;
      }
      if (!state.driveAdmin.tokenClient || state.driveAdmin.tokenClientId !== clientId) {
        state.driveAdmin.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          callback: handleDriveToken,
          error_callback: function (error) {
            UI.showToast("تعذر ربط الدرايف: " + ((error && error.message) || "أُلغيت العملية."), "error");
          }
        });
        state.driveAdmin.tokenClientId = clientId;
      }
      state.driveAdmin.tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  function disconnectDrive(expired) {
    var token = state.driveAdmin.token;
    if (token && !expired) {
      try {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          window.google.accounts.oauth2.revoke(token, function () {});
        }
      } catch (error) {
        /* الإلغاء المحلي يكفي */
      }
    }
    if (state.driveAdmin.tokenTimer) window.clearTimeout(state.driveAdmin.tokenTimer);
    state.driveAdmin.token = "";
    state.driveAdmin.email = "";
    state.driveAdmin.tokenExpiresAt = 0;
    state.driveAdmin.tokenTimer = null;
    updateDriveConnectUI();
    if (state.driveAdmin.rootId) renderAdminDrive();
    if (expired) UI.showToast("انتهت جلسة Google. أعد ربط الدرايف لمتابعة الرفع والحذف.", "error");
  }

  function driveAuthorizedFetch(url, options) {
    if (!isDriveConnected()) {
      return Promise.reject(new Error("انتهت جلسة Google. أعد ربط الدرايف."));
    }
    var settings = Object.assign({}, options || {});
    settings.headers = Object.assign({}, settings.headers || {}, {
      Authorization: "Bearer " + state.driveAdmin.token
    });
    return fetch(url, settings).then(function (response) {
      if (response.status === 401) {
        disconnectDrive(true);
        throw new Error("انتهت جلسة Google. أعد ربط الدرايف.");
      }
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          var error = new Error((data.error && data.error.message) || "drive-http-" + response.status);
          error.status = response.status;
          throw error;
        });
      }
      return response;
    });
  }

  function driveJson(url, options) {
    return driveAuthorizedFetch(url, options).then(function (response) {
      return response.json();
    });
  }

  function fetchDriveFiles(folderId) {
    var params = new URLSearchParams({
      q: "'" + folderId + "' in parents and trashed=false",
      fields: "files(id,name,mimeType,size,modifiedTime,thumbnailLink)",
      orderBy: "folder,name",
      pageSize: "1000"
    });

    if (isDriveConnected()) {
      return driveJson(DRIVE_API + "?" + params.toString()).then(function (data) {
        return data.files || [];
      });
    }

    if (!config.driveApiKey) {
      return Promise.reject(new Error("لم يتم ضبط مفتاح Drive API."));
    }
    params.set("key", String(config.driveApiKey));
    return fetch(DRIVE_API + "?" + params.toString(), { cache: "no-store" }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || data.error) {
          var error = new Error((data.error && data.error.message) || "drive-request-failed");
          error.status = response.status;
          throw error;
        }
        return data.files || [];
      });
    });
  }

  function listAllDriveChildren(folderId) {
    var all = [];
    function page(token) {
      var params = new URLSearchParams({
        q: "'" + folderId + "' in parents and trashed=false",
        fields: "files(id,name,mimeType),nextPageToken",
        orderBy: "folder,name",
        pageSize: "1000"
      });
      if (token) params.set("pageToken", token);
      return driveJson(DRIVE_API + "?" + params.toString()).then(function (data) {
        all = all.concat(data.files || []);
        return data.nextPageToken ? page(data.nextPageToken) : all;
      });
    }
    return page("");
  }

  function loadAdminRootName() {
    var rootId = state.driveAdmin.rootId;
    if (!rootId) return;
    var params = new URLSearchParams({ fields: "name" });
    var request;
    if (isDriveConnected()) {
      request = driveJson(DRIVE_API + "/" + encodeURIComponent(rootId) + "?" + params.toString());
    } else {
      if (!config.driveApiKey) return;
      params.set("key", String(config.driveApiKey));
      request = fetch(DRIVE_API + "/" + encodeURIComponent(rootId) + "?" + params.toString(), { cache: "no-store" }).then(function (response) {
        return response.json();
      });
    }
    request.then(function (data) {
      if (!data || !data.name) return;
      var root = state.driveAdmin.stack[0];
      if (root && root.id === rootId) {
        root.name = data.name;
        renderAdminDriveCrumbs();
      }
    }).catch(function () { return null; });
  }

  function loadAdminFolder(folderId) {
    var drive = state.driveAdmin;
    if (!folderId) {
      drive.error = "لم يتم ضبط مجلد المكتبة الرسمي بعد.";
      renderAdminDrive();
      return;
    }
    drive.loading = true;
    drive.error = "";
    drive.requestToken = (drive.requestToken || 0) + 1;
    var token = drive.requestToken;
    renderAdminDrive();

    fetchDriveFiles(folderId).then(function (files) {
      if (token !== drive.requestToken) return;
      drive.items = files;
      drive.loading = false;
      drive.error = "";
      renderAdminDrive();
    }).catch(function (error) {
      if (token !== drive.requestToken) return;
      drive.loading = false;
      drive.error = driveFriendlyError(error);
      renderAdminDrive();
    });
  }

  function renderAdminDriveCrumbs() {
    var stack = state.driveAdmin.stack;
    els.driveAdminCrumbs.innerHTML = stack.map(function (crumb, index) {
      var current = index === stack.length - 1;
      var label = UI.escapeHtml(crumb.name || "المكتبة");
      if (current) {
        return '<span class="drive-crumb is-current" aria-current="page">' + label + "</span>";
      }
      return '<button type="button" class="drive-crumb" data-admin-crumb="' + index + '">' + label + "</button>";
    }).join('<span class="drive-crumb-sep" aria-hidden="true">' + window.icon("chevron-left") + "</span>");
  }

  function adminDriveRow(item) {
    var type = driveTypeInfo(item.mimeType, item.name);
    var meta = driveMetaFor(item.id) || {};
    var title = driveDisplayName(item);
    var category = meta.category || type.label;
    var description = meta.description || "";
    var connected = isDriveConnected();
    var thumbnail = UI.safeImage(item.thumbnailLink || "");
    var thumb = thumbnail
      ? '<img class="admin-row__thumb" src="' + UI.escapeHtml(thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="admin-row__thumb admin-row__thumb--empty">' + window.icon(type.icon) + "</span>";
    var details = [];
    if (item.modifiedTime) details.push("<span>" + window.icon("calendar") + " " + UI.escapeHtml(UI.formatDate(item.modifiedTime, "short")) + "</span>");
    if (item.size) details.push("<span>" + UI.escapeHtml(formatBytes(item.size)) + "</span>");

    return '<div class="admin-row admin-row--drive">' +
      thumb +
      '<div class="admin-row__info">' +
      '<p class="admin-row__title">' + UI.escapeHtml(title) + "</p>" +
      '<p class="drive-row__desc">' + (description ? UI.escapeHtml(description) : '<span class="drive-row__desc--empty">بدون وصف — أضف وصفًا ليظهر للزوار.</span>') + "</p>" +
      '<div class="admin-row__meta">' +
      '<span class="tag">' + UI.escapeHtml(category) + "</span>" +
      details.join("") +
      "</div></div>" +
      '<div class="admin-row__actions">' +
      (type.kind === "folder" ? '<button class="icon-btn" type="button" data-open-admin-drive="' + UI.escapeHtml(item.id) + '" aria-label="فتح المجلد ' + UI.escapeHtml(title) + '">' + window.icon("arrow-left") + "</button>" : "") +
      '<button class="icon-btn" type="button" data-edit-admin-drive="' + UI.escapeHtml(item.id) + '" aria-label="تعديل ' + UI.escapeHtml(title) + '">' + window.icon("pen") + "</button>" +
      '<button class="icon-btn icon-btn--danger" type="button" data-delete-admin-drive="' + UI.escapeHtml(item.id) + '" aria-label="حذف ' + UI.escapeHtml(title) + '"' + (connected ? "" : ' disabled title="اربط حساب Google أولًا"') + ">" + window.icon("trash") + "</button>" +
      "</div></div>";
  }

  function wireAdminDriveThumbs() {
    els.adminDriveList.querySelectorAll("img.admin-row__thumb").forEach(function (image) {
      image.addEventListener("error", function () {
        var fallback = document.createElement("span");
        fallback.className = "admin-row__thumb admin-row__thumb--empty";
        fallback.innerHTML = window.icon("file");
        image.replaceWith(fallback);
      });
    });
  }

  function renderAdminDrive() {
    renderAdminDriveCrumbs();
    updateDriveConnectUI();

    var drive = state.driveAdmin;
    var text;
    if (!drive.rootId) {
      text = "لم يتم ضبط مجلد المكتبة الرسمي بعد.";
    } else if (drive.loading) {
      text = drive.items.length ? "جارٍ تحديث الملفات…" : "جارٍ تحميل الملفات…";
    } else if (drive.error) {
      text = drive.error;
    } else {
      text = "عرض " + formatCount(drive.items.length) + " عنصرًا";
      text += isDriveConnected() ? " — متصل بحساب Google" : " — اربط Google للرفع والحذف";
    }
    els.driveAdminStatus.textContent = text;

    if (!drive.rootId) {
      els.adminDriveList.innerHTML = adminEmpty("لم يتم ضبط مجلد المكتبة", "أضف رابط مجلد المكتبة من تبويب إعدادات البوابة.", "folder");
      return;
    }

    if (drive.loading && !drive.items.length) {
      els.adminDriveList.innerHTML = adminLoading("جارٍ تحميل مكتبة الدرايف", "يتم جلب ملفات المجلد الرسمي.");
      return;
    }

    if (drive.error && !drive.items.length) {
      els.adminDriveList.innerHTML = '<div class="admin-empty">' + window.icon("alert") +
        "<h3>تعذر تحميل مكتبة الدرايف</h3><p>" + UI.escapeHtml(drive.error) + "</p>" +
        '<button class="btn btn--ghost btn--sm" type="button" data-drive-admin-retry>' + window.icon("refresh") + " إعادة المحاولة</button></div>";
      return;
    }

    if (!drive.items.length) {
      els.adminDriveList.innerHTML = adminEmpty("هذا المجلد فارغ", "ارفع ملفًا جديدًا أو أنشئ مجلدًا فرعيًا للبدء.", "folder");
      return;
    }

    els.adminDriveList.innerHTML = drive.items.map(adminDriveRow).join("");
    wireAdminDriveThumbs();
  }

  function applyAdminDriveRoot() {
    var drive = state.driveAdmin;
    var folderId = extractFolderId(state.settings.libraryDrive) || extractFolderId((config.defaults || {}).libraryDrive);
    if (!folderId) {
      drive.rootId = "";
      drive.stack = [];
      drive.items = [];
      drive.error = "لم يتم ضبط مجلد المكتبة الرسمي بعد.";
      renderAdminDrive();
      return;
    }
    if (folderId === drive.rootId) return;
    drive.rootId = folderId;
    drive.stack = [{ id: folderId, name: "المكتبة" }];
    drive.items = [];
    drive.error = "";
    drive.query = "";
    loadAdminRootName();
    if (state.authenticated) loadAdminFolder(folderId);
  }

  function openAdminFolder(item) {
    if (!item || item.mimeType !== FOLDER_MIME) return;
    state.driveAdmin.stack.push({ id: item.id, name: driveDisplayName(item) });
    loadAdminFolder(item.id);
  }

  function navigateAdminCrumb(index) {
    var stack = state.driveAdmin.stack;
    if (index < 0 || index >= stack.length - 1) return;
    state.driveAdmin.stack = stack.slice(0, index + 1);
    loadAdminFolder(state.driveAdmin.stack[state.driveAdmin.stack.length - 1].id);
  }

  function openDriveEdit(item) {
    if (!item) return;
    var meta = driveMetaFor(item.id) || {};
    var type = driveTypeInfo(item.mimeType, item.name);
    state.editingDriveItem = item;
    els.driveEditForm.reset();
    els.driveEditTitleInput.value = meta.title || "";
    els.driveEditTitleInput.placeholder = "اتركه فارغًا لاستخدام: " + driveDisplayName(item);
    els.driveEditDescription.value = meta.description || "";
    els.driveEditCategory.value = meta.category || "";
    els.driveEditCategory.placeholder = "مثال: " + type.label;
    els.driveEditDriveName.value = item.name || "";
    els.driveEditFileField.hidden = !isDriveConnected();
    els.driveEditSub.textContent = "الملف الحالي: " + item.name + (isDriveConnected() ? " — يمكنك أيضًا تعديل اسمه الفعلي في الدرايف." : ".");
    setSubmitLabel(els.driveEditSubmit, "حفظ التعديلات");
    UI.openDialog(els.driveEditDialog);
    window.setTimeout(function () { els.driveEditTitleInput.focus(); }, 80);
  }

  function saveDriveEdit(event) {
    event.preventDefault();
    var item = state.editingDriveItem;
    if (!item) return;

    var payload = {
      title: els.driveEditTitleInput.value.trim(),
      description: els.driveEditDescription.value.trim(),
      category: els.driveEditCategory.value.trim()
    };
    var newName = els.driveEditDriveName.value.trim();
    var rename = isDriveConnected() && newName && newName !== item.name;

    setBusy(els.driveEditSubmit, true, "جارٍ الحفظ…");
    Store.saveLibraryMeta(item.id, payload).then(function () {
      if (!rename) return null;
      return driveJson(DRIVE_API + "/" + encodeURIComponent(item.id) + "?fields=id,name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ name: newName })
      });
    }).then(function () {
      UI.closeDialog(els.driveEditDialog);
      UI.showToast(rename ? "تم حفظ الوصف وتحديث اسم الملف في الدرايف." : "تم حفظ بيانات الملف وأصبحت الأوصاف محدثة.", "success");
      state.editingDriveItem = null;
      setBusy(els.driveEditSubmit, false);
      var folder = currentAdminFolder();
      if (folder) loadAdminFolder(folder.id);
      notifyLibraryChanged();
    }).catch(function (error) {
      console.error(error);
      UI.showToast(driveFriendlyError(error), "error");
      setBusy(els.driveEditSubmit, false);
      var folder = currentAdminFolder();
      if (folder) loadAdminFolder(folder.id);
    });
  }

  function openDriveUpload() {
    if (!isDriveConnected()) {
      UI.showToast("اربط حساب Google أولًا لتتمكن من رفع الملفات.", "error");
      return;
    }
    var folder = currentAdminFolder();
    els.driveUploadForm.reset();
    els.driveUploadProgress.hidden = true;
    els.driveUploadBar.style.width = "0%";
    els.driveUploadStatus.textContent = "جارٍ تجهيز الرفع…";
    els.driveUploadTarget.textContent = folder
      ? "سيتم الرفع إلى: " + folder.name
      : "سيتم الرفع إلى المجلد الحالي في مكتبة المدرسة.";
    setSubmitLabel(els.driveUploadSubmit, "رفع الملفات");
    UI.openDialog(els.driveUploadDialog);
    window.setTimeout(function () { els.driveUploadFiles.focus(); }, 80);
  }

  function uploadDriveFile(file, folderId, onProgress) {
    var metadata = { name: file.name, parents: [folderId] };
    return driveAuthorizedFetch(DRIVE_UPLOAD_API + "?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,thumbnailLink", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": file.type || "application/octet-stream",
        "X-Upload-Content-Length": String(file.size)
      },
      body: JSON.stringify(metadata)
    }).then(function (response) {
      var location = response.headers.get("Location");
      if (!location) throw new Error("تعذر بدء جلسة رفع الملف. حاول مرة أخرى.");
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open("PUT", location, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = function (event) {
          if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
        };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText || "{}"));
            } catch (error) {
              resolve({ name: file.name });
            }
          } else {
            reject(new Error("تعذر رفع الملف (" + xhr.status + "). تحقق من الصلاحيات وحجم الملف."));
          }
        };
        xhr.onerror = function () {
          reject(new Error("تعذر الاتصال أثناء رفع الملف."));
        };
        xhr.send(file);
      });
    });
  }

  function submitDriveUpload(event) {
    event.preventDefault();
    if (!els.driveUploadForm.reportValidity()) return;
    if (!isDriveConnected()) {
      UI.showToast("انتهت جلسة Google. أعد ربط الدرايف ثم حاول مرة أخرى.", "error");
      return;
    }
    var files = Array.prototype.slice.call(els.driveUploadFiles.files || []);
    if (!files.length) {
      UI.showToast("اختر ملفًا واحدًا على الأقل.", "error");
      return;
    }
    var folder = currentAdminFolder();
    if (!folder) {
      UI.showToast("اختر مجلدًا داخل المكتبة أولًا.", "error");
      return;
    }

    var description = els.driveUploadDescription.value.trim();
    var category = els.driveUploadCategory.value.trim();
    var total = files.length;
    var chain = Promise.resolve();

    setBusy(els.driveUploadSubmit, true, "جارٍ الرفع…");
    els.driveUploadProgress.hidden = false;
    els.driveUploadBar.style.width = "0%";

    files.forEach(function (file, index) {
      chain = chain.then(function () {
        els.driveUploadStatus.textContent = "جارٍ رفع " + file.name + " (" + (index + 1) + " من " + total + ")…";
        return uploadDriveFile(file, folder.id, function (ratio) {
          var overall = ((index + ratio) / total) * 100;
          els.driveUploadBar.style.width = Math.round(overall) + "%";
        }).then(function (uploadedFile) {
          if (!uploadedFile || !uploadedFile.id) return null;
          return Store.saveLibraryMeta(uploadedFile.id, {
            title: "",
            description: description,
            category: category
          });
        });
      });
    });

    chain.then(function () {
      els.driveUploadBar.style.width = "100%";
      els.driveUploadStatus.textContent = "تم رفع الملفات بنجاح.";
      UI.closeDialog(els.driveUploadDialog);
      UI.showToast("تم رفع " + formatCount(total) + " ملف إلى مكتبة الدرايف.", "success");
      setBusy(els.driveUploadSubmit, false);
      state.editingDriveItem = null;
      var current = currentAdminFolder();
      if (current) loadAdminFolder(current.id);
      notifyLibraryChanged();
    }).catch(function (error) {
      console.error(error);
      UI.showToast(driveFriendlyError(error), "error");
      setBusy(els.driveUploadSubmit, false);
      var current = currentAdminFolder();
      if (current) loadAdminFolder(current.id);
    });
  }

  function openDriveFolderDialog() {
    if (!isDriveConnected()) {
      UI.showToast("اربط حساب Google أولًا لتتمكن من إنشاء مجلد.", "error");
      return;
    }
    els.driveFolderForm.reset();
    setSubmitLabel(els.driveFolderSubmit, "إنشاء المجلد");
    UI.openDialog(els.driveFolderDialog);
    window.setTimeout(function () { els.driveFolderName.focus(); }, 80);
  }

  function submitDriveFolder(event) {
    event.preventDefault();
    if (!els.driveFolderForm.reportValidity()) return;
    if (!isDriveConnected()) {
      UI.showToast("انتهت جلسة Google. أعد ربط الدرايف ثم حاول مرة أخرى.", "error");
      return;
    }
    var folder = currentAdminFolder();
    if (!folder) {
      UI.showToast("اختر مجلدًا داخل المكتبة أولًا.", "error");
      return;
    }
    var name = els.driveFolderName.value.trim();
    var description = els.driveFolderDescription.value.trim();

    setBusy(els.driveFolderSubmit, true, "جارٍ الإنشاء…");
    driveJson(DRIVE_API + "?fields=id,name,mimeType,size,modifiedTime", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name: name, mimeType: FOLDER_MIME, parents: [folder.id] })
    }).then(function (created) {
      return Store.saveLibraryMeta(created.id, {
        title: name,
        description: description,
        category: ""
      }).then(function () { return created; });
    }).then(function () {
      UI.closeDialog(els.driveFolderDialog);
      UI.showToast("تم إنشاء المجلد داخل مكتبة الدرايف.", "success");
      setBusy(els.driveFolderSubmit, false);
      var current = currentAdminFolder();
      if (current) loadAdminFolder(current.id);
      notifyLibraryChanged();
    }).catch(function (error) {
      console.error(error);
      UI.showToast(driveFriendlyError(error), "error");
      setBusy(els.driveFolderSubmit, false);
    });
  }

  function requestDriveDelete(item) {
    if (!item) return;
    if (!isDriveConnected()) {
      UI.showToast("اربط حساب Google أولًا لتتمكن من الحذف.", "error");
      return;
    }
    state.deleteTarget = { type: "drive", item: item };
    var name = driveDisplayName(item);
    els.confirmMessage.textContent = item.mimeType === FOLDER_MIME
      ? "هل تريد حذف المجلد «" + name + "» وكل ما يحتويه من ملفات ومجلدات نهائيًا من الدرايف؟"
      : "هل تريد حذف «" + name + "» نهائيًا من الدرايف؟";
    UI.openDialog(els.confirmDialog);
  }

  function deleteDriveRecursive(item) {
    var deletedIds = [];
    function deleteFile(id) {
      return driveAuthorizedFetch(DRIVE_API + "/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function () { deletedIds.push(id); });
    }
    function removeNode(node) {
      if (node.mimeType !== FOLDER_MIME) return deleteFile(node.id);
      return listAllDriveChildren(node.id).then(function (children) {
        return children.reduce(function (chain, child) {
          return chain.then(function () { return removeNode(child); });
        }, Promise.resolve());
      }).then(function () {
        return deleteFile(node.id);
      });
    }
    return removeNode(item).then(function () { return deletedIds; });
  }

  function populatePresets() {
    var presets = config.newsPresets || [];
    els.newsImagePreset.innerHTML = '<option value="">بدون صورة جاهزة</option>' + presets.map(function (preset) {
      return '<option value="' + UI.escapeHtml(preset.path) + '">' + UI.escapeHtml(preset.label) + "</option>";
    }).join("");
  }

  function updateImagePreview(src, note) {
    var image = UI.safeImage(src);
    if (image) {
      els.newsImagePreviewImg.src = image;
      els.newsImagePreviewImg.hidden = false;
      els.newsImagePreviewEmpty.hidden = true;
      els.newsImagePreviewNote.textContent = note || "معاينة الصورة.";
    } else {
      els.newsImagePreviewImg.removeAttribute("src");
      els.newsImagePreviewImg.hidden = true;
      els.newsImagePreviewEmpty.hidden = false;
      els.newsImagePreviewNote.textContent = note || "لم يتم اختيار صورة بعد.";
    }
  }

  function clearImageFields() {
    state.uploadedImage = null;
    state.existingImage = "";
    els.newsImageUrl.value = "";
    els.newsImagePreset.value = "";
    els.newsImageFile.value = "";
  }

  function openNewsForm(item) {
    els.newsForm.reset();
    state.editingNewsId = item ? item.id : null;
    state.uploadedImage = null;
    state.existingImage = (item && item.image) || "";
    els.newsImageFile.value = "";

    els.newsFormTitle.textContent = item ? "تعديل الخبر" : "إضافة خبر جديد";
    setSubmitLabel(els.newsSubmitBtn, item ? "حفظ التعديلات" : "نشر الخبر");
    els.newsDate.value = (item && item.date) || todayValue();
    els.newsPinned.checked = Boolean(item && item.pinned);

    if (item) {
      els.newsTitle.value = item.title || "";
      els.newsCategory.value = item.category || "عام";
      if (els.newsCategory.value !== (item.category || "عام")) {
        var option = document.createElement("option");
        option.value = item.category;
        option.textContent = item.category;
        els.newsCategory.appendChild(option);
        els.newsCategory.value = item.category;
      }
      els.newsSummary.value = item.summary || "";
      els.newsBody.value = item.body || "";

      var image = item.image || "";
      if (image) {
        var preset = (config.newsPresets || []).find(function (entry) { return entry.path === image; });
        if (preset) {
          els.newsImagePreset.value = image;
          updateImagePreview(image, "صورة جاهزة: " + preset.label);
        } else if (/^data:image\//i.test(image)) {
          updateImagePreview(image, "الصورة المرفوعة سابقًا محفوظة مع الخبر.");
        } else {
          els.newsImageUrl.value = image;
          updateImagePreview(image, "الصورة الحالية للخبر.");
        }
      } else {
        updateImagePreview("", "لم يتم اختيار صورة بعد.");
      }
    } else {
      els.newsCategory.value = "إنجازات";
      updateImagePreview("", "لم يتم اختيار صورة بعد.");
    }

    UI.openDialog(els.newsFormDialog);
    window.setTimeout(function () { els.newsTitle.focus(); }, 80);
  }

  function openAnnouncementForm(item) {
    els.announcementForm.reset();
    state.editingAnnouncementId = item ? item.id : null;
    els.announcementFormTitle.textContent = item ? "تعديل الإعلان" : "إضافة إعلان جديد";
    setSubmitLabel(els.announcementSubmitBtn, item ? "حفظ التعديلات" : "نشر الإعلان");
    els.announcementDate.value = (item && item.date) || todayValue();
    if (item) {
      els.announcementTitle.value = item.title || "";
      els.announcementBody.value = item.body || "";
      els.announcementLink.value = item.link || "";
    }
    UI.openDialog(els.announcementFormDialog);
    window.setTimeout(function () { els.announcementTitle.focus(); }, 80);
  }

  function requestDelete(type, id) {
    var source = type === "news" ? state.news : state.announcements;
    var item = source.find(function (entry) { return entry.id === id; });
    if (!item) return;
    state.deleteTarget = { type: type, id: id };
    els.confirmMessage.textContent = "هل تريد حذف «" + (item.title || "هذا المحتوى") + "»؟ لا يمكن التراجع عن هذا الإجراء، وسيختفي المحتوى فورًا من الموقع.";
    UI.openDialog(els.confirmDialog);
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file.type || !/^image\//.test(file.type)) {
        reject(new Error("يرجى اختيار ملف صورة صالح."));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        reject(new Error("حجم الصورة يتجاوز 10 ميجابايت."));
        return;
      }

      var objectUrl = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(objectUrl);
        var maxSide = 1400;
        var scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        var width = Math.max(1, Math.round(image.width * scale));
        var height = Math.max(1, Math.round(image.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        var qualities = [0.74, 0.62, 0.5, 0.4];
        var data = "";
        for (var i = 0; i < qualities.length; i += 1) {
          data = canvas.toDataURL("image/jpeg", qualities[i]);
          if (data.length <= 900000) break;
        }
        if (data.length > 950000) {
          reject(new Error("الصورة كبيرة جدًا بعد الضغط. اختر صورة أصغر."));
          return;
        }
        resolve(data);
      };
      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("تعذر قراءة الصورة المختارة."));
      };
      image.src = objectUrl;
    });
  }

  function login(event) {
    event.preventDefault();
    clearLoginError();

    if (Store.mode === "cloud") {
      if (!state.auth.available) {
        showLoginError("خدمة Firebase Authentication غير متاحة. تحقق من اتصال الإنترنت وإعدادات Firebase.");
        return;
      }
      if (!state.auth.ready) {
        showLoginError("يجري التحقق من جلسة الدخول الحالية. انتظر لحظة ثم أعد المحاولة.");
        return;
      }

      var email = els.adminEmail.value.trim();
      var password = els.adminPass.value;
      if (!email || !password) {
        showLoginError("أدخل بريد حساب الإدارة وكلمة المرور.");
        return;
      }

      setLoginBusy(true, "جارٍ تسجيل الدخول…");
      Store.signIn(email, password).then(function () {
        setLoginBusy(false);
      }).catch(function (error) {
        setLoginBusy(false);
        showLoginError(authErrorMessage(error));
        els.adminPass.value = "";
        els.adminPass.focus();
      });
      return;
    }

    var expected = String(config.adminPasscode || "farooq2026");
    if (els.adminPass.value.trim() !== expected) {
      showLoginError("كلمة المرور غير صحيحة. حاول مرة أخرى.");
      els.adminPass.value = "";
      els.adminPass.focus();
      return;
    }
    enterAdmin(null);
  }

  function logout() {
    if (Store.mode !== "cloud") {
      leaveAdmin();
      return;
    }

    els.logoutBtn.disabled = true;
    Store.signOutAdmin().then(function () {
      leaveAdmin();
    }).catch(function (error) {
      console.error(error);
      UI.showToast("تعذر إنهاء جلسة Firebase. تحقق من الاتصال وأعد المحاولة.", "error");
    }).then(function () {
      els.logoutBtn.disabled = false;
    });
  }

  function bind() {
    els.loginForm.addEventListener("submit", login);
    els.logoutBtn.addEventListener("click", logout);

    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setTab(tab.getAttribute("data-tab"));
      });
    });

    document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
      button.addEventListener("click", function () {
        UI.closeDialog(button.closest("dialog"));
      });
    });

    els.addNewsBtn.addEventListener("click", function () { openNewsForm(null); });
    els.addAnnouncementBtn.addEventListener("click", function () { openAnnouncementForm(null); });

    els.driveConnectBtn.addEventListener("click", connectDrive);
    els.driveDisconnectBtn.addEventListener("click", function () { disconnectDrive(false); });
    els.driveAdminRefresh.addEventListener("click", function () {
      var folder = currentAdminFolder();
      if (folder) loadAdminFolder(folder.id);
    });
    els.driveAdminUpload.addEventListener("click", openDriveUpload);
    els.driveAdminFolder.addEventListener("click", openDriveFolderDialog);

    els.driveAdminCrumbs.addEventListener("click", function (event) {
      var crumb = event.target.closest("[data-admin-crumb]");
      if (!crumb) return;
      navigateAdminCrumb(Number(crumb.getAttribute("data-admin-crumb")));
    });

    els.adminDriveList.addEventListener("click", function (event) {
      var retry = event.target.closest("[data-drive-admin-retry]");
      if (retry) {
        var current = currentAdminFolder();
        if (current) loadAdminFolder(current.id);
        return;
      }
      var open = event.target.closest("[data-open-admin-drive]");
      if (open) {
        var folderItem = state.driveAdmin.items.find(function (entry) {
          return entry.id === open.getAttribute("data-open-admin-drive");
        });
        openAdminFolder(folderItem);
        return;
      }
      var edit = event.target.closest("[data-edit-admin-drive]");
      if (edit) {
        var editItem = state.driveAdmin.items.find(function (entry) {
          return entry.id === edit.getAttribute("data-edit-admin-drive");
        });
        openDriveEdit(editItem);
        return;
      }
      var remove = event.target.closest("[data-delete-admin-drive]");
      if (remove) {
        var deleteItem = state.driveAdmin.items.find(function (entry) {
          return entry.id === remove.getAttribute("data-delete-admin-drive");
        });
        requestDriveDelete(deleteItem);
      }
    });

    els.driveUploadForm.addEventListener("submit", submitDriveUpload);
    els.driveFolderForm.addEventListener("submit", submitDriveFolder);
    els.driveEditForm.addEventListener("submit", saveDriveEdit);

    els.newsList.addEventListener("click", function (event) {
      var edit = event.target.closest("[data-edit-news]");
      if (edit) {
        var id = edit.getAttribute("data-edit-news");
        var item = state.news.find(function (entry) { return entry.id === id; });
        if (item) openNewsForm(item);
        return;
      }
      var remove = event.target.closest("[data-delete-news]");
      if (remove) requestDelete("news", remove.getAttribute("data-delete-news"));
    });

    els.announcementsList.addEventListener("click", function (event) {
      var edit = event.target.closest("[data-edit-announcement]");
      if (edit) {
        var id = edit.getAttribute("data-edit-announcement");
        var item = state.announcements.find(function (entry) { return entry.id === id; });
        if (item) openAnnouncementForm(item);
        return;
      }
      var remove = event.target.closest("[data-delete-announcement]");
      if (remove) requestDelete("announcement", remove.getAttribute("data-delete-announcement"));
    });

    els.newsImagePreset.addEventListener("change", function () {
      if (!els.newsImagePreset.value) {
        updateImagePreview(els.newsImageUrl.value, "");
        return;
      }
      state.uploadedImage = null;
      state.existingImage = "";
      els.newsImageFile.value = "";
      els.newsImageUrl.value = "";
      var label = els.newsImagePreset.options[els.newsImagePreset.selectedIndex].textContent;
      updateImagePreview(els.newsImagePreset.value, "صورة جاهزة: " + label);
    });

    els.newsImageUrl.addEventListener("input", function () {
      state.uploadedImage = null;
      state.existingImage = "";
      els.newsImageFile.value = "";
      els.newsImagePreset.value = "";
      updateImagePreview(els.newsImageUrl.value, els.newsImageUrl.value ? "معاينة الصورة من الرابط." : "لم يتم اختيار صورة بعد.");
    });

    els.newsImageFile.addEventListener("change", function () {
      var file = els.newsImageFile.files && els.newsImageFile.files[0];
      if (!file) return;
      els.newsImagePreviewNote.textContent = "جارٍ ضغط الصورة وتجهيزها…";
      compressImage(file).then(function (dataUrl) {
        state.uploadedImage = dataUrl;
        state.existingImage = "";
        els.newsImageUrl.value = "";
        els.newsImagePreset.value = "";
        updateImagePreview(dataUrl, "صورة مرفوعة — تم ضغطها وجاهزة للحفظ.");
      }).catch(function (error) {
        els.newsImageFile.value = "";
        UI.showToast(error.message || "تعذر تجهيز الصورة.", "error");
      });
    });

    els.newsImagePreviewImg.addEventListener("error", function () {
      els.newsImagePreviewImg.hidden = true;
      els.newsImagePreviewEmpty.hidden = false;
      els.newsImagePreviewNote.textContent = "تعذر تحميل معاينة الصورة من الرابط.";
    });

    els.removeImageBtn.addEventListener("click", function () {
      clearImageFields();
      updateImagePreview("", "تمت إزالة الصورة.");
    });

    els.newsForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!els.newsForm.reportValidity()) return;

      var payload = {
        title: els.newsTitle.value.trim(),
        category: els.newsCategory.value,
        date: els.newsDate.value,
        summary: els.newsSummary.value.trim(),
        body: els.newsBody.value.trim(),
        image: state.uploadedImage || els.newsImagePreset.value || UI.safeImage(els.newsImageUrl.value) || state.existingImage,
        pinned: els.newsPinned.checked
      };

      var isEditing = Boolean(state.editingNewsId);
      setBusy(els.newsSubmitBtn, true, "جارٍ الحفظ…");
      var request = isEditing
        ? Store.updateNews(state.editingNewsId, payload)
        : Store.addNews(payload);

      request.then(function () {
        UI.closeDialog(els.newsFormDialog);
        UI.showToast(isEditing ? "تم تحديث الخبر وسيظهر التعديل فورًا." : "تم نشر الخبر وسيظهر فورًا في الصفحة الرئيسية.");
        state.editingNewsId = null;
        setBusy(els.newsSubmitBtn, false);
      }).catch(function (error) {
        console.error(error);
        UI.showToast(friendlyError(error), "error");
        setBusy(els.newsSubmitBtn, false);
      });
    });

    els.announcementForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!els.announcementForm.reportValidity()) return;

      var rawLink = els.announcementLink.value.trim();
      if (rawLink && !UI.safeLink(rawLink)) {
        UI.showToast("رابط الملف غير صالح. استخدم رابطًا يبدأ بـ https://", "error");
        return;
      }

      var payload = {
        title: els.announcementTitle.value.trim(),
        date: els.announcementDate.value,
        link: rawLink,
        body: els.announcementBody.value.trim()
      };

      var isEditing = Boolean(state.editingAnnouncementId);
      setBusy(els.announcementSubmitBtn, true, "جارٍ الحفظ…");
      var request = isEditing
        ? Store.updateAnnouncement(state.editingAnnouncementId, payload)
        : Store.addAnnouncement(payload);

      request.then(function () {
        UI.closeDialog(els.announcementFormDialog);
        UI.showToast(isEditing ? "تم تحديث الإعلان في المكتبة الإلكترونية." : "تم نشر الإعلان في المكتبة الإلكترونية.");
        state.editingAnnouncementId = null;
        setBusy(els.announcementSubmitBtn, false);
      }).catch(function (error) {
        console.error(error);
        UI.showToast(friendlyError(error), "error");
        setBusy(els.announcementSubmitBtn, false);
      });
    });

    els.confirmDeleteBtn.addEventListener("click", function () {
      if (!state.deleteTarget) return;
      var target = state.deleteTarget;
      setBusy(els.confirmDeleteBtn, true, "جارٍ الحذف…");
      var request;
      if (target.type === "drive") {
        request = deleteDriveRecursive(target.item).then(function (deletedIds) {
          return Store.deleteLibraryMeta(deletedIds).catch(function () { return null; });
        });
      } else if (target.type === "news") {
        request = Store.deleteNews(target.id);
      } else {
        request = Store.deleteAnnouncement(target.id);
      }
      request.then(function () {
        UI.closeDialog(els.confirmDialog);
        if (target.type === "drive") {
          UI.showToast("تم حذف العنصر من مكتبة الدرايف.", "success");
          var folder = currentAdminFolder();
          if (folder) loadAdminFolder(folder.id);
          notifyLibraryChanged();
        } else {
          UI.showToast(target.type === "news" ? "تم حذف الخبر من الموقع." : "تم حذف الإعلان من المكتبة.");
        }
        state.deleteTarget = null;
        setBusy(els.confirmDeleteBtn, false);
      }).catch(function (error) {
        console.error(error);
        UI.showToast(target.type === "drive" ? driveFriendlyError(error) : friendlyError(error), "error");
        setBusy(els.confirmDeleteBtn, false);
      });
    });

    els.settingsForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!els.settingsForm.reportValidity()) return;

      setBusy(els.saveSettingsBtn, true, "جارٍ الحفظ…");
      Store.saveSettings({
        instagram: els.settingInstagram.value.trim(),
        twitter: els.settingTwitter.value.trim(),
        libraryDrive: els.settingDrive.value.trim(),
        driveClientId: els.settingDriveClientId.value.trim()
      }).then(function () {
        UI.showToast("تم حفظ إعدادات البوابة وستظهر الروابط فورًا للزوار.");
        setBusy(els.saveSettingsBtn, false);
      }).catch(function (error) {
        console.error(error);
        UI.showToast(friendlyError(error), "error");
        setBusy(els.saveSettingsBtn, false);
      });
    });

    els.seedButton.addEventListener("click", function () {
      setBusy(els.seedButton, true, "جارٍ إضافة المحتوى…");
      var seed = Store.getSeedContent();
      var chain = Promise.resolve();
      seed.news.forEach(function (item) {
        chain = chain.then(function () { return Store.addNews(item); });
      });
      seed.announcements.forEach(function (item) {
        chain = chain.then(function () { return Store.addAnnouncement(item); });
      });
      chain.then(function () {
        UI.showToast("تمت إضافة المحتوى التجريبي إلى قاعدة البيانات. يمكنك تعديله أو حذفه.");
        setBusy(els.seedButton, false);
      }).catch(function (error) {
        console.error(error);
        UI.showToast(friendlyError(error), "error");
        setBusy(els.seedButton, false);
      });
    });
  }

  function init() {
    UI.initChrome();

    els = {
      loginScreen: document.getElementById("loginScreen"),
      loginForm: document.getElementById("loginForm"),
      loginSub: document.getElementById("loginSub"),
      loginError: document.getElementById("loginError"),
      loginSubmitBtn: document.getElementById("loginSubmitBtn"),
      loginBtnLabel: document.getElementById("loginBtnLabel"),
      adminEmail: document.getElementById("adminEmail"),
      adminPass: document.getElementById("adminPass"),
      adminPassLabel: document.getElementById("adminPassLabel"),
      emailField: document.getElementById("emailField"),
      demoLoginHint: document.getElementById("demoLoginHint"),
      cloudLoginHint: document.getElementById("cloudLoginHint"),
      demoPassHint: document.getElementById("demoPassHint"),
      adminUser: document.getElementById("adminUser"),
      adminUserEmail: document.getElementById("adminUserEmail"),
      adminShell: document.getElementById("adminShell"),
      logoutBtn: document.getElementById("logoutBtn"),
      connectionBadge: document.getElementById("connectionBadge"),
      demoNotice: document.getElementById("demoNotice"),
      syncError: document.getElementById("syncError"),
      syncErrorText: document.getElementById("syncErrorText"),
      seedButton: document.getElementById("seedButton"),
      statNews: document.getElementById("statNews"),
      statAnnouncements: document.getElementById("statAnnouncements"),
      statUpdated: document.getElementById("statUpdated"),
      statMode: document.getElementById("statMode"),
      addNewsBtn: document.getElementById("addNewsBtn"),
      addAnnouncementBtn: document.getElementById("addAnnouncementBtn"),
      driveConnectBtn: document.getElementById("driveConnectBtn"),
      driveDisconnectBtn: document.getElementById("driveDisconnectBtn"),
      driveConnectState: document.getElementById("driveConnectState"),
      driveConnectTitle: document.getElementById("driveConnectTitle"),
      driveConnectText: document.getElementById("driveConnectText"),
      driveConnectBadge: document.getElementById("driveConnectBadge"),
      driveAdminCrumbs: document.getElementById("driveAdminCrumbs"),
      driveAdminRefresh: document.getElementById("driveAdminRefresh"),
      driveAdminFolder: document.getElementById("driveAdminFolder"),
      driveAdminUpload: document.getElementById("driveAdminUpload"),
      driveAdminStatus: document.getElementById("driveAdminStatus"),
      adminDriveList: document.getElementById("adminDriveList"),
      driveUploadDialog: document.getElementById("driveUploadDialog"),
      driveUploadForm: document.getElementById("driveUploadForm"),
      driveUploadTarget: document.getElementById("driveUploadTarget"),
      driveUploadFiles: document.getElementById("driveUploadFiles"),
      driveUploadDescription: document.getElementById("driveUploadDescription"),
      driveUploadCategory: document.getElementById("driveUploadCategory"),
      driveUploadProgress: document.getElementById("driveUploadProgress"),
      driveUploadBar: document.getElementById("driveUploadBar"),
      driveUploadStatus: document.getElementById("driveUploadStatus"),
      driveUploadSubmit: document.getElementById("driveUploadSubmit"),
      driveFolderDialog: document.getElementById("driveFolderDialog"),
      driveFolderForm: document.getElementById("driveFolderForm"),
      driveFolderName: document.getElementById("driveFolderName"),
      driveFolderDescription: document.getElementById("driveFolderDescription"),
      driveFolderSubmit: document.getElementById("driveFolderSubmit"),
      driveEditDialog: document.getElementById("driveEditDialog"),
      driveEditForm: document.getElementById("driveEditForm"),
      driveEditSub: document.getElementById("driveEditSub"),
      driveEditTitleInput: document.getElementById("driveEditTitleInput"),
      driveEditDescription: document.getElementById("driveEditDescription"),
      driveEditCategory: document.getElementById("driveEditCategory"),
      driveEditFileField: document.getElementById("driveEditFileField"),
      driveEditDriveName: document.getElementById("driveEditDriveName"),
      driveEditSubmit: document.getElementById("driveEditSubmit"),
      adminNewsList: document.getElementById("adminNewsList"),
      adminAnnouncementsList: document.getElementById("adminAnnouncementsList"),
      newsList: document.getElementById("adminNewsList"),
      announcementsList: document.getElementById("adminAnnouncementsList"),
      newsFormDialog: document.getElementById("newsFormDialog"),
      newsForm: document.getElementById("newsForm"),
      newsFormTitle: document.getElementById("newsFormTitle"),
      newsSubmitBtn: document.getElementById("newsSubmitBtn"),
      newsTitle: document.getElementById("newsTitle"),
      newsCategory: document.getElementById("newsCategory"),
      newsDate: document.getElementById("newsDate"),
      newsSummary: document.getElementById("newsSummary"),
      newsBody: document.getElementById("newsBody"),
      newsImagePreset: document.getElementById("newsImagePreset"),
      newsImageUrl: document.getElementById("newsImageUrl"),
      newsImageFile: document.getElementById("newsImageFile"),
      newsImagePreviewImg: document.getElementById("newsImagePreviewImg"),
      newsImagePreviewEmpty: document.getElementById("newsImagePreviewEmpty"),
      newsImagePreviewNote: document.getElementById("newsImagePreviewNote"),
      removeImageBtn: document.getElementById("removeImageBtn"),
      newsPinned: document.getElementById("newsPinned"),
      announcementFormDialog: document.getElementById("announcementFormDialog"),
      announcementForm: document.getElementById("announcementForm"),
      announcementFormTitle: document.getElementById("announcementFormTitle"),
      announcementSubmitBtn: document.getElementById("announcementSubmitBtn"),
      announcementTitle: document.getElementById("announcementTitle"),
      announcementDate: document.getElementById("announcementDate"),
      announcementLink: document.getElementById("announcementLink"),
      announcementBody: document.getElementById("announcementBody"),
      confirmDialog: document.getElementById("confirmDialog"),
      confirmMessage: document.getElementById("confirmMessage"),
      confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),
      settingsForm: document.getElementById("settingsForm"),
      settingInstagram: document.getElementById("settingInstagram"),
      settingTwitter: document.getElementById("settingTwitter"),
      settingDrive: document.getElementById("settingDrive"),
      settingDriveClientId: document.getElementById("settingDriveClientId"),
      saveSettingsBtn: document.getElementById("saveSettingsBtn")
    };

    els.demoPassHint.textContent = String(config.adminPasscode || "farooq2026");
    populatePresets();
    bind();
    updateDriveConnectUI();
    Store.subscribeAuth(handleAuth);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
