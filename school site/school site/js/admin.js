(function () {
  "use strict";

  var UI = window.FarooqUI;
  var Store = window.FarooqStore;
  var config = window.SITE_CONFIG || {};

  var LIBRARY_MAX_BYTES = 10 * 1024 * 1024;
  var CLOUDINARY_MAX_BYTES = LIBRARY_MAX_BYTES;

  var state = {
    authenticated: false,
    dataStarted: false,
    news: [],
    announcements: [],
    library: [],
    settings: {},
    loaded: { news: false, announcements: false, library: false, settings: false },
    editingNewsId: null,
    editingAnnouncementId: null,
    editingLibraryId: null,
    deleteTarget: null,
    uploadedImage: null,
    existingImage: "",
    libraryFile: null,
    libraryExistingUrl: "",
    settingsFilled: false,
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
    els.addNewsBtn.focus({ preventScroll: true });
  }

  function leaveAdmin() {
    var wasAuthenticated = state.authenticated;
    state.authenticated = false;
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

    Store.subscribeLibrary(function (library) {
      state.library = library || [];
      state.loaded.library = true;
      renderLibraryList();
    });

    Store.subscribeSettings(function (settings) {
      state.settings = settings || {};
      state.loaded.settings = true;
      if (!state.settingsFilled) {
        fillSettingsForm();
        state.settingsFilled = true;
      }
      refreshStats();
    });

    Store.subscribeStatus(handleStatus);
  }

  function fillSettingsForm() {
    els.settingInstagram.value = state.settings.instagram || "";
    els.settingTwitter.value = state.settings.twitter || "";
    els.settingCloudinaryCloud.value = state.settings.cloudinaryCloud || "";
    els.settingCloudinaryPreset.value = state.settings.cloudinaryPreset || "";
  }

  function setTab(name) {
    document.querySelectorAll(".tab").forEach(function (tab) {
      var active = tab.getAttribute("data-tab") === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    var map = { news: "panelNews", announcements: "panelAnnouncements", library: "panelLibrary", settings: "panelSettings" };
    Object.keys(map).forEach(function (key) {
      var panel = document.getElementById(map[key]);
      panel.classList.toggle("is-active", key === name);
      panel.hidden = key !== name;
    });
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

  function libraryKind(item) {
    var type = String(item.fileType || "").toLowerCase();
    var name = String(item.fileName || item.url || "").toLowerCase();
    if (type.indexOf("pdf") >= 0 || /\.pdf(\?|$)/.test(name)) return { icon: "book-open", label: "PDF" };
    if (type.indexOf("image/") === 0 || /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(name)) return { icon: "image", label: "صورة" };
    if (type.indexOf("word") >= 0 || /\.docx?(\?|$)/.test(name)) return { icon: "file", label: "مستند" };
    if (type.indexOf("sheet") >= 0 || /\.xlsx?(\?|$)/.test(name)) return { icon: "file", label: "جدول" };
    if (type.indexOf("presentation") >= 0 || /\.pptx?(\?|$)/.test(name)) return { icon: "file", label: "عرض" };
    return { icon: "file", label: "ملف" };
  }

  function libraryMetaText(item) {
    var kind = libraryKind(item);
    var parts = [];
    if (item.category) parts.push('<span class="tag">' + UI.escapeHtml(item.category) + "</span>");
    parts.push("<span>" + window.icon("calendar") + " " + UI.escapeHtml(UI.formatDate(item.updatedAt || item.createdAt, "short")) + "</span>");
    if (item.fileSize) parts.push("<span>" + window.icon("file") + " " + UI.escapeHtml(formatBytes(item.fileSize)) + "</span>");
    parts.push("<span>" + window.icon(kind.icon) + " " + UI.escapeHtml(kind.label) + "</span>");
    return parts.join("");
  }

  function renderLibraryList() {
    if (!state.loaded.library) {
      els.libraryList.innerHTML = state.status.connection === "error"
        ? adminEmpty("تعذر تحميل ملفات المكتبة", state.status.message, "alert")
        : adminLoading("جارٍ تحميل ملفات المكتبة", "يتم جلب المحتوى من قاعدة البيانات.");
      return;
    }

    if (!state.library.length) {
      els.libraryList.innerHTML = adminEmpty("المكتبة فارغة", "أضف أول ملف من زر «إضافة ملف» ليظهر في صفحة المكتبة.", "folder");
      return;
    }

    els.libraryList.innerHTML = state.library.map(function (item) {
      var kind = libraryKind(item);
      var url = UI.safeLink(item.url);
      return '<div class="admin-row">' +
        '<span class="admin-row__thumb admin-row__thumb--empty">' + window.icon(kind.icon) + "</span>" +
        '<div class="admin-row__info">' +
        '<p class="admin-row__title">' + UI.escapeHtml(item.title || "ملف بدون عنوان") + "</p>" +
        '<div class="admin-row__meta">' + libraryMetaText(item) + "</div>" +
        '<p class="admin-row__desc">' + UI.escapeHtml(item.description || "بدون وصف") + "</p>" +
        "</div>" +
        '<div class="admin-row__actions">' +
        (url ? '<a class="icon-btn" href="' + UI.escapeHtml(url) + '" target="_blank" rel="noopener" aria-label="فتح ' + UI.escapeHtml(item.title || "الملف") + '">' + window.icon("eye") + "</a>" : "") +
        '<button class="icon-btn" type="button" data-edit-library="' + UI.escapeHtml(item.id) + '" aria-label="تعديل ' + UI.escapeHtml(item.title || "الملف") + '">' + window.icon("pen") + "</button>" +
        '<button class="icon-btn icon-btn--danger" type="button" data-delete-library="' + UI.escapeHtml(item.id) + '" aria-label="حذف ' + UI.escapeHtml(item.title || "الملف") + '">' + window.icon("trash") + "</button>" +
        "</div></div>";
    }).join("");
  }

  function openLibraryForm(item) {
    els.libraryForm.reset();
    state.editingLibraryId = item ? item.id : null;
    state.libraryFile = null;
    state.libraryExistingUrl = (item && item.url) || "";
    state.libraryExistingFile = item
      ? { fileName: item.fileName || "", fileType: item.fileType || "", fileSize: item.fileSize || 0 }
      : null;

    els.libraryFormTitle.textContent = item ? "تعديل بيانات الملف" : "إضافة ملف إلى المكتبة";
    els.libraryFormSub.textContent = item
      ? "يمكنك تغيير العنوان والوصف أو استبدال الملف."
      : "سيظهر الملف في صفحة المكتبة فور الحفظ.";
    setSubmitLabel(els.librarySubmitBtn, item ? "حفظ التعديلات" : "حفظ الملف");

    els.libraryTitle.value = (item && item.title) || "";
    els.libraryDescription.value = (item && item.description) || "";
    els.libraryCategory.value = (item && item.category) || "";
    els.libraryUrl.value = (item && item.url) || "";
    els.libraryFileNote.textContent = item && item.fileName
      ? "الملف الحالي: " + item.fileName
      : "اختر ملفًا لرفعه عند الحفظ، أو استخدم الرابط المباشر بالأسفل.";
    els.libraryProgress.hidden = true;
    els.libraryBar.style.width = "0%";

    UI.openDialog(els.libraryFormDialog);
    window.setTimeout(function () { els.libraryTitle.focus(); }, 80);
  }

  function cloudinarySettings() {
    var cloud = String(state.settings.cloudinaryCloud || "").trim();
    var preset = String(state.settings.cloudinaryPreset || "").trim();
    return { cloud: cloud, preset: preset, ready: Boolean(cloud && preset) };
  }

  function uploadLibraryFile(file, onProgress) {
    var cloudinary = cloudinarySettings();
    if (!cloudinary.ready) {
      return Promise.reject(new Error("أضف اسم حساب Cloudinary واسم الرفع (Preset) من «إعدادات البوابة» أولًا."));
    }
    if (file.size > CLOUDINARY_MAX_BYTES) {
      return Promise.reject(new Error("حجم الملف يتجاوز 10 ميجابايت. اختر ملفًا أصغر."));
    }

    return new Promise(function (resolve, reject) {
      var form = new FormData();
      form.append("file", file);
      form.append("upload_preset", cloudinary.preset);

      var xhr = new XMLHttpRequest();
      xhr.open("POST", "https://api.cloudinary.com/v1_1/" + encodeURIComponent(cloudinary.cloud) + "/auto/upload");
      xhr.upload.onprogress = function (event) {
        if (event.lengthComputable && typeof onProgress === "function") {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = function () {
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (error) { data = null; }
        if (xhr.status >= 200 && xhr.status < 300 && data && data.secure_url) {
          resolve(data);
          return;
        }
        var message = data && data.error && data.error.message
          ? data.error.message
          : "تعذر رفع الملف. راجع إعدادات Cloudinary ثم أعد المحاولة.";
        reject(new Error(message));
      };
      xhr.onerror = function () {
        reject(new Error("تعذر الاتصال بخدمة رفع الملفات. تحقق من الإنترنت."));
      };
      xhr.send(form);
    });
  }

  function submitLibraryForm(event) {
    event.preventDefault();
    if (!els.libraryForm.reportValidity()) return;

    var rawUrl = els.libraryUrl.value.trim();
    if (rawUrl && !UI.safeLink(rawUrl)) {
      UI.showToast("رابط الملف غير صالح. استخدم رابطًا يبدأ بـ https://", "error");
      return;
    }

    var file = state.libraryFile;
    if (!file && !rawUrl && !state.libraryExistingUrl) {
      UI.showToast("اختر ملفًا من جهازك أو ألصق رابطًا مباشرًا للملف.", "error");
      return;
    }

    var isEditing = Boolean(state.editingLibraryId);
    var existing = state.libraryExistingFile || { fileName: "", fileType: "", fileSize: 0 };
    var payload = {
      title: els.libraryTitle.value.trim(),
      description: els.libraryDescription.value.trim(),
      category: els.libraryCategory.value.trim(),
      url: rawUrl || state.libraryExistingUrl,
      fileName: existing.fileName,
      fileType: existing.fileType,
      fileSize: existing.fileSize
    };

    setBusy(els.librarySubmitBtn, true, file ? "جارٍ رفع الملف…" : "جارٍ الحفظ…");

    var chain;
    if (file) {
      els.libraryProgress.hidden = false;
      els.libraryBar.style.width = "0%";
      els.libraryStatus.textContent = "جارٍ رفع الملف…";
      chain = uploadLibraryFile(file, function (percent) {
        els.libraryBar.style.width = percent + "%";
        els.libraryStatus.textContent = "جارٍ رفع الملف… " + percent + "%";
      }).then(function (result) {
        payload.url = result.secure_url;
        payload.fileName = result.original_filename || file.name;
        payload.fileType = file.type || "";
        payload.fileSize = result.bytes || file.size;
        els.libraryStatus.textContent = "اكتمل الرفع، جارٍ حفظ البيانات…";
      });
    } else {
      chain = Promise.resolve();
    }

    chain.then(function () {
      if (!payload.fileName && payload.url) {
        var parts = payload.url.split("?")[0].split("/");
        payload.fileName = decodeURIComponent(parts[parts.length - 1] || "ملف المكتبة");
      }
      return Store.saveLibraryEntry(payload, state.editingLibraryId);
    }).then(function () {
      UI.closeDialog(els.libraryFormDialog);
      UI.showToast(file ? "تم رفع الملف وإضافته إلى المكتبة." : (isEditing ? "تم حفظ تعديلات الملف." : "تمت إضافة الملف إلى المكتبة."));
      state.editingLibraryId = null;
      state.libraryFile = null;
      state.libraryExistingUrl = "";
      state.libraryExistingFile = null;
      els.libraryProgress.hidden = true;
      setBusy(els.librarySubmitBtn, false);
    }).catch(function (error) {
      console.error(error);
      UI.showToast(error && error.message ? error.message : friendlyError(error), "error");
      setBusy(els.librarySubmitBtn, false);
    });
  }

  function requestLibraryDelete(id) {
    var item = state.library.find(function (entry) { return entry.id === id; });
    if (!item) return;
    state.deleteTarget = { type: "library", id: id };
    els.confirmMessage.textContent = "هل تريد حذف «" + (item.title || "هذا الملف") + "» من المكتبة؟ سيختفي من الموقع فورًا. إذا كان الملف مرفوعًا إلى Cloudinary فسيبقى محفوظًا هناك.";
    UI.openDialog(els.confirmDialog);
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

    els.addLibraryBtn.addEventListener("click", function () { openLibraryForm(null); });

    els.libraryList.addEventListener("click", function (event) {
      var edit = event.target.closest("[data-edit-library]");
      if (edit) {
        var id = edit.getAttribute("data-edit-library");
        var item = state.library.find(function (entry) { return entry.id === id; });
        if (item) openLibraryForm(item);
        return;
      }
      var remove = event.target.closest("[data-delete-library]");
      if (remove) requestLibraryDelete(remove.getAttribute("data-delete-library"));
    });

    els.libraryFile.addEventListener("change", function () {
      var file = els.libraryFile.files && els.libraryFile.files[0];
      state.libraryFile = file || null;
      if (file) {
        els.libraryFileNote.textContent = "سيتم رفع: " + file.name + " (" + formatBytes(file.size) + ")";
        els.libraryUrl.value = "";
      } else {
        els.libraryFileNote.textContent = "اختر ملفًا لرفعه عند الحفظ، أو استخدم الرابط المباشر بالأسفل.";
      }
    });

    els.libraryForm.addEventListener("submit", submitLibraryForm);

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
      if (target.type === "library") {
        request = Store.deleteLibraryEntry(target.id);
      } else if (target.type === "news") {
        request = Store.deleteNews(target.id);
      } else {
        request = Store.deleteAnnouncement(target.id);
      }
      request.then(function () {
        UI.closeDialog(els.confirmDialog);
        if (target.type === "library") {
          UI.showToast("تم حذف الملف من المكتبة.");
        } else {
          UI.showToast(target.type === "news" ? "تم حذف الخبر من الموقع." : "تم حذف الإعلان من المكتبة.");
        }
        state.deleteTarget = null;
        setBusy(els.confirmDeleteBtn, false);
      }).catch(function (error) {
        console.error(error);
        UI.showToast(friendlyError(error), "error");
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
        cloudinaryCloud: els.settingCloudinaryCloud.value.trim(),
        cloudinaryPreset: els.settingCloudinaryPreset.value.trim()
      }).then(function () {
        UI.showToast("تم حفظ إعدادات البوابة، وأصبح رفع الملفات جاهزًا إن اكتملت بيانات Cloudinary.");
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
      addLibraryBtn: document.getElementById("addLibraryBtn"),
      libraryList: document.getElementById("adminLibraryList"),
      libraryFormDialog: document.getElementById("libraryFormDialog"),
      libraryForm: document.getElementById("libraryForm"),
      libraryFormTitle: document.getElementById("libraryFormTitle"),
      libraryFormSub: document.getElementById("libraryFormSub"),
      librarySubmitBtn: document.getElementById("librarySubmitBtn"),
      libraryTitle: document.getElementById("libraryTitle"),
      libraryDescription: document.getElementById("libraryDescription"),
      libraryCategory: document.getElementById("libraryCategory"),
      libraryFile: document.getElementById("libraryFile"),
      libraryFileNote: document.getElementById("libraryFileNote"),
      libraryUrl: document.getElementById("libraryUrl"),
      libraryProgress: document.getElementById("libraryProgress"),
      libraryBar: document.getElementById("libraryBar"),
      libraryStatus: document.getElementById("libraryStatus"),
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
      settingCloudinaryCloud: document.getElementById("settingCloudinaryCloud"),
      settingCloudinaryPreset: document.getElementById("settingCloudinaryPreset"),
      saveSettingsBtn: document.getElementById("saveSettingsBtn")
    };

    els.demoPassHint.textContent = String(config.adminPasscode || "farooq2026");
    populatePresets();
    bind();
    Store.subscribeAuth(handleAuth);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
