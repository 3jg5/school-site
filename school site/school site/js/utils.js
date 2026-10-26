window.FarooqUI = (function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "number") return new Date(value);
    var text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(text + "T12:00:00");
    var date = new Date(text);
    return isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, style) {
    var date = toDate(value);
    if (!date) return "";
    var options = style === "short"
      ? { day: "numeric", month: "short", year: "numeric" }
      : { weekday: "long", day: "numeric", month: "long", year: "numeric" };
    try {
      return new Intl.DateTimeFormat("ar-OM", options).format(date);
    } catch (error) {
      return date.toLocaleDateString("ar");
    }
  }

  function monthName(value) {
    var date = toDate(value);
    if (!date) return "";
    try {
      return new Intl.DateTimeFormat("ar-OM", { month: "long" }).format(date);
    } catch (error) {
      return "";
    }
  }

  function dayNumber(value) {
    var date = toDate(value);
    if (!date) return "";
    try {
      return new Intl.DateTimeFormat("ar-OM", { day: "numeric" }).format(date);
    } catch (error) {
      return String(date.getDate());
    }
  }

  function arabicNumber(value) {
    try {
      return new Intl.NumberFormat("ar-OM").format(value);
    } catch (error) {
      return String(value);
    }
  }

  function relativeTime(value) {
    var date = toDate(value);
    if (!date) return "—";
    var diff = Date.now() - date.getTime();
    var minutes = Math.round(diff / 60000);
    if (minutes < 1) return "الآن";
    if (minutes < 60) {
      if (minutes === 1) return "قبل دقيقة";
      if (minutes === 2) return "قبل دقيقتين";
      return "قبل " + arabicNumber(minutes) + (minutes <= 10 ? " دقائق" : " دقيقة");
    }
    var hours = Math.round(minutes / 60);
    if (hours < 24) {
      if (hours === 1) return "قبل ساعة";
      if (hours === 2) return "قبل ساعتين";
      return "قبل " + arabicNumber(hours) + (hours <= 10 ? " ساعات" : " ساعة");
    }
    var days = Math.round(hours / 24);
    if (days < 7) {
      if (days === 1) return "قبل يوم";
      if (days === 2) return "قبل يومين";
      return "قبل " + arabicNumber(days) + (days <= 10 ? " أيام" : " يومًا");
    }
    return formatDate(date, "short");
  }

  function safeLink(raw) {
    var text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    try {
      var url = new URL(text, document.baseURI);
      if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:") return url.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function safeImage(raw) {
    var text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(text)) return text;
    return safeLink(text);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    document.documentElement.classList.add("has-dialog");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    document.documentElement.classList.remove("has-dialog");
  }

  function initDialogs() {
    document.querySelectorAll("dialog").forEach(function (dialog) {
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) closeDialog(dialog);
      });
      dialog.addEventListener("close", function () {
        document.documentElement.classList.remove("has-dialog");
      });
    });
  }

  function showToast(message, kind) {
    var region = document.querySelector(".toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    var toast = document.createElement("div");
    toast.className = "toast " + (kind === "error" ? "toast--error" : "toast--success");
    toast.innerHTML = window.icon(kind === "error" ? "alert" : "check") + "<span>" + escapeHtml(message) + "</span>";
    region.appendChild(toast);
    window.setTimeout(function () {
      toast.classList.add("is-leaving");
      window.setTimeout(function () { toast.remove(); }, 260);
    }, 3800);
  }

  function updateModePills(mode) {
    document.querySelectorAll("[data-mode-pill]").forEach(function (pill) {
      pill.textContent = mode === "cloud" ? "متصل سحابيًا" : "نسخة تجريبية";
      pill.classList.toggle("is-cloud", mode === "cloud");
    });
  }

  function initChrome() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });

    if (window.FarooqStore) updateModePills(window.FarooqStore.mode);

    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("siteNav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.classList.toggle("is-open", open);
      });
      nav.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          nav.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
          toggle.classList.remove("is-open");
        });
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          nav.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
          toggle.classList.remove("is-open");
        }
      });
    }

    var header = document.querySelector(".site-header");
    if (header) {
      var onScroll = function () {
        header.classList.toggle("is-scrolled", window.scrollY > 8);
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    initDialogs();

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
      document.querySelectorAll(".reveal").forEach(function (el) { observer.observe(el); });
    } else {
      document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("is-visible"); });
    }
  }

  return {
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    monthName: monthName,
    dayNumber: dayNumber,
    relativeTime: relativeTime,
    safeLink: safeLink,
    safeImage: safeImage,
    toDate: toDate,
    openDialog: openDialog,
    closeDialog: closeDialog,
    showToast: showToast,
    initChrome: initChrome,
    updateModePills: updateModePills
  };
})();
