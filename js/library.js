(function () {
  "use strict";

  var UI = window.FarooqUI;
  var Store = window.FarooqStore;
  var config = window.SITE_CONFIG || {};

  var DRIVE_API = "https://www.googleapis.com/drive/v3/files";
  var FOLDER_MIME = "application/vnd.google-apps.folder";

  var state = {
    announcements: [],
    libraryMeta: [],
    settings: Object.assign({}, config.defaults || {}),
    query: "",
    loaded: false,
    drive: {
      apiKey: String(config.driveApiKey || "").trim(),
      rootId: "",
      stack: [],
      items: [],
      cache: {},
      rootCount: null,
      loading: false,
      error: "",
      syncedAt: null,
      query: "",
      token: 0
    }
  };

  var els = {};

  function countLabel(count) {
    try {
      return new Intl.NumberFormat("ar-OM").format(count);
    } catch (error) {
      return String(count);
    }
  }

  function timeLabel(date) {
    if (!date) return "";
    try {
      return new Intl.DateTimeFormat("ar-OM", { hour: "numeric", minute: "2-digit" }).format(date);
    } catch (error) {
      return "";
    }
  }

  function formatSize(size) {
    var bytes = Number(size);
    if (!bytes) return "";
    var units = ["بايت", "ك.ب", "م.ب", "ج.ب"];
    var index = 0;
    while (bytes >= 1024 && index < units.length - 1) {
      bytes /= 1024;
      index += 1;
    }
    var value = index === 0 ? Math.round(bytes) : Math.round(bytes * 10) / 10;
    return countLabel(value) + " " + units[index];
  }

  function normalizeArabic(value) {
    return String(value == null ? "" : value).toLowerCase()
      .replace(/[\u064B-\u0652\u0670]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .trim();
  }

  function extractFolderId(raw) {
    var text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    var match = text.match(/\/folders\/([A-Za-z0-9_-]+)/) || text.match(/[?&]id=([A-Za-z0-9_-]+)/);
    return match ? match[1] : "";
  }

  function typeInfo(mimeType, name) {
    var mime = String(mimeType || "");
    var lower = String(name || "").toLowerCase();
    if (mime === FOLDER_MIME) return { kind: "folder", label: "مجلد", icon: "folder", cta: "فتح المجلد" };
    if (mime === "application/pdf" || /\.pdf$/.test(lower)) return { kind: "pdf", label: "PDF", icon: "file", cta: "معاينة الملف" };
    if (mime.indexOf("image/") === 0) return { kind: "image", label: "صورة", icon: "image", cta: "معاينة الصورة" };
    if (mime.indexOf("video/") === 0) return { kind: "video", label: "فيديو", icon: "video", cta: "معاينة الفيديو" };
    if (mime.indexOf("audio/") === 0) return { kind: "audio", label: "صوت", icon: "music", cta: "معاينة الملف" };
    if (mime === "application/vnd.google-apps.spreadsheet") return { kind: "sheet", label: "جدول", icon: "grid", cta: "معاينة الجدول" };
    if (mime === "application/vnd.google-apps.presentation") return { kind: "slides", label: "عرض", icon: "presentation", cta: "معاينة العرض" };
    if (/zip|rar|7z|tar|gzip/.test(mime) || /\.(zip|rar|7z)$/.test(lower)) return { kind: "archive", label: "أرشيف", icon: "archive", cta: "معاينة الملف" };
    return { kind: "file", label: "ملف", icon: "file", cta: "معاينة الملف" };
  }

  function metadataFor(item) {
    return state.libraryMeta.find(function (entry) { return entry.id === item.id; }) || null;
  }

  function displayName(item) {
    var name = String(item.name || "ملف بدون اسم");
    if (item.mimeType === FOLDER_MIME) return name;
    return name.replace(/\.[A-Za-z0-9]{2,5}$/, "") || name;
  }

  function fallbackDescription(info) {
    if (info.kind === "folder") return "مجلد من مكتبة المدرسة يضم مجموعة من الملفات والوثائق.";
    if (info.kind === "pdf") return "وثيقة PDF من مكتبة مدرسة الفاروق، يمكن معاينتها مباشرة داخل الموقع.";
    if (info.kind === "image") return "صورة من أرشيف مكتبة مدرسة الفاروق.";
    if (info.kind === "video") return "مقطع مرئي من مكتبة مدرسة الفاروق، يمكن تشغيله داخل الموقع.";
    if (info.kind === "audio") return "مقطع صوتي من مكتبة مدرسة الفاروق.";
    if (info.kind === "sheet") return "جدول بيانات من مكتبة مدرسة الفاروق.";
    if (info.kind === "slides") return "عرض تقديمي من مكتبة مدرسة الفاروق.";
    if (info.kind === "archive") return "ملف مضغوط من مكتبة مدرسة الفاروق.";
    return "ملف من مكتبة مدرسة الفاروق، يمكن معاينته مباشرة.";
  }

  function driveMatches(item) {
    var query = normalizeArabic(state.drive.query);
    if (!query) return true;
    var meta = metadataFor(item) || {};
    var haystack = [item.name, meta.title, meta.description, meta.category].join(" ");
    return normalizeArabic(haystack).indexOf(query) !== -1;
  }

  function currentFolder() {
    var stack = state.drive.stack;
    return stack.length ? stack[stack.length - 1] : null;
  }

  function updateHero() {
    var drive = state.drive;
    if (drive.rootCount == null) {
      els.fileCount.textContent = drive.error ? "تعذر تحميل ملفات المكتبة" : "جارٍ تحميل محتوى المكتبة…";
    } else {
      els.fileCount.textContent = "عناصر المكتبة: " + countLabel(drive.rootCount);
    }

    var latest = drive.syncedAt || null;
    var announcementDate = state.announcements.length ? UI.toDate(state.announcements[0].date) : null;
    if (announcementDate && (!latest || announcementDate.getTime() > latest.getTime())) latest = announcementDate;
    els.lastUpdate.textContent = latest ? "آخر تحديث: " + UI.formatDate(latest, "short") : "آخر تحديث: —";
  }

  function renderCrumbs() {
    var stack = state.drive.stack;
    els.driveCrumbs.innerHTML = stack.map(function (crumb, index) {
      var current = index === stack.length - 1;
      var label = UI.escapeHtml(crumb.name || "المكتبة");
      if (current) {
        return '<span class="drive-crumb is-current" aria-current="page">' + label + "</span>";
      }
      return '<button type="button" class="drive-crumb" data-crumb-index="' + index + '">' + label + "</button>";
    }).join('<span class="drive-crumb-sep" aria-hidden="true">' + window.icon("chevron-left") + "</span>");
  }

  function driveCard(item, index) {
    var info = typeInfo(item.mimeType, item.name);
    var meta = metadataFor(item) || {};
    var title = meta.title || displayName(item);
    var description = meta.description || fallbackDescription(info);
    var category = meta.category || "";
    var details = [];
    if (item.modifiedTime) details.push("<span>" + window.icon("calendar") + UI.escapeHtml(UI.formatDate(item.modifiedTime, "short")) + "</span>");
    if (item.size) details.push("<span>" + UI.escapeHtml(formatSize(item.size)) + "</span>");

    var thumbnail = UI.safeImage(item.thumbnailLink || "");
    var cover = thumbnail
      ? '<span class="drive-card__cover" data-cover-kind="' + info.kind + '">' +
        '<img src="' + UI.escapeHtml(thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' +
        "</span>"
      : '<span class="drive-card__cover drive-card__cover--' + info.kind + '" data-cover-kind="' + info.kind + '">' +
        '<span class="drive-card__cover-icon">' + window.icon(info.icon) + "</span>" +
        "</span>";

    return '<button type="button" class="drive-card drive-card--' + info.kind + '" data-drive-id="' + UI.escapeHtml(item.id) + '" data-drive-kind="' + info.kind + '" style="--i:' + Math.min(index, 8) + '">' +
      cover +
      '<span class="drive-card__body">' +
      '<span class="drive-card__badges">' +
      (category ? '<span class="drive-card__type">' + UI.escapeHtml(category) + "</span>" : "") +
      '<span class="drive-card__format">' + UI.escapeHtml(info.label) + "</span>" +
      "</span>" +
      '<span class="drive-card__name">' + UI.escapeHtml(title) + "</span>" +
      '<span class="drive-card__desc">' + UI.escapeHtml(description) + "</span>" +
      '<span class="drive-card__meta">' + details.join("") + "</span>" +
      '<span class="drive-card__cta">' + window.icon(info.kind === "folder" ? "arrow-left" : "eye") + info.cta + "</span>" +
      "</span>" +
      "</button>";
  }

  function wireDriveCovers() {
    els.driveGrid.querySelectorAll(".drive-card__cover img").forEach(function (image) {
      image.addEventListener("error", function () {
        var cover = image.closest(".drive-card__cover");
        if (!cover) return;
        var kind = cover.getAttribute("data-cover-kind") || "file";
        var iconsByKind = { folder: "folder", pdf: "file", image: "image", video: "video", audio: "music", sheet: "grid", slides: "presentation", archive: "archive" };
        cover.classList.add("drive-card__cover--" + kind);
        cover.innerHTML = '<span class="drive-card__cover-icon">' + window.icon(iconsByKind[kind] || "file") + "</span>";
      });
    });
  }

  function driveEmpty(icon, title, text, withRetry) {
    return '<div class="drive-empty">' +
      window.icon(icon) +
      "<h3>" + UI.escapeHtml(title) + "</h3>" +
      "<p>" + UI.escapeHtml(text) + "</p>" +
      (withRetry ? '<button type="button" class="btn btn--sm btn--ghost" data-drive-retry>' + window.icon("refresh") + " إعادة المحاولة</button>" : "") +
      "</div>";
  }

  function renderDriveStatus() {
    var drive = state.drive;
    var total = drive.items.length;
    var shown = drive.items.filter(driveMatches).length;
    var text;
    if (drive.loading) {
      text = drive.items.length ? "جارٍ تحديث الملفات…" : "جارٍ تحميل الملفات…";
    } else if (drive.error) {
      text = drive.error;
    } else if (drive.query) {
      text = "نتائج البحث: " + countLabel(shown) + " من " + countLabel(total) + " عنصرًا";
    } else {
      text = "عرض " + countLabel(total) + " عنصرًا";
      if (drive.syncedAt) text += " — آخر مزامنة " + timeLabel(drive.syncedAt);
    }
    els.driveStatus.textContent = text;
  }

  function renderDrive() {
    renderCrumbs();
    renderDriveStatus();

    var drive = state.drive;
    if (!drive.items.length && drive.loading) {
      renderDriveSkeleton();
      return;
    }

    if (!drive.items.length && drive.error) {
      els.driveGrid.innerHTML = driveEmpty("alert", "تعذر عرض ملفات المكتبة", "لم نتمكن من جلب محتوى المجلد الرسمي الآن. أعد المحاولة، أو تصفح النسخة المضمّنة أدناه.", true);
      return;
    }

    if (!drive.items.length) {
      els.driveGrid.innerHTML = driveEmpty("folder", "هذا المجلد فارغ حاليًا", "ستظهر الملفات هنا فور إضافتها إلى المجلد الرسمي للمكتبة.", false);
      return;
    }

    var filtered = drive.items.filter(driveMatches);
    if (!filtered.length) {
      els.driveGrid.innerHTML = driveEmpty("search", "لا توجد ملفات مطابقة", "جرّب كلمة بحث أخرى أو امسح حقل البحث لعرض كل الملفات.", false);
      return;
    }

    els.driveGrid.innerHTML = filtered.map(driveCard).join("");
    wireDriveCovers();
  }

  function renderDriveSkeleton() {
    var html = "";
    for (var i = 0; i < 8; i += 1) html += '<div class="drive-skeleton" aria-hidden="true"></div>';
    els.driveGrid.innerHTML = html;
  }

  function setRefreshing(loading) {
    [els.refreshBtn, els.sideRefresh].forEach(function (button) {
      if (!button) return;
      button.disabled = loading;
      button.setAttribute("aria-busy", loading ? "true" : "false");
    });
  }

  function hideFallback() {
    els.driveFallback.hidden = true;
    els.driveFrame.removeAttribute("src");
    els.driveAlert.classList.remove("is-visible");
  }

  function showFallback(message) {
    els.driveAlertText.textContent = message;
    els.driveAlert.classList.add("is-visible");
    var fallbackUrl = "https://drive.google.com/embeddedfolderview?id=" + encodeURIComponent(state.drive.rootId) + "#grid";
    if (els.driveFrame.getAttribute("src") !== fallbackUrl) els.driveFrame.src = fallbackUrl;
    els.driveFallback.hidden = false;
    els.driveNoteText.textContent = "تعذر الاتصال المباشر — تُعرض النسخة المضمّنة";
  }

  function setDriveError(message) {
    state.drive.loading = false;
    state.drive.error = message;
    setRefreshing(false);
    renderDrive();
    showFallback(message);
    updateHero();
  }

  function driveRequest(folderId) {
    var params = new URLSearchParams({
      q: "'" + folderId + "' in parents and trashed=false",
      fields: "files(id,name,mimeType,size,modifiedTime,thumbnailLink)",
      orderBy: "folder,name",
      pageSize: "1000",
      key: state.drive.apiKey
    });
    return fetch(DRIVE_API + "?" + params.toString(), { cache: "no-store" }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || data.error) {
          throw new Error((data.error && data.error.message) || "drive-request-failed");
        }
        return data.files || [];
      });
    });
  }

  function loadFolder(folderId, options) {
    var drive = state.drive;
    var force = Boolean(options && options.force);

    if (!folderId) {
      setDriveError("لم يتم ضبط مجلد المكتبة الرسمي بعد.");
      return;
    }
    if (!drive.apiKey) {
      setDriveError("لم يتم ضبط مفتاح الوصول إلى ملفات المكتبة.");
      return;
    }

    var cached = force ? null : drive.cache[folderId];
    if (cached) {
      drive.items = cached.items;
      drive.syncedAt = cached.at;
      if (folderId === drive.rootId) drive.rootCount = cached.items.length;
    } else {
      drive.items = [];
    }

    drive.loading = true;
    drive.error = "";
    drive.token += 1;
    var token = drive.token;

    setRefreshing(true);
    renderDrive();
    updateHero();

    driveRequest(folderId).then(function (files) {
      if (token !== state.drive.token) return;
      drive.cache[folderId] = { items: files, at: new Date() };
      if (folderId === drive.rootId) drive.rootCount = files.length;
      drive.items = files;
      drive.syncedAt = new Date();
      drive.loading = false;
      drive.error = "";
      els.driveNoteText.textContent = "متزامنة مع المجلد الرسمي لمدرسة الفاروق";
      if (folderId === drive.rootId) hideFallback();
      setRefreshing(false);
      renderDrive();
      updateHero();
    }).catch(function (error) {
      if (token !== state.drive.token) return;
      drive.loading = false;
      if (cached) {
        drive.error = "تعذر تحديث الملفات الآن — تُعرض آخر نسخة محمّلة.";
        setRefreshing(false);
        renderDrive();
        updateHero();
        return;
      }
      setDriveError("تعذر الاتصال بمجلد المكتبة الرسمي. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.");
    });
  }

  function loadRootName() {
    var rootId = state.drive.rootId;
    if (!rootId || !state.drive.apiKey) return;
    var url = DRIVE_API + "/" + encodeURIComponent(rootId) + "?fields=name&key=" + encodeURIComponent(state.drive.apiKey);
    fetch(url, { cache: "no-store" }).then(function (response) {
      return response.json();
    }).then(function (data) {
      if (!data || !data.name) return;
      var root = state.drive.stack[0];
      if (root && root.id === rootId) {
        root.name = data.name;
        renderCrumbs();
      }
    }).catch(function () { return null; });
  }

  function openFolder(item) {
    state.drive.stack.push({ id: item.id, name: item.name || "مجلد" });
    state.drive.query = "";
    els.driveSearch.value = "";
    loadFolder(item.id);
  }

  function navigateToCrumb(index) {
    var stack = state.drive.stack;
    if (index < 0 || index >= stack.length - 1) return;
    state.drive.stack = stack.slice(0, index + 1);
    state.drive.query = "";
    els.driveSearch.value = "";
    loadFolder(state.drive.stack[state.drive.stack.length - 1].id);
  }

  function refreshDrive() {
    var folder = currentFolder();
    if (!folder) return;
    loadFolder(folder.id, { force: true });
  }

  function clearPreview() {
    els.previewFrame.removeAttribute("src");
    els.previewLoading.classList.remove("is-hidden");
    window.clearTimeout(clearPreview.timer);
  }

  function openPreview(item) {
    var info = typeInfo(item.mimeType, item.name);
    var meta = [info.label];
    if (item.size) meta.push(formatSize(item.size));
    if (item.modifiedTime) meta.push(UI.formatDate(item.modifiedTime, "short"));

    els.previewTitle.textContent = item.name || "معاينة الملف";
    els.previewMeta.textContent = meta.join(" · ");
    els.previewLoading.classList.remove("is-hidden");
    els.previewFrame.onload = function () {
      els.previewLoading.classList.add("is-hidden");
    };
    els.previewFrame.src = "https://drive.google.com/file/d/" + encodeURIComponent(item.id) + "/preview";
    clearPreview.timer = window.setTimeout(function () {
      els.previewLoading.classList.add("is-hidden");
    }, 4500);
    UI.openDialog(els.previewDialog);
  }

  function isRecent(dateValue) {
    var date = UI.toDate(dateValue);
    if (!date) return false;
    return Date.now() - date.getTime() < 12 * 24 * 60 * 60 * 1000;
  }

  function matchesAnnouncement(announcement) {
    if (!state.query) return true;
    var query = state.query.trim();
    return (announcement.title || "").indexOf(query) !== -1 || (announcement.body || "").indexOf(query) !== -1;
  }

  function announcementCard(announcement, index, latestId) {
    var title = UI.escapeHtml(announcement.title || "إعلان من المدرسة");
    var body = UI.escapeHtml(announcement.body || "").replace(/\n/g, "<br>");
    var href = UI.safeLink(announcement.link);
    var isNew = announcement.id === latestId && isRecent(announcement.date);

    var link = href
      ? '<a class="announcement__link" href="' + UI.escapeHtml(href) + '" target="_blank" rel="noopener">' +
        window.icon("external") + " فتح الملف المرفق</a>"
      : '<span class="announcement__link announcement__link--muted">' + window.icon("link") + " الملف يُضاف قريبًا</span>";

    return '<article class="announcement' + (isNew ? " announcement--latest" : "") + '" style="--i:' + Math.min(index, 6) + '">' +
      '<div class="announcement__date" aria-hidden="true">' +
      '<span class="announcement__day">' + UI.dayNumber(announcement.date) + "</span>" +
      '<span class="announcement__month">' + UI.monthName(announcement.date) + "</span>" +
      "</div>" +
      '<div class="announcement__body">' +
      '<div class="announcement__top"><h3>' + title + "</h3>" + (isNew ? '<span class="announcement__new">جديد</span>' : "") + "</div>" +
      "<p>" + (body || "لا توجد تفاصيل إضافية لهذا الإعلان.") + "</p>" +
      '<div class="announcement__foot">' +
      '<span class="announcement__note">' + window.icon("shield") + " إدارة المدرسة</span>" +
      link +
      "</div></div></article>";
  }

  function emptyState(title, text) {
    return '<div class="library-empty">' +
      window.icon("book-open") +
      "<h3>" + UI.escapeHtml(title) + "</h3>" +
      "<p>" + UI.escapeHtml(text) + "</p></div>";
  }

  function renderAnnouncements() {
    if (!state.loaded) return;

    var filtered = state.announcements.filter(matchesAnnouncement);
    var latestId = state.announcements.length ? state.announcements[0].id : null;

    els.boardCount.textContent = "عدد الإعلانات: " + countLabel(filtered.length);

    if (!filtered.length) {
      els.list.innerHTML = state.query
        ? emptyState("لا توجد نتائج مطابقة", "جرّب كلمة بحث أخرى أو امسح حقل البحث.")
        : emptyState("لا توجد إعلانات منشورة حاليًا", "ستظهر إعلانات المكتبة هنا فور نشرها من إدارة المدرسة.");
      updateHero();
      return;
    }

    els.list.innerHTML = filtered.map(function (announcement, index) {
      return announcementCard(announcement, index, latestId);
    }).join("");
    updateHero();
  }

  function applySettings(settings) {
    state.settings = settings || {};
    var folderId = extractFolderId(state.settings.libraryDrive) || extractFolderId((config.defaults || {}).libraryDrive);

    if (!folderId) {
      setDriveError("لم يتم ضبط مجلد المكتبة الرسمي بعد.");
      return;
    }
    if (folderId === state.drive.rootId) return;

    state.drive.rootId = folderId;
    state.drive.stack = [{ id: folderId, name: "المكتبة" }];
    state.drive.items = [];
    state.drive.cache = {};
    state.drive.rootCount = null;
    state.drive.syncedAt = null;
    state.drive.error = "";
    state.drive.query = "";
    if (els.driveSearch) els.driveSearch.value = "";

    hideFallback();
    loadRootName();
    loadFolder(folderId, { force: true });
  }

  function applyOfficialLinks() {
    var defaults = config.defaults || {};
    [["school", defaults.schoolUrl], ["ministry", defaults.ministryUrl], ["vision", defaults.visionUrl]].forEach(function (pair) {
      var href = UI.safeLink(pair[1]);
      if (!href) return;
      document.querySelectorAll('[data-link="' + pair[0] + '"]').forEach(function (link) {
        link.href = href;
      });
    });
  }

  function bind() {
    els.driveSearch.addEventListener("input", function () {
      state.drive.query = els.driveSearch.value.trim();
      renderDrive();
    });

    els.driveGrid.addEventListener("click", function (event) {
      var retry = event.target.closest("[data-drive-retry]");
      if (retry) {
        var folder = currentFolder();
        if (folder) loadFolder(folder.id, { force: true });
        return;
      }
      var card = event.target.closest("[data-drive-id]");
      if (!card) return;
      var item = state.drive.items.find(function (entry) {
        return entry.id === card.getAttribute("data-drive-id");
      });
      if (!item) return;
      if (card.getAttribute("data-drive-kind") === "folder") openFolder(item);
      else openPreview(item);
    });

    els.driveCrumbs.addEventListener("click", function (event) {
      var crumb = event.target.closest("[data-crumb-index]");
      if (!crumb) return;
      navigateToCrumb(Number(crumb.getAttribute("data-crumb-index")));
    });

    els.refreshBtn.addEventListener("click", refreshDrive);
    els.sideRefresh.addEventListener("click", refreshDrive);

    els.search.addEventListener("input", function () {
      state.query = els.search.value.trim();
      renderAnnouncements();
    });

    document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
      button.addEventListener("click", function () {
        UI.closeDialog(button.closest("dialog"));
      });
    });

    els.previewDialog.addEventListener("close", clearPreview);

    els.previewFrame.addEventListener("load", function () {
      els.previewLoading.classList.add("is-hidden");
    });
  }

  function init() {
    UI.initChrome();

    els = {
      fileCount: document.getElementById("libraryFileCount"),
      lastUpdate: document.getElementById("libraryLastUpdate"),
      driveCrumbs: document.getElementById("driveCrumbs"),
      driveSearch: document.getElementById("driveSearch"),
      driveRefresh: document.getElementById("driveRefresh"),
      driveStatus: document.getElementById("driveStatus"),
      driveGrid: document.getElementById("driveGrid"),
      driveAlert: document.getElementById("driveAlert"),
      driveAlertText: document.getElementById("driveAlertText"),
      driveFallback: document.getElementById("driveFallback"),
      driveFrame: document.getElementById("driveFrame"),
      driveNoteText: document.getElementById("driveNoteText"),
      refreshBtn: document.getElementById("driveRefresh"),
      sideRefresh: document.getElementById("libraryDriveRefresh"),
      previewDialog: document.getElementById("drivePreviewDialog"),
      previewTitle: document.getElementById("drivePreviewTitle"),
      previewMeta: document.getElementById("drivePreviewMeta"),
      previewFrame: document.getElementById("drivePreviewFrame"),
      previewLoading: document.getElementById("drivePreviewLoading"),
      list: document.getElementById("announcementsList"),
      boardCount: document.getElementById("boardCount"),
      search: document.getElementById("announcementSearch"),
      alert: document.getElementById("libraryAlert"),
      alertText: document.getElementById("libraryAlertText")
    };

    bind();
    applyOfficialLinks();
    applySettings(Object.assign({}, config.defaults || {}));
    updateHero();

    Store.subscribeAnnouncements(function (announcements) {
      state.announcements = announcements || [];
      state.loaded = true;
      renderAnnouncements();
    });

    Store.subscribeLibrary(function (libraryMeta) {
      state.libraryMeta = libraryMeta || [];
      if (state.drive.rootId) renderDrive();
    });

    Store.subscribeSettings(applySettings);

    try {
      if ("BroadcastChannel" in window) {
        var libraryChannel = new BroadcastChannel("farooq-library-updates");
        libraryChannel.onmessage = function () {
          if (state.drive.rootId) refreshDrive();
        };
      }
    } catch (error) {
      /* التحديث اللحظي للمكتبة اختياري */
    }

    Store.subscribeStatus(function (status) {
      var hasError = status.connection === "error";
      els.alert.classList.toggle("is-visible", hasError);
      if (hasError) {
        els.alertText.textContent = status.message;
        if (!state.loaded) {
          els.list.innerHTML = emptyState("تعذر تحميل إعلانات المكتبة", "تحقق من إعدادات Firebase والصلاحيات، أو أعد تحميل الصفحة.");
        }
      }
      UI.updateModePills(status.mode);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
