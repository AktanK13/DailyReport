import { useEffect, useRef, useState } from "react";

const todayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

// Возвращает дату следующей зарплаты с учётом правил:
// базовая дата 20-е число месяца;
// если 20-е в субботу — 19-е, если в воскресенье — 21-е.
const getNextSalaryDate = (fromDate = new Date()) => {
  const base = new Date(fromDate);
  const year = base.getFullYear();
  const month = base.getMonth();

  const adjustSalaryDate = (y, m) => {
    const d = new Date(y, m, 20);
    const wd = d.getDay(); // 0 - вс, 6 - сб
    if (wd === 6) d.setDate(19);
    else if (wd === 0) d.setDate(21);
    return d;
  };

  let candidate = adjustSalaryDate(year, month);
  if (candidate < fromDate) {
    candidate = adjustSalaryDate(year, month + 1);
  }
  return candidate;
};

// Аванс: 5‑й рабочий день месяца (пн‑пт), считаем от 1 числа.
const getNextAdvanceDate = (fromDate = new Date()) => {
  const base = new Date(fromDate);
  const year = base.getFullYear();
  const month = base.getMonth();

  const findAdvance = (y, m) => {
    let d = new Date(y, m, 1);
    let workDays = 0;
    while (true) {
      const wd = d.getDay(); // 0 - вс, 6 - сб
      if (wd !== 0 && wd !== 6) {
        workDays += 1;
        if (workDays === 5) return d;
      }
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  };

  let candidate = findAdvance(year, month);
  if (candidate < fromDate) {
    candidate = findAdvance(year, month + 1);
  }
  return candidate;
};

const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "https://mega-daily-report-bot.onrender.com";

const STORAGE_KEY = "daily_report_fields";
const HISTORY_KEY = "daily_report_history";

const withTaskIndent = (text) => {
  if (!text) return text;
  return text.replace(/\n-/g, "\n -");
};

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function transformReportToHtml(text) {
  const lines = text.split("\n");
  const htmlLines = lines.map((line) => {
    const match = line.match(
      /^(?<indent>\s*(?:-\s*)?)\(\s*(?<tag>[^=]*?)\s*=\s*(?<url>[^)]+)\)\s*$/,
    );
    if (match && match.groups) {
      const { indent, tag, url } = match.groups;
      const tagText = `(${tag.trim()})`;
      const safeUrl = escapeHtml(url.trim());
      const safeTag = escapeHtml(tagText);
      return `${escapeHtml(indent)}<a href="${safeUrl}">${safeTag}</a>`;
    }
    return escapeHtml(line);
  });
  return htmlLines.join("\n");
}

function parseReportText(text) {
  if (!text) {
    return {
      reportDate: todayStr(),
      done: "",
      todo: "",
      problems: "",
    };
  }

  const lines = text.split("\n");
  let reportDateParsed = todayStr();

  const dateLine = lines.find((l) => l.startsWith("#Отчет_"));
  if (dateLine) {
    reportDateParsed = dateLine.replace("#Отчет_", "").trim() || todayStr();
  }

  const findIndex = (label) => lines.findIndex((l) => l.startsWith(label));

  const idxDone = findIndex("- Что делал ?");
  const idxTodo = findIndex("- Что буду делать ?");
  const idxProblems = findIndex("- Какие проблемы?");

  const sliceSection = (startIdx, endIdx) => {
    if (startIdx === -1) return "";
    const from = startIdx + 1;
    const to = endIdx === -1 ? lines.length : endIdx;
    const block = lines.slice(from, to).join("\n");
    return block.replace(/^\s+/gm, "").trim();
  };

  let done = sliceSection(idxDone, idxTodo);
  let todo = sliceSection(idxTodo, idxProblems);
  let problems = sliceSection(idxProblems, -1);

  if (done === "(не указано)") done = "";
  if (todo === "(не указано)") todo = "";
  if (problems === "нет проблем") problems = "";

  return {
    reportDate: reportDateParsed,
    done,
    todo,
    problems,
  };
}

async function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveCurrent(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    console.error("Error saving current data to localStorage");
  }
}

function normalizeIsoDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return dateStr;
  // формат DD.MM.YYYY → YYYY-MM-DD
  const dotMatch = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotMatch) {
    const [, dd, mm, yyyy] = dotMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  return dateStr;
}

