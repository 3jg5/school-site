(function () {
  "use strict";

  var UI = window.FarooqUI;
  var Store = window.FarooqStore;

  var state = {
    news: [],
    announcements: [],
    settings: {},
    category: "الكل",
    newsLoaded: false,
    filtersSignature: ""
  };

  var els = {};

  function countLabel(count) {
    try {
      return new Intl.NumberFormat("ar-OM").format(count);
    } catch (error) {
      return String(count);
    }
  }

  function newsCategories() {
    var preferred = ["إنجازات", "فعاليات", "رياضة", "إعلانات"];
    var categories = [];
    preferred.forEach(function (category) {
      if (state.news.some(function (item) { return item.category === category; })) categories.push(category);
    });
    state.news.forEach(function (item) {
      if (item.category && categories.indexOf(item.category) === -1) categories.push(item.category);
    });
    return ["الكل"].concat(categories);
  }

  function renderFilters() {
    var categories = newsCategories();
    if (categories.indexOf(state.category) === -1) state.category = "الكل";
    var signature = categories.join("|");
    if (signature !== state.filtersSignature) {
      state.filtersSignature = signature;
      els.filters.innerHTML = categories.map(function (category) {
        return '<button class="chip' + (category === state.category ? " is-active" : "") + '" type="button" data-category="' +
          UI.escapeHtml(category) + '" aria-pressed="' + (category === state.category ? "true" : "false") + '">' +
          UI.escapeHtml(category) + "</button>";
      }).join("");
    } else {
      els.filters.querySelectorAll("[data-category]").forEach(function (button) {
        var active = button.getAttribute("data-category") === state.category;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }
  }

  function attachmentKind(item) {
    var mime = String(item.attachmentType || "").toLowerCase();
    var name = String(item.attachmentName || item.attachmentUrl || "").toLowerCase();
    if (/^video\//.test(mime) || /\.(mp4|webm|mov|m4v)(\?|$)/.test(name)) return "video";
    return "file";
  }

  function attachmentBlock(item) {
    var url = UI.safeLink(item.attachmentUrl);
    if (!url) return "";
    var label = item.attachmentName || "مرفق الخبر";
    if (attachmentKind(item) === "video") {
      return '<div class="article-attachment">' +
        '<p class="article-attachment__label">' + window.icon("video") + " فيديو مرفق مع الخبر</p>" +
        '<video controls playsinline preload="metadata" src="' + UI.escapeHtml(url) + '"></video>' +
        '<a class="btn btn--ghost btn--sm" href="' + UI.escapeHtml(url) + '" target="_blank" rel="noopener">' + window.icon("download") + " تحميل الفيديو</a>" +
        "</div>";
    }
    return '<div class="article-attachment">' +
      '<p class="article-attachment__label">' + window.icon("file") + " مرفق مع الخبر</p>" +
      '<a class="btn btn--ghost btn--sm" href="' + UI.escapeHtml(url) + '" target="_blank" rel="noopener">' + window.icon("external") + " " + UI.escapeHtml(label) + "</a>" +
      "</div>";
  }

  function clearNewsAttachment() {
    var video = els.newsDialogAttachment.querySelector("video");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    els.newsDialogAttachment.innerHTML = "";
  }

  function newsCard(item, index, featured) {
    var image = UI.safeImage(item.image);
    var category = UI.escapeHtml(item.category || "عام");
    var title = UI.escapeHtml(item.title || "خبر بدون عنوان");
    var summary = UI.escapeHtml(item.summary || "");
    var date = UI.formatDate(item.date, "short");
    var meta = '<span class="news-card__meta">' + window.icon("calendar") + "<span>" + UI.escapeHtml(date) + "</span></span>";
    var media = '<div class="news-card__media">' +
      '<span class="news-card__fallback"><img src="assets/logos/farooq-logo.png" alt="" aria-hidden="true"></span>' +
      (image ? '<img class="news-card__image" src="' + UI.escapeHtml(image) + '" alt="' + title + '" loading="lazy" width="700" height="440">' : "") +
      '<span class="news-card__tag">' + category + "</span>" +
      (item.pinned ? '<span class="news-card__pin" title="خبر مثبت">' + window.icon("pin") + "</span>" : "") +
      (item.attachmentUrl ? '<span class="news-card__attach">' + window.icon(attachmentKind(item) === "video" ? "video" : "file") + (attachmentKind(item) === "video" ? " فيديو مرفق" : " ملف مرفق") + "</span>" : "") +
      "</div>";

    var body = '<div class="news-card__body">' +
      meta +
      "<h3>" + title + "</h3>" +
      (summary ? '<p class="news-card__excerpt">' + summary + "</p>" : "") +
      '<span class="news-card__more">قراءة الخبر ' + window.icon("arrow-left") + "</span>" +
      "</div>";

    return '<article class="news-card' + (featured ? " news-card--featured" : "") + '" style="--i:' + Math.min(index, 6) + '">' +
      media + body +
      '<a class="news-card__cover-link" href="#" data-news-id="' + UI.escapeHtml(item.id) + '" aria-label="قراءة خبر: ' + title + '"></a>' +
      "</article>";
  }

  function emptyState(title, text) {
    return '<div class="state-card">' +
      '<img class="state-card__logo" src="assets/logos/farooq-logo.png" alt="" aria-hidden="true">' +
      "<h3>" + UI.escapeHtml(title) + "</h3><p>" + UI.escapeHtml(text) + "</p></div>";
  }

  function renderNews() {
    if (!els.grid) return;

    if (!state.newsLoaded) return;

    var filtered = state.category === "الكل"
      ? state.news
      : state.news.filter(function (item) { return item.category === state.category; });

    els.count.textContent = filtered.length ? countLabel(filtered.length) + " أخبار" : "";

    if (!filtered.length) {
      els.grid.innerHTML = emptyState("لا توجد أخبار منشورة حاليًا", "ستظهر أخبار المدرسة هنا فور نشرها من قسم الإدارة.");
      return;
    }

    els.grid.innerHTML = filtered.map(function (item, index) {
      var featured = state.category === "الكل" && index === 0 && filtered.length > 1;
      return newsCard(item, index, featured);
    }).join("");

    els.grid.querySelectorAll("img.news-card__image").forEach(function (image) {
      image.addEventListener("error", function () {
        image.closest(".news-card__media").classList.add("is-missing");
        image.remove();
      });
    });
  }

  function renderTicker(items) {
    if (!els.ticker) return;
    if (!items.length) {
      els.ticker.hidden = true;
      return;
    }
    els.ticker.hidden = false;
    var latest = items[0];
    els.tickerContent.innerHTML =
      '<a href="library.html">' + UI.escapeHtml(latest.title) + "</a>" +
      '<span class="ticker__date">' + UI.escapeHtml(UI.formatDate(latest.date, "short")) + "</span>";
  }

  function openNews(id) {
    var item = state.news.find(function (entry) { return entry.id === id; });
    if (!item) return;

    els.newsDialogTitle.textContent = item.title || "تفاصيل الخبر";

    var date = UI.formatDate(item.date);
    els.newsDialogMeta.innerHTML =
      '<span class="article-meta__item">' + window.icon("calendar") + UI.escapeHtml(date) + "</span>" +
      '<span class="tag">' + UI.escapeHtml(item.category || "عام") + "</span>" +
      (item.pinned ? '<span class="tag">' + window.icon("pin") + " خبر مثبت</span>" : "");

    var body = String(item.body || item.summary || "").trim();
    var paragraphs = body.split(/\n+/).map(function (line) {
      return line.trim();
    }).filter(Boolean);
    els.newsDialogContent.innerHTML = paragraphs.length
      ? paragraphs.map(function (line) { return "<p>" + UI.escapeHtml(line) + "</p>"; }).join("")
      : "<p>لا توجد تفاصيل إضافية لهذا الخبر.</p>";

    clearNewsAttachment();
    els.newsDialogAttachment.innerHTML = attachmentBlock(item);

    els.newsDialogTags.innerHTML =
      '<span class="article-meta__item">' + window.icon("users") + " إدارة المدرسة</span>" +
      '<span class="article-meta__item">' + window.icon("cloud") + " منشور عبر المنصة الرسمية</span>";

    var image = UI.safeImage(item.image);
    els.newsDialogHero.classList.toggle("is-missing", !image);
    if (image) {
      els.newsDialogImage.src = image;
      els.newsDialogImage.alt = item.title || "";
      els.newsDialogImage.onerror = function () {
        els.newsDialogHero.classList.add("is-missing");
      };
    } else {
      els.newsDialogImage.removeAttribute("src");
      els.newsDialogImage.alt = "";
    }

    UI.openDialog(els.newsDialog);
  }

  function applySocialLinks(settings) {
    [["instagram", settings.instagram], ["twitter", settings.twitter]].forEach(function (pair) {
      var key = pair[0];
      var href = UI.safeLink(pair[1]);
      document.querySelectorAll('[data-social="' + key + '"]').forEach(function (link) {
        var note = link.querySelector("[data-social-note]");
        var goIcon = link.querySelector(".gateway-link__go");
        if (href) {
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener";
          link.classList.remove("is-disabled");
          link.removeAttribute("aria-disabled");
          if (note) note.textContent = "الحساب الرسمي للمدرسة";
          if (goIcon) goIcon.innerHTML = window.icon("external");
        } else {
          link.removeAttribute("href");
          link.removeAttribute("target");
          link.classList.add("is-disabled");
          link.setAttribute("aria-disabled", "true");
          if (note) note.textContent = "سيُضاف الرابط قريبًا";
          if (goIcon) goIcon.innerHTML = window.icon("sparkle");
        }
      });
    });
  }

  function applyOfficialLinks() {
    var defaults = (window.SITE_CONFIG && window.SITE_CONFIG.defaults) || {};
    [["school", defaults.schoolUrl], ["ministry", defaults.ministryUrl], ["vision", defaults.visionUrl]].forEach(function (pair) {
      var href = UI.safeLink(pair[1]);
      if (!href) return;
      document.querySelectorAll('[data-link="' + pair[0] + '"]').forEach(function (link) {
        link.href = href;
      });
    });
  }

  function openGateway(entity) {
    document.querySelectorAll("[data-gateway-entity]").forEach(function (card) {
      card.classList.toggle("is-target", card.getAttribute("data-gateway-entity") === entity);
    });
    UI.openDialog(els.gatewayDialog);
    var target = els.gatewayDialog.querySelector('[data-gateway-entity="' + entity + '"]');
    if (target) {
      window.setTimeout(function () {
        target.scrollIntoView({ block: "nearest" });
      }, 120);
    }
  }

  function bind() {
    document.querySelectorAll(".js-open-gateway").forEach(function (button) {
      button.addEventListener("click", function () {
        openGateway(button.getAttribute("data-entity") || "school");
      });
    });

    document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
      button.addEventListener("click", function () {
        UI.closeDialog(button.closest("dialog"));
      });
    });

    els.filters.addEventListener("click", function (event) {
      var button = event.target.closest("[data-category]");
      if (!button) return;
      state.category = button.getAttribute("data-category");
      renderFilters();
      renderNews();
    });

    els.grid.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-news-id]");
      if (!trigger) return;
      event.preventDefault();
      openNews(trigger.getAttribute("data-news-id"));
    });

    els.newsDialog.addEventListener("close", clearNewsAttachment);
  }

  function init() {
    UI.initChrome();

    els = {
      filters: document.getElementById("newsFilters"),
      grid: document.getElementById("newsGrid"),
      count: document.getElementById("newsCount"),
      alert: document.getElementById("newsAlert"),
      alertText: document.getElementById("newsAlertText"),
      ticker: document.getElementById("newsTicker"),
      tickerContent: document.getElementById("tickerContent"),
      gatewayDialog: document.getElementById("gatewayDialog"),
      newsDialog: document.getElementById("newsDialog"),
      newsDialogTitle: document.getElementById("newsDialogTitle"),
      newsDialogHero: document.getElementById("newsDialogHero"),
      newsDialogImage: document.getElementById("newsDialogImage"),
      newsDialogMeta: document.getElementById("newsDialogMeta"),
      newsDialogContent: document.getElementById("newsDialogContent"),
      newsDialogAttachment: document.getElementById("newsDialogAttachment"),
      newsDialogTags: document.getElementById("newsDialogTags")
    };

    bind();
    applyOfficialLinks();
    applySocialLinks(state.settings);

    Store.subscribeNews(function (news) {
      state.news = news || [];
      state.newsLoaded = true;
      renderFilters();
      renderNews();
    });

    Store.subscribeAnnouncements(function (announcements) {
      state.announcements = announcements || [];
      renderTicker(state.announcements);
    });

    Store.subscribeSettings(function (settings) {
      state.settings = settings || {};
      applySocialLinks(state.settings);
    });

    Store.subscribeStatus(function (status) {
      var hasError = status.connection === "error";
      els.alert.classList.toggle("is-visible", hasError);
      if (hasError) {
        els.alertText.textContent = status.message;
        if (!state.newsLoaded) {
          els.grid.innerHTML = emptyState("تعذر تحميل الأخبار", "تحقق من إعدادات Firebase والصلاحيات، أو أعد تحميل الصفحة.");
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
