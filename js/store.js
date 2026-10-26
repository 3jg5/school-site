(function () {
  "use strict";

  var config = window.SITE_CONFIG || {};
  var firebaseConfig = config.firebaseConfig || {};
  var defaults = Object.assign({}, config.defaults || {});
  var configured = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);

  var mode = "demo";
  var db = null;
  var auth = null;
  var authAvailable = false;
  var authReady = false;
  var authUser = null;
  var authListeners = new Set();
  var connection = "connecting";
  var statusMessage = "";
  var listeners = {
    news: new Set(),
    announcements: new Set(),
    library: new Set(),
    settings: new Set(),
    status: new Set()
  };

  var seedNews = [
    {
      id: "seed-news-1",
      title: "مدرسة الفاروق تحتفل بتخريج كوكبة من طلبتها",
      category: "إنجازات",
      date: "2026-10-22",
      summary: "وسط حضور أولياء الأمور والكادر التعليمي، احتفلت المدرسة بتخريج طلبة الصف الثاني عشر في أجواء مفعمة بالفخر والاعتزاز.",
      body: "أقامت مدرسة الفاروق حفلًا مهيبًا لتخريج طلبة الصف الثاني عشر، بحضور أولياء الأمور وأعضاء الهيئة التدريسية والطلبة، حيث تم تكريم الخريجين وتقديم شهادات التخرج وسط أجواء من الفرح والفخر.\n\nوتضمن الحفل كلمات تحفيزية من إدارة المدرسة أكدت على أهمية مواصلة التحصيل العلمي والمساهمة في بناء الوطن، كما قدّم الطلبة فقرات متنوعة عبّرت عن امتنانهم لمعلميهم وأسرهم.\n\nوتتقدّم إدارة المدرسة بخالص التهاني للخريجين والخريجات، متمنيةً لهم مستقبلًا مشرقًا بالتوفيق والنجاح.",
      image: "assets/news/graduation.jpg",
      pinned: true,
      createdAt: "2026-10-22T09:30:00.000Z",
      updatedAt: "2026-10-22T09:30:00.000Z"
    },
    {
      id: "seed-news-2",
      title: "المركز الأول لمشروع علمي في معرض العلوم والابتكار",
      category: "إنجازات",
      date: "2026-10-19",
      summary: "حصد فريق من طلبة المدرسة المركز الأول عن مشروع في الطاقة المتجددة خلال معرض العلوم والابتكار على مستوى المحافظة.",
      body: "حقّق فريق من طلبة مدرسة الفاروق إنجازًا جديدًا بحصوله على المركز الأول في معرض العلوم والابتكار، عن مشروع يقدّم حلًا عمليًا لتحسين كفاءة الطاقة في المباني المدرسية.\n\nوأشادت لجنة التحكيم بفكرة المشروع وطريقة عرضه، وبقدرة الطلبة على الربط بين المعرفة العلمية واحتياجات المجتمع.\n\nوتتقدّم إدارة المدرسة بالشكر للطلبة المشاركين ولمعلمي العلوم على دعمهم ومرافقتهم خلال مراحل المشروع.",
      image: "assets/news/science.jpg",
      pinned: false,
      createdAt: "2026-10-19T11:10:00.000Z",
      updatedAt: "2026-10-19T11:10:00.000Z"
    },
    {
      id: "seed-news-3",
      title: "أسبوع القراءة ينطلق في مكتبة الفاروق",
      category: "فعاليات",
      date: "2026-10-15",
      summary: "انطلقت فعاليات أسبوع القراءة بمجموعة من الأنشطة القرائية وورش العمل التي تستهدف تنمية عادة القراءة لدى الطلبة.",
      body: "انطلقت في مكتبة مدرسة الفاروق فعاليات أسبوع القراءة، بمشاركة مجموعة من الطلبة والمعلمين، وتضمن البرنامج جلسات قراءة مشتركة ومسابقات معرفية وورشات لتلخيص الكتب.\n\nوتهدف الفعالية إلى ترسيخ عادة القراءة اليومية، وتعزيز مهارات التفكير الناقد والتعبير اللغوي لدى الطلبة.\n\nوتدعو إدارة المكتبة جميع الطلبة إلى زيارة المساحة القرائية والاستفادة من العناوين الجديدة المتاحة.",
      image: "assets/news/library.jpg",
      pinned: false,
      createdAt: "2026-10-15T08:45:00.000Z",
      updatedAt: "2026-10-15T08:45:00.000Z"
    },
    {
      id: "seed-news-4",
      title: "حماس وإثارة في اليوم الرياضي السنوي",
      category: "رياضة",
      date: "2026-10-12",
      summary: "نظّمت المدرسة يومها الرياضي السنوي بمشاركة واسعة من الطلبة، وتضمنت المسابقة مجموعة متنوعة من الألعاب والأنشطة البدنية.",
      body: "نظّمت مدرسة الفاروق اليوم الرياضي السنوي بمشاركة واسعة من طلبة المراحل المختلفة، وتضمن البرنامج مسابقات الجري والكرة والعديد من الأنشطة البدنية الجماعية.\n\nوسادت أجواء من الحماس والتعاون بين الفرق المشاركة، فيما حرصت إدارة المدرسة على تكريم الفرق الفائزة تقديرًا لجهودهم وروحهم الرياضية.\n\nوتأتي هذه الفعالية ضمن خطة المدرسة لتعزيز اللياقة البدنية وترسيخ قيم العمل الجماعي.",
      image: "assets/news/sports.jpg",
      pinned: false,
      createdAt: "2026-10-12T10:20:00.000Z",
      updatedAt: "2026-10-12T10:20:00.000Z"
    },
    {
      id: "seed-news-5",
      title: "فريق الروبوتات يستعد للمشاركة في المسابقة الوطنية",
      category: "فعاليات",
      date: "2026-10-08",
      summary: "يواصل فريق الروبوتات استعداداته للمشاركة في المسابقة الوطنية، بإشراف معلمي التقنية والمهندسين المتطوعين.",
      body: "يواصل فريق الروبوتات في مدرسة الفاروق تدريباته المكثفة استعدادًا للمشاركة في المسابقة الوطنية للروبوتات، حيث يعمل الطلبة على تصميم وبرمجة روبوت قادر على إنجاز مهام محددة بدقة وسرعة.\n\nوتشرف على التدريبات مجموعة من معلمي التقنية، بمشاركة مهندسين متطوعين من أولياء الأمور لدعم الطلبة في الجوانب التقنية.\n\nوتتمنى إدارة المدرسة لفريقها التوفيق في مرحلة المنافسات القادمة.",
      image: "assets/news/robotics.jpg",
      pinned: false,
      createdAt: "2026-10-08T13:05:00.000Z",
      updatedAt: "2026-10-08T13:05:00.000Z"
    },
    {
      id: "seed-news-6",
      title: "مجلس الآباء والمعلمين يعقد اجتماعه الدوري",
      category: "إعلانات",
      date: "2026-10-05",
      summary: "عقد مجلس الآباء والمعلمين اجتماعه الدوري لمناقشة خطة الفصل الدراسي الحالي وسبل تعزيز الشراكة بين المدرسة والأسرة.",
      body: "عقد مجلس الآباء والمعلمين في مدرسة الفاروق اجتماعه الدوري، بحضور إدارة المدرسة وعدد من أعضاء الهيئة التدريسية وأولياء الأمور.\n\nوناقش الاجتماع خطة الفصل الدراسي الحالي، والأنشطة المقترحة، وسبل تعزيز التواصل بين المدرسة والأسرة بما يخدم مصلحة الطلبة.\n\nوقدّم الحاضرون عددًا من المقترحات التي ستُدرج ضمن خطة المجلس للفترة المقبلة.",
      image: "assets/news/parents.jpg",
      pinned: false,
      createdAt: "2026-10-05T09:00:00.000Z",
      updatedAt: "2026-10-05T09:00:00.000Z"
    }
  ];

  var seedAnnouncements = [
    {
      id: "seed-announcement-1",
      title: "تحديث جدول الحصص للفصل الدراسي الأول",
      date: "2026-10-23",
      body: "تم تحديث جدول الحصص الأسبوعي، ونرجو الاطلاع عليه عبر الرابط المرفق. يُرجى مراجعة الإدارة عند وجود أي استفسار.",
      link: "https://drive.google.com/",
      createdAt: "2026-10-23T07:40:00.000Z",
      updatedAt: "2026-10-23T07:40:00.000Z"
    },
    {
      id: "seed-announcement-2",
      title: "فتح باب التسجيل في مسابقة القراءة الرقمية",
      date: "2026-10-20",
      body: "تدعو المكتبة طلبة المدرسة للتسجيل في مسابقة القراءة الرقمية. آخر موعد للتسجيل نهاية دوام يوم الخميس.",
      link: "",
      createdAt: "2026-10-20T08:15:00.000Z",
      updatedAt: "2026-10-20T08:15:00.000Z"
    },
    {
      id: "seed-announcement-3",
      title: "مواعيد عمل المكتبة الإلكترونية",
      date: "2026-10-17",
      body: "يسر المكتبة الإلكترونية إعلامكم بأنها متاحة طوال أيام الأسبوع، وتُحدَّث الإعلانات والملفات مباشرة من إدارة المدرسة.",
      link: "",
      createdAt: "2026-10-17T11:30:00.000Z",
      updatedAt: "2026-10-17T11:30:00.000Z"
    },
    {
      id: "seed-announcement-4",
      title: "روابط الورشة التدريبية لأولياء الأمور",
      date: "2026-10-13",
      body: "نرفق لكم رابط الورشة التدريبية المخصصة لأولياء الأمور بعنوان: كيفية دعم الطلبة في التعلم الرقمي.",
      link: "",
      createdAt: "2026-10-13T12:10:00.000Z",
      updatedAt: "2026-10-13T12:10:00.000Z"
    }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function timestamp(value) {
    if (!value) return 0;
    if (typeof value.toDate === "function") return value.toDate().getTime();
    var parsed = Date.parse(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  function sortNews(items) {
    return items.slice().sort(function (a, b) {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return Boolean(b.pinned) ? 1 : -1;
      return (timestamp(b.date) || timestamp(b.createdAt)) - (timestamp(a.date) || timestamp(a.createdAt));
    });
  }

  function sortAnnouncements(items) {
    return items.slice().sort(function (a, b) {
      return (timestamp(b.date) || timestamp(b.createdAt)) - (timestamp(a.date) || timestamp(a.createdAt));
    });
  }

  function emit(name, payload) {
    listeners[name].forEach(function (callback) {
      try {
        callback(payload);
      } catch (error) {
        console.error("FarooqStore listener error:", error);
      }
    });
  }

  function getAuthState() {
    return {
      available: authAvailable,
      ready: authAvailable ? authReady : true,
      user: authUser ? Object.assign({}, authUser) : null
    };
  }

  function emitAuth() {
    var snapshot = getAuthState();
    authListeners.forEach(function (callback) {
      try {
        callback(snapshot);
      } catch (error) {
        console.error("FarooqStore auth listener error:", error);
      }
    });
  }

  function subscribeAuth(callback) {
    authListeners.add(callback);
    callback(getAuthState());
    return function () { authListeners.delete(callback); };
  }

  function signIn(email, password) {
    if (!authAvailable || !auth) return Promise.reject(new Error("auth-unavailable"));
    return auth.signInWithEmailAndPassword(String(email || "").trim(), String(password || ""));
  }

  function signOutAdmin() {
    if (!authAvailable || !auth) return Promise.reject(new Error("auth-unavailable"));
    return auth.signOut();
  }

  function setStatus(nextConnection, message) {
    connection = nextConnection;
    statusMessage = message || "";
    var snapshot = getStatus();
    listeners.status.forEach(function (callback) {
      try {
        callback(snapshot);
      } catch (error) {
        console.error(error);
      }
    });
  }

  function getStatus() {
    var message = statusMessage;
    if (!message) {
      message = mode === "cloud"
        ? (connection === "online" ? "متصل سحابيًا — تحديث لحظي" : "جارٍ الاتصال بالسحابة…")
        : "وضع العرض التجريبي — التغييرات تُحفظ مؤقتًا حتى ربط Firebase";
    }
    return { mode: mode, connection: connection, message: message };
  }

  var cloudCache = {
    news: [],
    announcements: [],
    library: [],
    settings: Object.assign({}, defaults),
    loaded: { news: false, announcements: false, library: false, settings: false }
  };
  var cloudStarted = { news: false, announcements: false, library: false, settings: false };

  function normalizeDoc(id, data) {
    var item = Object.assign({}, data, { id: id });
    ["createdAt", "updatedAt"].forEach(function (key) {
      if (item[key] && typeof item[key].toDate === "function") item[key] = item[key].toDate().toISOString();
    });
    return item;
  }

  function startCloudListener(name) {
    if (mode !== "cloud") return;

    if (name === "library") {
      startCloudListener("settings");
      return;
    }

    if (cloudStarted[name]) return;
    cloudStarted[name] = true;

    if (name === "settings") {
      db.collection("settings").doc("site").onSnapshot(function (doc) {
        var data = doc.exists ? doc.data() : {};
        var normalized = Object.assign({}, defaults, data);
        ["updatedAt"].forEach(function (key) {
          if (normalized[key] && typeof normalized[key].toDate === "function") normalized[key] = normalized[key].toDate().toISOString();
        });
        var library = Array.isArray(normalized.library) ? normalized.library : [];
        cloudCache.library = library;
        cloudCache.loaded.library = true;
        cloudCache.settings = normalized;
        cloudCache.loaded.settings = true;
        setStatus("online", "");
        emit("library", library);
        emit("settings", normalized);
      }, function (error) {
        console.error("Firestore settings error:", error);
        setStatus("error", "تعذر الاتصال بإعدادات الموقع السحابية. تحقق من إعدادات Firebase والصلاحيات.");
      });
      return;
    }

    db.collection(name).onSnapshot(function (snapshot) {
      var items = snapshot.docs.map(function (doc) { return normalizeDoc(doc.id, doc.data()); });
      if (name === "news") {
        cloudCache.news = sortNews(items);
        cloudCache.loaded.news = true;
        setStatus("online", "");
        emit("news", cloudCache.news);
      } else {
        cloudCache.announcements = sortAnnouncements(items);
        cloudCache.loaded.announcements = true;
        setStatus("online", "");
        emit("announcements", cloudCache.announcements);
      }
    }, function (error) {
      console.error("Firestore " + name + " error:", error);
      setStatus("error", "تعذر تحميل " + (name === "news" ? "الأخبار" : "الإعلانات") + " من السحابة. تحقق من إعدادات Firebase والصلاحيات.");
    });
  }

  function subscribe(name, callback) {
    listeners[name].add(callback);
    if (mode === "cloud") {
      startCloudListener(name);
      if (cloudCache.loaded[name]) {
        var cached = name === "settings" ? cloudCache.settings : cloudCache[name];
        callback(cached);
      }
    } else if (name === "news") {
      callback(sortNews(demoState.news));
    } else if (name === "announcements") {
      callback(sortAnnouncements(demoState.announcements));
    } else if (name === "library") {
      callback(clone(demoState.library));
    } else if (name === "settings") {
      callback(Object.assign({}, demoState.settings));
    }
    return function () { listeners[name].delete(callback); };
  }

  var demoState = {
    news: clone(seedNews),
    announcements: clone(seedAnnouncements),
    library: [],
    settings: Object.assign({}, defaults)
  };
  var demoVersion = 0;
  var channel = null;

  function broadcastState() {
    if (!channel) return;
    channel.postMessage({ type: "state", version: demoVersion, state: demoState });
  }

  function notifyDemo(name) {
    if (name === "news") emit("news", sortNews(demoState.news));
    else if (name === "announcements") emit("announcements", sortAnnouncements(demoState.announcements));
    else if (name === "library") emit("library", clone(demoState.library));
    else emit("settings", Object.assign({}, demoState.settings));
  }

  var firebaseReady = configured && typeof window.firebase !== "undefined" && window.firebase.firestore;

  if (firebaseReady) {
    try {
      if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
      db = window.firebase.firestore();
      mode = "cloud";
      connection = "connecting";

      if (typeof window.firebase.auth === "function") {
        try {
          auth = window.firebase.auth();
          authAvailable = true;
          auth.onAuthStateChanged(function (user) {
            authReady = true;
            authUser = user ? { uid: user.uid, email: user.email || "" } : null;
            emitAuth();
          }, function (error) {
            authReady = true;
            console.error("Firebase Auth error:", error);
            emitAuth();
          });
        } catch (authError) {
          console.error("Firebase Auth initialization failed:", authError);
          auth = null;
          authAvailable = false;
        }
      }
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      mode = "demo";
      connection = "demo";
      auth = null;
      authAvailable = false;
      statusMessage = "تعذر تهيئة Firebase، وتم تشغيل وضع العرض التجريبي. التغييرات مؤقتة حتى إصلاح الإعدادات.";
    }
  } else {
    connection = "demo";
    if (configured) {
      statusMessage = "تمت إضافة إعدادات Firebase لكن لم يتم تحميل مكتبته، لذا يعمل الموقع بوضع العرض التجريبي.";
    }
  }

  if (mode === "demo") {
    try {
      if ("BroadcastChannel" in window) {
        channel = new BroadcastChannel("farooq-school-site-demo-v1");
        channel.onmessage = function (event) {
          var data = event.data || {};
          if (data.type === "snapshot-request") {
            channel.postMessage({ type: "state", version: demoVersion, state: demoState });
          } else if (data.type === "state" && data.version > demoVersion && data.state) {
            demoState = data.state;
            demoVersion = data.version;
            notifyDemo("news");
            notifyDemo("announcements");
            notifyDemo("settings");
          }
        };
        window.setTimeout(function () {
          channel.postMessage({ type: "snapshot-request" });
        }, 180);
      }
    } catch (error) {
      console.warn("BroadcastChannel unavailable:", error);
    }
  }

  function cleanText(value, max) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }

  function cleanNews(data) {
    return {
      title: cleanText(data.title, 180),
      category: cleanText(data.category, 40) || "عام",
      summary: cleanText(data.summary, 500),
      body: cleanText(data.body, 8000),
      date: cleanText(data.date, 10) || new Date().toISOString().slice(0, 10),
      image: String(data.image || "").trim().slice(0, 4000000),
      pinned: Boolean(data.pinned)
    };
  }

  function cleanAnnouncement(data) {
    return {
      title: cleanText(data.title, 180),
      body: cleanText(data.body, 4000),
      date: cleanText(data.date, 10) || new Date().toISOString().slice(0, 10),
      link: cleanText(data.link, 600)
    };
  }

  function addNews(data) {
    var payload = cleanNews(data);
    if (mode === "cloud") {
      payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
      payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      return db.collection("news").add(payload).then(function (ref) { return ref.id; });
    }
    var item = payload;
    item.id = "news-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    item.createdAt = new Date().toISOString();
    item.updatedAt = item.createdAt;
    demoState.news.unshift(item);
    demoVersion += 1;
    broadcastState();
    emit("news", sortNews(demoState.news));
    return Promise.resolve(item.id);
  }

  function updateNews(id, data) {
    var payload = cleanNews(data);
    if (mode === "cloud") {
      payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      return db.collection("news").doc(id).update(payload);
    }
    var item = demoState.news.find(function (entry) { return entry.id === id; });
    if (!item) return Promise.reject(new Error("الخبر غير موجود"));
    Object.assign(item, payload, { updatedAt: new Date().toISOString() });
    demoVersion += 1;
    broadcastState();
    emit("news", sortNews(demoState.news));
    return Promise.resolve();
  }

  function deleteNews(id) {
    if (mode === "cloud") return db.collection("news").doc(id).delete();
    demoState.news = demoState.news.filter(function (entry) { return entry.id !== id; });
    demoVersion += 1;
    broadcastState();
    emit("news", sortNews(demoState.news));
    return Promise.resolve();
  }

  function addAnnouncement(data) {
    var payload = cleanAnnouncement(data);
    if (mode === "cloud") {
      payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
      payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      return db.collection("announcements").add(payload).then(function (ref) { return ref.id; });
    }
    var item = payload;
    item.id = "announcement-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    item.createdAt = new Date().toISOString();
    item.updatedAt = item.createdAt;
    demoState.announcements.unshift(item);
    demoVersion += 1;
    broadcastState();
    emit("announcements", sortAnnouncements(demoState.announcements));
    return Promise.resolve(item.id);
  }

  function updateAnnouncement(id, data) {
    var payload = cleanAnnouncement(data);
    if (mode === "cloud") {
      payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      return db.collection("announcements").doc(id).update(payload);
    }
    var item = demoState.announcements.find(function (entry) { return entry.id === id; });
    if (!item) return Promise.reject(new Error("الإعلان غير موجود"));
    Object.assign(item, payload, { updatedAt: new Date().toISOString() });
    demoVersion += 1;
    broadcastState();
    emit("announcements", sortAnnouncements(demoState.announcements));
    return Promise.resolve();
  }

  function deleteAnnouncement(id) {
    if (mode === "cloud") return db.collection("announcements").doc(id).delete();
    demoState.announcements = demoState.announcements.filter(function (entry) { return entry.id !== id; });
    demoVersion += 1;
    broadcastState();
    emit("announcements", sortAnnouncements(demoState.announcements));
    return Promise.resolve();
  }

  function cleanLibraryMeta(data) {
    return {
      title: cleanText(data.title, 180),
      description: cleanText(data.description, 1600),
      category: cleanText(data.category, 40)
    };
  }

  function saveLibraryMeta(driveId, data) {
    var id = cleanText(driveId, 200);
    if (!id) return Promise.reject(new Error("معرّف الملف مفقود"));
    var payload = cleanLibraryMeta(data);
    if (mode === "cloud") {
      var entry = Object.assign({ id: id }, payload, { updatedAt: new Date().toISOString() });
      var next = cloudCache.library.filter(function (item) { return item.id !== id; }).concat([entry]);
      return db.collection("settings").doc("site").set({
        library: next,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(function () {
        cloudCache.library = next;
        cloudCache.loaded.library = true;
        emit("library", next);
      });
    }
    var item = demoState.library.find(function (entry) { return entry.id === id; });
    if (item) {
      Object.assign(item, payload, { updatedAt: new Date().toISOString() });
    } else {
      demoState.library.push(Object.assign({ id: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, payload));
    }
    demoVersion += 1;
    broadcastState();
    emit("library", clone(demoState.library));
    return Promise.resolve();
  }

  function deleteLibraryMeta(driveIds) {
    var ids = (Array.isArray(driveIds) ? driveIds : [driveIds]).map(function (id) { return cleanText(id, 200); }).filter(Boolean);
    if (!ids.length) return Promise.resolve();
    var remove = {};
    ids.forEach(function (id) { remove[id] = true; });
    if (mode === "cloud") {
      if (!cloudCache.library.some(function (item) { return remove[item.id]; })) return Promise.resolve();
      var next = cloudCache.library.filter(function (item) { return !remove[item.id]; });
      cloudCache.library = next;
      return db.collection("settings").doc("site").set({
        library: next,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(function () {
        emit("library", next);
      });
    }
    demoState.library = demoState.library.filter(function (entry) { return !remove[entry.id]; });
    demoVersion += 1;
    broadcastState();
    emit("library", clone(demoState.library));
    return Promise.resolve();
  }

  function saveSettings(patch) {
    var allowed = ["instagram", "twitter", "libraryDrive", "driveClientId"];
    var payload = {};
    allowed.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) payload[key] = cleanText(patch[key], 600);
    });
    if (mode === "cloud") {
      payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      return db.collection("settings").doc("site").set(payload, { merge: true });
    }
    Object.assign(demoState.settings, payload);
    demoVersion += 1;
    broadcastState();
    emit("settings", Object.assign({}, demoState.settings));
    return Promise.resolve();
  }

  function subscribeStatus(callback) {
    listeners.status.add(callback);
    callback(getStatus());
    return function () { listeners.status.delete(callback); };
  }

  function getSeedContent() {
    return { news: clone(seedNews), announcements: clone(seedAnnouncements) };
  }

  window.FarooqStore = {
    mode: mode,
    subscribeNews: function (callback) { return subscribe("news", callback); },
    subscribeAnnouncements: function (callback) { return subscribe("announcements", callback); },
    subscribeLibrary: function (callback) { return subscribe("library", callback); },
    subscribeSettings: function (callback) { return subscribe("settings", callback); },
    subscribeStatus: subscribeStatus,
    getStatus: getStatus,
    subscribeAuth: subscribeAuth,
    getAuthState: getAuthState,
    signIn: signIn,
    signOutAdmin: signOutAdmin,
    getSeedContent: getSeedContent,
    addNews: addNews,
    updateNews: updateNews,
    deleteNews: deleteNews,
    addAnnouncement: addAnnouncement,
    updateAnnouncement: updateAnnouncement,
    deleteAnnouncement: deleteAnnouncement,
    saveLibraryMeta: saveLibraryMeta,
    deleteLibraryMeta: deleteLibraryMeta,
    saveSettings: saveSettings
  };
})();