export default function ReportApp() {
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [done, setDone] = useState("");
  const [todo, setTodo] = useState("");
  const [problems, setProblems] = useState("");
  const [reportDate, setReportDate] = useState(todayStr());
  const [activeField, setActiveField] = useState(null);
  const [customTags, setCustomTags] = useState([]);
  const [hiddenTags, setHiddenTags] = useState([]);
  const [copied, setCopied] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [historyCopied, setHistoryCopied] = useState(false);
  const [showDeleteHistoryModal, setShowDeleteHistoryModal] = useState(false);
  const [isTelegramLinked, setIsTelegramLinked] = useState(false);
  const [linkTgLoading, setLinkTgLoading] = useState(false);
  const [linkTgError, setLinkTgError] = useState(null);
  const textareasRef = useRef({});
  const avatarFileInputRef = useRef(null);
  const settingsFileInputRef = useRef(null);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [addTagInputValue, setAddTagInputValue] = useState("");
  const addTagInputRef = useRef(null);
  const USER_ID = "local-user"; // пока один пользователь, фиксированный id

  useEffect(() => {
    loadSaved().then((data) => {
      if (data) {
        setProfileName(data.profileName || "");
        setProfileAvatar(data.profileAvatar || "");
        setDone(data.done || "");
        setTodo(data.todo || "");
        setProblems(data.problems || "");
        if (data.date && data.date !== todayStr()) {
          setReportDate(todayStr());
        } else {
          setReportDate(data.reportDate || todayStr());
        }
        setCustomTags(data.customTags || []);
      }

      try {
        const rawHistory = localStorage.getItem(HISTORY_KEY);
        const parsed = rawHistory ? JSON.parse(rawHistory) : [];
        const normalized = (parsed || []).map((h) => ({
          ...h,
          reportDate: normalizeIsoDate(h.reportDate),
        }));
        setHistory(normalized);
        if (normalized && normalized.length > 0) {
          setSelectedHistory(normalized[0]);
        }
      } catch {
        setHistory([]);
      }

      try {
        const linked = localStorage.getItem("telegram_linked");
        setIsTelegramLinked(linked === "1");
      } catch {
        setIsTelegramLinked(false);
      }

      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveCurrent({
      profileName,
      profileAvatar,
      done,
      todo,
      problems,
      reportDate,
      customTags,
      hiddenTags,
      date: todayStr(),
    });
  }, [
    profileName,
    profileAvatar,
    done,
    todo,
    problems,
    reportDate,
    customTags,
    hiddenTags,
    loaded,
  ]);

  // синхронизация высоты полей с содержимым при загрузке/восстановлении
  useEffect(() => {
    if (!loaded) return;
    ["done", "todo", "problems"].forEach((id) => {
      const el = textareasRef.current[id];
      if (el) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    });
  }, [loaded, done, todo, problems]);

  const generateReport = () => {
    return `/done
#Отчет_${reportDate}

- Что делал ?
 ${withTaskIndent(done) || "(не указано)"}

- Что буду делать ?
 ${withTaskIndent(todo) || "(не указано)"}

- Какие проблемы?
 ${withTaskIndent(problems) || "нет проблем"}`;
  };

  const handleCopy = () => {
    const plain = generateReport();
    const html = transformReportToHtml(plain);
    const htmlBlob = new Blob([html], { type: "text/html" });
    const plainBlob = new Blob([plain], { type: "text/plain" });

    navigator.clipboard
      .write([
        new ClipboardItem({ "text/html": htmlBlob, "text/plain": plainBlob }),
      ])
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => {
        navigator.clipboard.writeText(plain).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        });
      });
  };

  const handleSendToTelegram = async () => {
    if (sending) return;
    setSending(true);
    setSendStatus(null);
    try {
      const text = generateReport();

      // 1) Отправка через Netlify-функцию в рабочий чат (как раньше)
      const resp = await fetch("/.netlify/functions/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json().catch(() => ({}));
      if (data && data.error && !data.ok) {
        throw new Error("Telegram API error");
      }

      // 2) Отправка отчёта в твой бот на Render для сохранения в БД
      try {
        await fetch(`${API_BASE}/api/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: USER_ID,
            text,
            date: reportDate,
          }),
        });
      } catch (e) {
        // не ломаем основной флоу, просто логируем
        console.error("Error sending report to bot API", e);
      }

      setSendStatus("ok");
      setTimeout(() => setSendStatus(null), 3000);
    } catch (e) {
      console.error("Error sending to Telegram", e);
      setSendStatus("error");
      setTimeout(() => setSendStatus(null), 4000);
    } finally {
      setSending(false);
    }
  };

  const handleSaveReportToHistory = () => {
    const text = generateReport();
    try {
      const entry = {
        reportDate,
        text,
        savedAt: new Date().toISOString(),
      };
      let list = history || [];
      list = Array.isArray(list) ? list : [];
      list = list.filter((h) => h.reportDate !== reportDate);
      list.push(entry);
      list.sort((a, b) => (a.reportDate > b.reportDate ? -1 : 1));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      setHistory(list);
      setSelectedHistory(entry);
    } catch (e) {
      console.error("Error saving history", e);
    }
  };

  const handleImportHistoryToCurrent = () => {
    if (!selectedHistory) return;
    const parsed = parseReportText(selectedHistory.text);
    setReportDate(parsed.reportDate);
    setDone(parsed.done);
    setTodo(parsed.todo);
    setProblems(parsed.problems);
  };

  const handleClear = () => {
    setDone("");
    setTodo("");
    setProblems("");
    setReportDate(todayStr());
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  };

  const handleSettingsFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result || "{}");
        if (data.profileName !== undefined) setProfileName(data.profileName);
        if (data.profileAvatar !== undefined)
          setProfileAvatar(data.profileAvatar);
        if (data.done !== undefined) setDone(data.done);
        if (data.todo !== undefined) setTodo(data.todo);
        if (data.problems !== undefined) setProblems(data.problems);
        if (data.reportDate) setReportDate(data.reportDate);
        if (Array.isArray(data.customTags)) setCustomTags(data.customTags);
        if (Array.isArray(data.hiddenTags)) setHiddenTags(data.hiddenTags);
        if (Array.isArray(data.history)) {
          setHistory(data.history);
          try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(data.history));
          } catch (err) {
            console.error("Error saving imported history", err);
          }
          if (data.history.length > 0) {
            setSelectedHistory(data.history[0]);
          }
        }
        // Сохраняем текущие поля, чтобы восстановление работало как обычно
        saveCurrent({
          profileName: data.profileName ?? profileName,
          profileAvatar: data.profileAvatar ?? profileAvatar,
          done: data.done ?? done,
          todo: data.todo ?? todo,
          problems: data.problems ?? problems,
          reportDate: data.reportDate ?? reportDate,
          customTags: data.customTags ?? customTags,
          hiddenTags: data.hiddenTags ?? hiddenTags,
          date: todayStr(),
        });
      } catch (err) {
        console.error("Error importing settings", err);
      } finally {
        // сброс input, чтобы одно и то же имя файла можно было выбрать снова
        e.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const fields = [
    {
      id: "done",
      label: "✅ Что делал",
      value: done,
      set: setDone,
      placeholder: "Например: реализовал экран авторизации на Flutter...",
    },
    {
      id: "todo",
      label: "🔜 Что буду делать",
      value: todo,
      set: setTodo,
      placeholder: "Например: начну работу над Push-уведомлениями...",
    },
    {
      id: "problems",
      label: "⚠️ Какие проблемы",
      value: problems,
      set: setProblems,
      placeholder: "Нет проблем / опиши если есть...",
    },
  ];

  const baseTags = ["(jira = )", "(figma = )"];

  const appendTagToActiveField = (tag) => {
    if (!activeField) return;
    const textarea = textareasRef.current[activeField];
    if (!textarea) return;

    const currentValue = textarea.value ?? "";
    const start = textarea.selectionStart ?? currentValue.length;
    const end = textarea.selectionEnd ?? currentValue.length;

    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);

    const needsSpace = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const insert = `${needsSpace}${tag}`;

    const newValue = before + insert + after;

    if (activeField === "done") setDone(newValue);
    if (activeField === "todo") setTodo(newValue);
    if (activeField === "problems") setProblems(newValue);

    const newPos = before.length + insert.length;
    setTimeout(() => {
      const el = textareasRef.current[activeField];
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(newPos, newPos);
      } catch {
        // ignore
      }
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, 0);
  };

  const ADD_TAG_PLACEHOLDER = "(имя = )";
  const ADD_TAG_SELECT_START = 1;
  const ADD_TAG_SELECT_END = 4; // выделяем "имя"

  const openAddTagModal = () => {
    setAddTagInputValue(ADD_TAG_PLACEHOLDER);
    setShowAddTagModal(true);
  };

  useEffect(() => {
    if (!showAddTagModal || !addTagInputRef.current) return;
    const el = addTagInputRef.current;
    el.focus();
    el.setSelectionRange(ADD_TAG_SELECT_START, ADD_TAG_SELECT_END);
  }, [showAddTagModal]);

  const closeAddTagModal = () => {
    setShowAddTagModal(false);
    setAddTagInputValue("");
  };

  const submitAddTag = () => {
    const raw = addTagInputValue.trim();
    if (!raw) {
      closeAddTagModal();
      return;
    }

    let tag = raw;

    // Если пользователь использует опциональный формат "(имя = ...)",
    // нормализуем его в "(имя = )". Во всех остальных случаях оставляем как есть.
    const match = raw.match(/^\(\s*([^=]*?)\s*=\s*.*\)$/);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name) {
        tag = `(${name} = )`;
      }
    }

    setCustomTags((prev) => {
      if (prev.includes(tag) || baseTags.includes(tag)) return prev;
      return [...prev, tag];
    });
    closeAddTagModal();
  };

  const handleAvatarFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        fontFamily: "'Segoe UI', sans-serif",
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "stretch",
          justifyContent: "center",
          width: "100%",
          maxWidth: "1100px",
          flexWrap: "nowrap",
        }}
      >
        {/* Основная карточка отчёта */}
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(20px)",
            borderRadius: "24px",
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "36px",
            maxWidth: "800px",
            width: "100%",
            boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            {/* Row 1: профиль + кнопка подключения TG справа */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "32px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  title="Изменить аватар"
                  style={{
                    padding: 0,
                    margin: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      background: profileAvatar?.trim()
                        ? "transparent"
                        : "linear-gradient(135deg, #2AABEE, #229ED9)",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      color: "#fff",
                      flexShrink: 0,
                      border: "1px solid rgba(255,255,255,0.25)",
                    }}
                  >
                    {profileAvatar?.trim() ? (
                      <img
                        src={profileAvatar}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      (profileName || "DR")
                        .trim()
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)
                    )}
                  </div>
                </button>
                <div>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Твоё имя"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "32px",
                      outline: "none",
                      padding: 0,
                      margin: 0,
                      width: "200px",
                    }}
                  />
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    style={{ display: "none" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <button
                  type="button"
                  disabled={linkTgLoading}
                  onClick={async () => {
                    setLinkTgError(null);
                    setLinkTgLoading(true);
                    try {
                      const res = await fetch(`${API_BASE}/api/link-tg`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: USER_ID }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        setLinkTgError(data?.message || data?.error || `Ошибка ${res.status}`);
                        return;
                      }
                      const url = data.botLink ?? data.link;
                      if (url) {
                        try {
                          localStorage.setItem("telegram_linked", "1");
                          setIsTelegramLinked(true);
                        } catch {
                          setIsTelegramLinked(true);
                        }
                        window.location.href = url;
                      } else {
                        setLinkTgError("Сервер не вернул ссылку на бота");
                      }
                    } catch (e) {
                      console.error("Error linking Telegram", e);
                      setLinkTgError("Не удалось подключиться. Проверь интернет или открой консоль (F12).");
                    } finally {
                      setLinkTgLoading(false);
                    }
                  }}
                  style={{
                    borderRadius: "999px",
                    border: isTelegramLinked
                      ? "1px solid rgba(80,200,120,0.8)"
                      : "1px solid rgba(42,171,238,0.7)",
                    background: isTelegramLinked
                      ? "rgba(80,200,120,0.18)"
                      : "rgba(42,171,238,0.16)",
                    color: isTelegramLinked
                      ? "rgba(220,255,230,0.95)"
                      : "#e3f5ff",
                    fontSize: "12px",
                    padding: "8px 12px",
                    cursor: linkTgLoading ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    whiteSpace: "nowrap",
                    opacity: linkTgLoading ? 0.8 : 1,
                  }}
                >
                  <span style={{ fontSize: "16px" }}>🤖</span>
                  <span>
                    {linkTgLoading
                      ? "Загрузка…"
                      : isTelegramLinked
                        ? "TG подключён"
                        : "Подключить Telegram"}
                  </span>
                </button>
                {linkTgError && (
                  <span style={{ fontSize: "11px", color: "#ff6b6b", maxWidth: "220px", textAlign: "right" }}>
                    {linkTgError}
                  </span>
                )}
              </div>
            </div>

            {/* Row 2: Ежедневный отчёт + кнопка очистки */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <div
                  style={{ color: "#fff", fontWeight: "700", fontSize: "22px" }}
                >
                  Ежедневный отчёт
                </div>
                <div
                  style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px" }}
                >
                  📅{" "}
                  <input
                    type="date"
                    value={(() => {
                      const [d, m, y] = reportDate.split(".");
                      return `${y}-${m}-${d}`;
                    })()}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setReportDate(todayStr());
                        return;
                      }
                      const [y, m, d] = e.target.value.split("-");
                      setReportDate(
                        `${String(d).padStart(2, "0")}.${String(m).padStart(
                          2,
                          "0",
                        )}.${y}`,
                      );
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "rgba(255,255,255,0.75)",
                      fontSize: "13px",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleClear}
                style={{
                  background: cleared
                    ? "rgba(255,100,100,0.25)"
                    : "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "10px",
                  color: cleared ? "#ff6b6b" : "rgba(255,255,255,0.5)",
                  fontSize: "13px",
                  fontWeight: "600",
                  padding: "8px 14px",
                  cursor: "pointer",
                  transition: "all 0.25s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!cleared) {
                    e.currentTarget.style.background = "rgba(255,80,80,0.15)";
                    e.currentTarget.style.color = "#ff6b6b";
                    e.currentTarget.style.borderColor = "rgba(255,80,80,0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!cleared) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                    e.currentTarget.style.borderColor =
                      "rgba(255,255,255,0.12)";
                  }
                }}
              >
                {cleared ? "✓ Очищено" : "🗑 Очистить все"}
              </button>
            </div>
          </div>

          {/* Banner: loaded from previous day */}
          
          {/* Fields */}
          {fields.map(({ id, label, value, set, placeholder }) => {
            const linesCount = value ? value.split("\n").length : 0;
            const charsCount = value.length;

            return (
              <div key={id} style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "13px",
                    fontWeight: "600",
                    marginBottom: "8px",
                  }}
                >
                  {label}
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    gap: "8px",
                  }}
                >
                  <textarea
                    ref={(el) => {
                      if (el) {
                        textareasRef.current[id] = el;
                        el.style.height = "auto";
                        el.style.height = `${el.scrollHeight}px`;
                      }
                    }}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    onFocus={(e) => {
                      setActiveField(id);
                      e.target.style.borderColor = "rgba(42,171,238,0.6)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255,255,255,0.12)";
                    }}
                    placeholder={placeholder}
                    rows={3}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "12px",
                      padding: "12px 14px",
                      color: "#fff",
                      fontSize: "14px",
                      resize: "none",
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      lineHeight: "1.5",
                      transition: "border 0.2s",
                      minHeight: "72px",
                    }}
                    onInput={(e) => {
                      e.target.style.height = "auto";
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => set("")}
                    title="Очистить это поле"
                    style={{
                      width: "40px",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.6)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      padding: 0,
                      transition:
                        "background 0.2s, border-color 0.2s, color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,80,80,0.16)";
                      e.currentTarget.style.borderColor = "rgba(255,80,80,0.4)";
                      e.currentTarget.style.color = "#ff6b6b";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.04)";
                      e.currentTarget.style.borderColor =
                        "rgba(255,255,255,0.12)";
                      e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                    }}
                  >
                    🗑
                  </button>
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.35)",
                  }}
                >
                  {linesCount} строк · {charsCount} символов
                </div>
              </div>
            );
          })}

          {/* Quick tags */}
          <div
            style={{
              marginBottom: "24px",
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.5)",
                marginRight: "6px",
              }}
            >
              Быстрые теги:
            </span>
            {[...baseTags, ...customTags]
              .filter((tag) => !hiddenTags.includes(tag))
              .map((tag) => (
                <div
                  key={tag}
                  className="tag-chip"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => appendTagToActiveField(tag)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.85)",
                      fontSize: "12px",
                      padding: "5px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {tag}
                  </button>
                  <button
                    type="button"
                    className="tag-delete"
                    onClick={() => {
                      setHiddenTags((prev) =>
                        prev.includes(tag) ? prev : [...prev, tag],
                      );
                      setCustomTags((prev) => prev.filter((t) => t !== tag));
                    }}
                    title="Удалить тег"
                    style={{
                      border: "none",
                      background: "rgba(255,80,80,0.18)",
                      color: "#ff6b6b",
                      fontSize: "11px",
                      padding: "5px 7px",
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            <button
              type="button"
              onClick={openAddTagModal}
              style={{
                borderRadius: "999px",
                border: "1px dashed rgba(255,255,255,0.3)",
                background: "transparent",
                color: "rgba(255,255,255,0.6)",
                fontSize: "14px",
                padding: "2px 8px",
                cursor: "pointer",
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "24px",
                minHeight: "24px",
              }}
            >
              +
            </button>
          </div>

          {/* Preview */}
          <div
            style={{
              background: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
              padding: "14px 16px",
              marginBottom: "20px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: "11px",
                marginBottom: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Предпросмотр
            </div>
            <pre
              style={{
                color: "rgba(255,255,255,0.75)",
                fontSize: "13px",
                margin: 0,
                whiteSpace: "pre-wrap",
                lineHeight: "1.6",
                fontFamily: "monospace",
              }}
            >
              {generateReport()}
            </pre>
          </div>

          {/* Copy, Send & Save buttons */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "8px",
              alignItems: "stretch",
            }}
          >
            {/* Большая кнопка \"Скопировать\" */}
            <button
              type="button"
              onClick={handleCopy}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: copied
                  ? "1px solid rgba(80,200,120,0.7)"
                  : "1px solid rgba(255,255,255,0.18)",
                background: copied
                  ? "rgba(80,200,120,0.25)"
                  : "rgba(255,255,255,0.06)",
                color: copied ? "rgba(230,255,235,0.95)" : "#fff",
                fontWeight: "700",
                fontSize: "16px",
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: "0 4px 20px rgba(42,171,238,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "✓ Скопировано" : "📋 Скопировать отчёт"}
            </button>

            {/* Справа две маленькие кнопки */}
            <button
              type="button"
              onClick={isTelegramLinked ? handleSendToTelegram : undefined}
              disabled={sending || !isTelegramLinked}
              style={{
                padding: "10px 12px",
                borderRadius: "14px",
                border: isTelegramLinked
                  ? "1px solid rgba(42,171,238,0.6)"
                  : "1px solid rgba(255,255,255,0.15)",
                background: sending
                  ? "rgba(42,171,238,0.18)"
                  : isTelegramLinked
                    ? "rgba(42,171,238,0.24)"
                    : "rgba(255,255,255,0.04)",
                color: isTelegramLinked ? "#e3f5ff" : "rgba(255,255,255,0.4)",
                fontWeight: "600",
                fontSize: "13px",
                cursor:
                  sending || !isTelegramLinked ? "default" : "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                minWidth: "130px",
              }}
            >
              {sending
                ? "⏳"
                : isTelegramLinked
                  ? "✈️ Отправить в Telegram"
                  : "✈️ Подключи TG"}
            </button>
            <button
              type="button"
              onClick={handleSaveReportToHistory}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
              }}
              style={{
                padding: "10px 12px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.85)",
                fontWeight: "600",
                fontSize: "13px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              💾 Сохранить отчёт
            </button>
          </div>
          {sendStatus === "ok" && (
            <div
              style={{
                textAlign: "center",
                color: "rgba(0, 230, 118, 0.9)",
                fontSize: "12px",
                marginBottom: "8px",
              }}
            >
              Отчёт отправлен в Telegram
            </div>
          )}
          {sendStatus === "error" && (
            <div
              style={{
                textAlign: "center",
                color: "rgba(255, 82, 82, 0.9)",
                fontSize: "12px",
                marginBottom: "8px",
              }}
            >
              Не удалось отправить в Telegram
            </div>
          )}

          {/* History */}
          <div
            style={{
              marginTop: "20px",
              paddingTop: "18px",
              borderTop: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.95)",
                marginBottom: "2px",
                fontWeight: 700,
                letterSpacing: "0.3px",
              }}
            >
              📋 История отчётов
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.5)",
                marginBottom: "14px",
                lineHeight: 1.4,
              }}
            >
              Выбери дату — откроется сохранённый отчёт. Можно скопировать или удалить.
            </div>
            {history && history.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  gap: "14px",
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    width: "160px",
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    maxHeight: "240px",
                    overflowY: "auto",
                    paddingRight: "4px",
                  }}
                >
                  {history.map((item) => {
                    const isSelected =
                      selectedHistory &&
                      selectedHistory.reportDate === item.reportDate;
                    return (
                      <button
                        key={item.reportDate}
                        type="button"
                        onClick={() => setSelectedHistory(item)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          borderRadius: "12px",
                          border: isSelected
                            ? "1px solid rgba(42,171,238,0.7)"
                            : "1px solid rgba(255,255,255,0.12)",
                          background: isSelected
                            ? "rgba(42,171,238,0.18)"
                            : "rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.95)",
                          fontSize: "13px",
                          padding: "8px 12px",
                          cursor: "pointer",
                          transition: "background 0.2s, border-color 0.2s",
                          fontWeight: isSelected ? 600 : 500,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background =
                              "rgba(255,255,255,0.08)";
                            e.currentTarget.style.borderColor =
                              "rgba(255,255,255,0.2)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background =
                              "rgba(255,255,255,0.04)";
                            e.currentTarget.style.borderColor =
                              "rgba(255,255,255,0.12)";
                          }
                        }}
                      >
                        📅 {item.reportDate}
                      </button>
                    );
                  })}
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {selectedHistory && (
                    <div
                      style={{
                        background: "rgba(0,0,0,0.35)",
                        borderRadius: "14px",
                        padding: "16px 18px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "12px",
                          paddingBottom: "10px",
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "13px",
                            color: "rgba(255,255,255,0.9)",
                            fontWeight: 600,
                          }}
                        >
                          Отчёт от {selectedHistory.reportDate}
                        </span>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                navigator.clipboard.writeText(
                                  selectedHistory.text,
                                );
                                setHistoryCopied(true);
                                setTimeout(() => setHistoryCopied(false), 1500);
                              } catch (e) {
                                console.error(
                                  "Error copying selected history entry",
                                  e,
                                );
                              }
                            }}
                            style={{
                              borderRadius: "10px",
                              border: historyCopied
                                ? "1px solid rgba(80,200,120,0.7)"
                                : "1px solid rgba(255,255,255,0.2)",
                              background: historyCopied
                                ? "rgba(80,200,120,0.25)"
                                : "rgba(255,255,255,0.1)",
                              color: historyCopied
                                ? "rgba(230,255,235,0.95)"
                                : "rgba(255,255,255,0.95)",
                              fontSize: "12px",
                              padding: "6px 12px",
                              cursor: "pointer",
                              fontWeight: 500,
                            }}
                          >
                            {historyCopied ? "✓ Скопировано" : "📋 Копировать"}
                          </button>
                          <button
                            type="button"
                            onClick={handleImportHistoryToCurrent}
                            style={{
                              borderRadius: "10px",
                              border: "1px solid rgba(42,171,238,0.5)",
                              background: "rgba(42,171,238,0.12)",
                              color: "#2AABEE",
                              fontSize: "12px",
                              padding: "6px 12px",
                              cursor: "pointer",
                              fontWeight: 500,
                            }}
                          >
                            ⬅ Импорт в текущий
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowDeleteHistoryModal(true);
                            }}
                            style={{
                              borderRadius: "10px",
                              border: "1px solid rgba(255,80,80,0.5)",
                              background: "rgba(255,80,80,0.12)",
                              color: "#ff6b6b",
                              fontSize: "12px",
                              padding: "6px 12px",
                              cursor: "pointer",
                              fontWeight: 500,
                            }}
                          >
                            🗑 Удалить
                          </button>
                        </div>
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          fontSize: "13px",
                          color: "rgba(255,255,255,0.9)",
                          fontFamily: "'SF Mono', 'Consolas', monospace",
                          lineHeight: "1.6",
                          maxHeight: "220px",
                          overflowY: "auto",
                          paddingRight: "4px",
                        }}
                      >
                        {selectedHistory.text}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.4)",
                  padding: "20px",
                  textAlign: "center",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "12px",
                  border: "1px dashed rgba(255,255,255,0.1)",
                }}
              >
                Пока нет сохранённых отчётов. Нажми «Сохранить отчёт», чтобы добавить.
              </div>
            )}
          </div>

        </div>
        {/* Модальное окно добавления тега */}
        {showAddTagModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
            }}
            onClick={closeAddTagModal}
          >
            <div
              style={{
                background: "rgba(20,25,40,0.98)",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "20px 24px",
                minWidth: "320px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.9)",
                  marginBottom: "12px",
                }}
              >
                Новый тег
              </div>
              <input
                ref={addTagInputRef}
                type="text"
                value={addTagInputValue}
                onChange={(e) => setAddTagInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitAddTag();
                  if (e.key === "Escape") closeAddTagModal();
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontSize: "14px",
                  outline: "none",
                  marginBottom: "14px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={closeAddTagModal}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.85)",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={submitAddTag}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "10px",
                    border: "none",
                    background: "linear-gradient(135deg, #2AABEE, #229ED9)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Добавить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Модалка подтверждения удаления отчёта из истории */}
        {showDeleteHistoryModal && selectedHistory && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10001,
            }}
            onClick={() => setShowDeleteHistoryModal(false)}
          >
            <div
              style={{
                background: "rgba(15,20,35,0.98)",
                borderRadius: "18px",
                border: "1px solid rgba(255,80,80,0.5)",
                padding: "20px 22px",
                minWidth: "320px",
                maxWidth: "420px",
                boxShadow: "0 22px 50px rgba(0,0,0,0.7)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.92)",
                  marginBottom: "8px",
                }}
              >
                Удалить отчёт?
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: "14px",
                  lineHeight: 1.5,
                }}
              >
                Ты удаляешь сохранённый отчёт от{" "}
                <span style={{ color: "#ff6b6b", fontWeight: 600 }}>
                  {selectedHistory.reportDate}
                </span>
                . Отменить это действие будет нельзя.
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowDeleteHistoryModal(false)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.35)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.9)",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = (history || []).filter(
                      (h) => h.reportDate !== selectedHistory.reportDate,
                    );
                    setHistory(updated);
                    try {
                      localStorage.setItem(
                        HISTORY_KEY,
                        JSON.stringify(updated),
                      );
                    } catch (e) {
                      console.error("Error updating history store", e);
                    }
                    if (
                      updated.length > 0 &&
                      selectedHistory &&
                      updated.some(
                        (h) => h.reportDate === selectedHistory.reportDate,
                      )
                    ) {
                      setSelectedHistory(updated[0]);
                    } else {
                      setSelectedHistory(updated[0] || null);
                    }
                    setShowDeleteHistoryModal(false);
                  }}
                  style={{
                    padding: "7px 16px",
                    borderRadius: "999px",
                    border: "none",
                    background: "linear-gradient(135deg, #ff6b6b, #ff4757)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Да, удалить
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            width: "260px",
            flexShrink: 0,
          }}
        >
          {(() => {
          const now = new Date();
          const salary = getNextSalaryDate(now);
          const advance = getNextAdvanceDate(now);

          const daysDiff = (target) =>
            Math.ceil(
              (target.setHours(0, 0, 0, 0) -
                new Date(
                  now.getFullYear(),
                  now.getMonth(),
                  now.getDate(),
                ).setHours(0, 0, 0, 0)) /
                (1000 * 60 * 60 * 24),
            );

          const salaryDays = daysDiff(new Date(salary));
          const advanceDays = daysDiff(new Date(advance));

          const fmt = (d) =>
            `${String(d.getDate()).padStart(2, "0")}.${String(
              d.getMonth() + 1,
            ).padStart(2, "0")}.${d.getFullYear()}`;

          const daysText = (n) =>
            n === 0
              ? "сегодня"
              : n === 1
                ? "через 1 день"
                : `через ${n} дней`;

          // Стата по отчётам за месяц
          const historyDates = new Set(
            (history || []).map((h) => h.reportDate).filter(Boolean),
          );
          const today = new Date();
          const ym = `${today.getFullYear()}-${String(
            today.getMonth() + 1,
          ).padStart(2, "0")}`;
          const monthCount = (history || []).filter(
            (h) => h.reportDate && h.reportDate.startsWith(ym),
          ).length;

          let streak = 0;
          for (;;) {
            const d = new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate() - streak,
            );
            const iso = d.toISOString().slice(0, 10);
            if (historyDates.has(iso)) {
              streak += 1;
            } else {
              break;
            }
          }

          return (
            <>
              {/* Карточка обратного отсчёта до ЗП / аванса */}
              <div
                style={{
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: "20px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "18px 18px",
                  width: "260px",
                  boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginBottom: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  До денег
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: "14px",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "rgba(255,255,255,0.8)",
                      }}
                    >
                      💰 Аванс
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      {fmt(salary)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#fff",
                    }}
                  >
                    {daysText(salaryDays)}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "14px",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    border: "1px dashed rgba(255,255,255,0.12)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "rgba(255,255,255,0.75)",
                      }}
                    >
                      💵 Зарплата
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      {fmt(advance)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.92)",
                    }}
                  >
                    {daysText(advanceDays)}
                  </div>
                </div>
              </div>

              {/* Стата за месяц */}
              <div
                style={{
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: "20px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "14px 16px",
                  width: "260px",
                  boxShadow: "0 14px 32px rgba(0,0,0,0.45)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  marginBottom: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                    color: "rgba(255,255,255,0.65)",
                    marginBottom: "4px",
                  }}
                >
                  Стата за месяц
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.78)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <div>
                    📆 Отчётов в этом месяце:{" "}
                    <span style={{ fontWeight: 600 }}>{monthCount}</span>
                  </div>
                  <div>
                    🔥 Дней подряд с отчётами:{" "}
                    <span style={{ fontWeight: 600 }}>{streak}</span>
                  </div>
                </div>
              </div>

              {/* Экспорт / импорт настроек */}
              <div
                style={{
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: "20px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "12px 14px",
                  width: "260px",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  fontSize: "11px",
                }}
              >
                <div
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    marginBottom: "2px",
                  }}
                >
                  Экспорт / импорт настроек
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    justifyContent: "space-between",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const payload = {
                        profileName,
                        profileAvatar,
                        customTags,
                        hiddenTags,
                        done,
                        todo,
                        problems,
                        reportDate,
                        history,
                      };
                      try {
                        const blob = new Blob(
                          [JSON.stringify(payload, null, 2)],
                          {
                            type: "application/json",
                          },
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "daily-report-settings.json";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      } catch (e) {
                        console.error("Error exporting settings", e);
                      }
                    }}
                    style={{
                      flex: 1,
                      borderRadius: "999px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.9)",
                      padding: "6px 8px",
                      cursor: "pointer",
                      fontSize: "11px",
                    }}
                    title="Экспортирует профиль, теги, историю и текущие поля в JSON‑файл"
                  >
                    ⬆️ Экспорт
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (settingsFileInputRef.current) {
                        settingsFileInputRef.current.click();
                      }
                    }}
                    style={{
                      flex: 1,
                      borderRadius: "999px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.9)",
                      padding: "6px 8px",
                      cursor: "pointer",
                      fontSize: "11px",
                    }}
                    title="Импортирует профиль, теги, историю и текущие поля из JSON‑файла"
                  >
                    ⬇️ Импорт
                  </button>
                </div>
              </div>

              <input
                ref={settingsFileInputRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={handleSettingsFileChange}
              />
            </>
          );
        })()}
        </div>
      </div>
    </div>
  );
}
