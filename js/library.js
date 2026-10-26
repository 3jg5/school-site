(function () {
  "use strict";

  var UI = window.FarooqUI;
  var Store = window.FarooqStore;
  var config = window.SITE_CONFIG || {};

  var state = {
    announcements: [],
    items: [],
    loadedAnnouncements: false,
    loadedLibrary: false,
    query: "",
    libraryQuery: ""
  };

  var els = {};

  function countLabel(count) {
    try {
      return new Intl.NumberFormat("ar-OM").format(count);
    } catch (error) {
      return String(count);
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

  function typeInfo(item) {
    var mime = String(item.fileType || "").toLowerCase();
    var name = String(item.fileName || item.url || "").toLowerCase();
    var source = mime + " " + name;
    if (/pdf/.test(mime) || /\.pdf(\?|$)/.test(name)) return { kind: "pdf", label: "PDF", icon: "file", cta: "معاينة الملف" };
    if (/^image\//.test(mime) || /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(name)) return { kind: "image", label: "صورة", icon: "image", cta: "معاينة الصورة" };
    if (/^video\//.test(mime) || /\.(mp4|webm|mov)(\?|$)/.test(name)) return { kind: "video", label: "فيديو", icon: "video", cta: "معاينة الفيديو" };
    if (/^audio\//.test(mime) || /\.(mp3|wav|ogg)(\?|$)/.test(name)) return { kind: "audio", label: "صوت", icon: "music", cta: "معاينة الملف" };
    if (/spreadsheet|excel|\.xlsx?(\?|$)/.test(source)) return { kind: "sheet", label: "جدول", icon: "grid", cta: "معاينة الملف" };
    if (/presentation|powerpoint|\.pptx?(\?|$)/.test(source)) return { kind: "slides", label: "عرض", icon: "presentation", cta: "معاينة الملف" };
    if (/zip|rar|7z|tar|gzip/.test(mime) || /\.(zip|rar|7z)(\?|$)/.test(name)) return { kind: "archive", label: "أرشيف", icon: "archive", cta: "تحميل الملف" };
    return { kind: "file", label: "ملف", icon: "file", cta: "معاينة الملف" };
  }

  function libraryMatches(item) {
    var query = normalizeArabic(state.libraryQuery);
    if (!query) return true;
    var haystack = [item.title, item.description, item.category, item.fileName].join(" ");
    return normalizeArabic(haystack).indexOf(query) !== -1;
  }

  function sortedItems() {
    return state.items.slice().sort(function (a, b) {
      var aTime = UI.toDate(a.updatedAt || a.createdAt);
      var bTime = UI.toDate(b.updatedAt || b.createdAt);
      return (bTime ? bTime.getTime() : 0) - (aTime ? aTime.getTime() : 0);
    });
  }

  function updateHero() {
    if (!state.loadedLibrary) {
      els.fileCount.textContent = "جارٍ تحميل محتوى المكتبة…";
    } else if (!state.items.length) {
      els.fileCount.textContent = "المكتبة فارغة حاليًا";
    } else {
      els.fileCount.textContent = "ملفات المكتبة: " + countLabel(state.items.length);
    }

    var latest = null;
    state.items.forEach(function (item) {
      var date = UI.toDate(item.updatedAt || item.createdAt);
      if (date && (!latest || date.getTime() > latest.getTime())) latest = date;
    });
    state.announcements.forEach(function (item) {
      var date = UI.toDate(item.date);
      if (date && (!latest || date.getTime() > latest.getTime())) latest = date;
    });
    els.lastUpdate.textContent = latest ? "آخر تحديث: " + UI.formatDate(latest, "short") : "آخر تحديث: —";
  }

  function cardCover(item, info) {
    if (info.kind === "image") {
      var image = UI.safeImage(item.url);
      if (image) {
        return '<span class="drive-card__cover" data-cover-kind="image">' +
          '<img src="' + UI.escapeHtml(image) + '" alt="" loading="lazy">' +
          "</span>";
      }
    }
    return '<span class="drive-card__cover drive-card__cover--' + info.kind + '" data-cover-kind="' + info.kind + '">' +
      '<span class="drive-card__cover-icon">' + window.icon(info.icon) + "</span>" +
      "</span>";
  }

  function libraryCard(item, index) {
    var info = typeInfo(item);
    var title = item.title || item.fileName || "ملف من المكتبة";
    var description = item.description || "ملف من مكتبة مدرسة الفاروق، يمكن معاينته أو تحميله مباشرة.";
    var details = [];
    var date = item.updatedAt || item.createdAt;
    if (date) details.push("<span>" + window.icon("calendar") + UI.escapeHtml(UI.formatDate(date, "short")) + "</span>");
    if (item.fileSize) details.push("<span>" + UI.escapeHtml(formatSize(item.fileSize)) + "</span>");

    return '<button type="button" class="drive-card drive-card--' + info.kind + '" data-library-id="' + UI.escapeHtml(item.id) + '" style="--i:' + Math.min(index, 8) + '">' +
      cardCover(item, info) +
      '<span class="drive-card__body">' +
      '<span class="drive-card__badges">' +
      (item.category ? '<span class="drive-card__type">' + UI.escapeHtml(item.category) + "</span>" : "") +
      '<span class="drive-card__format">' + UI.escapeHtml(info.label) + "</span>" +
      "</span>" +
      '<span class="drive-card__name">' + UI.escapeHtml(title) + "</span>" +
      '<span class="drive-card__desc">' + UI.escapeHtml(description) + "</span>" +
      '<span class="drive-card__meta">' + details.join("") + "</span>" +
      '<span class="drive-card__cta">' + window.icon("eye") + info.cta + "</span>" +
      "</span>" +
      "</button>";
  }

  function wireCovers() {
    els.grid.querySelectorAll(".drive-card__cover img").forEach(function (image) {
      image.addEventListener("error", function () {
        var cover = image.closest(".drive-card__cover");
        if (!cover) return;
        cover.classList.add("drive-card__cover--image");
        cover.innerHTML = '<span class="drive-card__cover-icon">' + window.icon("image") + "</span>";
      });
    });
  }

  function emptyCard(icon, title, text) {
    return '<div class="drive-empty">' +
      window.icon(icon) +
      "<h3>" + UI.escapeHtml(title) + "</h3>" +
      "<p>" + UI.escapeHtml(text) + "</p>" +
      "</div>";
  }

  function renderLibrary() {
    if (!state.loadedLibrary) {
      els.status.textContent = "جارٍ تحميل محتوى المكتبة…";
      updateHero();
      return;
    }

    var items = sortedItems();
    var filtered = items.filter(libraryMatches);

    if (!items.length) {
      els.status.textContent = "المكتبة فارغة حاليًا";
      els.grid.innerHTML = emptyCard("folder", "لا توجد ملفات في المكتبة بعد", "ستظهر ملفات المدرسة هنا فور إضافتها من إدارة المدرسة.");
      updateHero();
      return;
    }

    if (!filtered.length) {
      els.status.textContent = "لا توجد نتائج مطابقة";
      els.grid.innerHTML = emptyCard("search", "لا توجد ملفات مطابقة", "جرّب كلمة بحث أخرى أو امسح حقل البحث لعرض كل الملفات.");
      updateHero();
      return;
    }

    els.status.textContent = state.libraryQuery
      ? "نتائج البحث: " + countLabel(filtered.length) + " من " + countLabel(items.length) + " ملفًا"
      : "عرض " + countLabel(items.length) + " ملفًا";
    els.grid.innerHTML = filtered.map(libraryCard).join("");
    wireCovers();
    updateHero();
  }

  function clearPreview() {
    els.previewFrame.removeAttribute("src");
    els.previewImage.removeAttribute("src");
    els.previewVideo.pause();
    els.previewVideo.removeAttribute("src");
    els.previewVideo.load();
    els.previewImage.hidden = true;
    els.previewFrame.hidden = true;
    els.previewVideo.hidden = true;
    els.previewFallback.hidden = true;
    els.previewLoading.classList.remove("is-hidden");
    window.clearTimeout(clearPreview.timer);
  }

  function openPreview(item) {
    var url = UI.safeLink(item.url);
    if (!url) {
      UI.showToast("رابط الملف غير متاح حاليًا.", "error");
      return;
    }

    var info = typeInfo(item);
    var meta = [info.label];
    if (item.category) meta.push(item.category);
    if (item.fileSize) meta.push(formatSize(item.fileSize));
    var date = item.updatedAt || item.createdAt;
    if (date) meta.push(UI.formatDate(date, "short"));

    els.previewTitle.textContent = item.title || item.fileName || "ملف المكتبة";
    els.previewMeta.textContent = meta.join(" · ");
    els.previewDownload.href = url;
    els.previewLoading.classList.remove("is-hidden");
    els.previewFrame.hidden = true;
    els.previewImage.hidden = true;
    els.previewVideo.hidden = true;
    els.previewFallback.hidden = true;

    if (info.kind === "pdf") {
      els.previewFrame.hidden = false;
      els.previewFrame.src = url;
    } else if (info.kind === "image") {
      els.previewImage.hidden = false;
      els.previewImage.src = url;
    } else if (info.kind === "video") {
      els.previewVideo.hidden = false;
      els.previewVideo.src = url;
    } else {
      els.previewFallback.hidden = false;
      els.previewLoading.classList.add("is-hidden");
    }

    clearPreview.timer = window.setTimeout(function () {
      els.previewLoading.classList.add("is-hidden");
    }, 6000);

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
    if (!state.loadedAnnouncements) return;

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
    els.search.addEventListener("input", function () {
      state.libraryQuery = els.search.value.trim();
      renderLibrary();
    });

    els.grid.addEventListener("click", function (event) {
      var card = event.target.closest("[data-library-id]");
      if (!card) return;
      var item = state.items.find(function (entry) {
        return entry.id === card.getAttribute("data-library-id");
      });
      if (item) openPreview(item);
    });

    els.announcementSearch.addEventListener("input", function () {
      state.query = els.announcementSearch.value.trim();
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

    els.previewImage.addEventListener("load", function () {
      els.previewLoading.classList.add("is-hidden");
    });

    els.previewImage.addEventListener("error", function () {
      els.previewImage.hidden = true;
      els.previewFallback.hidden = false;
      els.previewLoading.classList.add("is-hidden");
    });

    els.previewVideo.addEventListener("loadeddata", function () {
      els.previewLoading.classList.add("is-hidden");
    });

    els.previewVideo.addEventListener("error", function () {
      els.previewVideo.hidden = true;
      els.previewFallback.hidden = false;
      els.previewLoading.classList.add("is-hidden");
    });
  }

  function init() {
    UI.initChrome();

    els = {
      fileCount: document.getElementById("libraryFileCount"),
      lastUpdate: document.getElementById("libraryLastUpdate"),
      search: document.getElementById("librarySearch"),
      status: document.getElementById("libraryStatus"),
      grid: document.getElementById("libraryGrid"),
      previewDialog: document.getElementById("libraryPreviewDialog"),
      previewTitle: document.getElementById("libraryPreviewTitle"),
      previewMeta: document.getElementById("libraryPreviewMeta"),
      previewFrame: document.getElementById("libraryPreviewFrame"),
      previewImage: document.getElementById("libraryPreviewImage"),
      previewVideo: document.getElementById("libraryPreviewVideo"),
      previewFallback: document.getElementById("libraryPreviewFallback"),
      previewLoading: document.getElementById("libraryPreviewLoading"),
      previewDownload: document.getElementById("libraryPreviewDownload"),
      list: document.getElementById("announcementsList"),
      boardCount: document.getElementById("boardCount"),
      announcementSearch: document.getElementById("announcementSearch"),
      alert: document.getElementById("libraryAlert"),
      alertText: document.getElementById("libraryAlertText")
    };

    bind();
    applyOfficialLinks();
    updateHero();

    Store.subscribeAnnouncements(function (announcements) {
      state.announcements = announcements || [];
      state.loadedAnnouncements = true;
      renderAnnouncements();
    });

    Store.subscribeLibrary(function (items) {
      state.items = items || [];
      state.loadedLibrary = true;
      renderLibrary();
    });

    Store.subscribeStatus(function (status) {
      var hasError = status.connection === "error";
      els.alert.classList.toggle("is-visible", hasError);
      if (hasError) {
        els.alertText.textContent = status.message;
        if (!state.loadedAnnouncements) {
          els.list.innerHTML = emptyState("تعذر تحميل إعلانات المكتبة", "تحقق من إعدادات Firebase والصلاحيات، أو أعد تحميل الصفحة.");
        }
        if (!state.loadedLibrary) {
          els.status.textContent = "تعذر تحميل ملفات المكتبة";
          els.grid.innerHTML = emptyCard("alert", "تعذر عرض ملفات المكتبة", "تحقق من الاتصال بالإنترنت ثم أعد تحميل الصفحة.");
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
