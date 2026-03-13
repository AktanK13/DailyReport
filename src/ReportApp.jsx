import { useEffect, useState } from "react";

const todayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

const STORAGE_KEY = "daily_report_fields";
const HISTORY_KEY = "daily_report_history";

const withTaskIndent = (text) => {
  if (!text) return text;
  return text.replace(/\n-/g, "\n -");
};

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

export default function ReportApp() {
  const [done, setDone] = useState("");
  const [todo, setTodo] = useState("");
  const [problems, setProblems] = useState("");
  const [reportDate, setReportDate] = useState(todayStr());
  const [activeField, setActiveField] = useState(null);
  const [customTags, setCustomTags] = useState([]);
  const [hiddenTags, setHiddenTags] = useState([]);
  const [copied, setCopied] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lastSavedDate, setLastSavedDate] = useState(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);

  useEffect(() => {
    loadSaved().then((data) => {
      if (data) {
        setDone(data.done || "");
        setTodo(data.todo || "");
        setProblems(data.problems || "");
        // Если сохранённая дата из прошлого дня — начинаем с сегодняшней
        if (data.date && data.date !== todayStr()) {
          setReportDate(todayStr());
        } else {
          setReportDate(data.reportDate || todayStr());
        }
        setCustomTags(data.customTags || []);
        setLastSavedDate(data.date || null);
        if (data.date && data.date !== todayStr()) {
          setShowRestoreBanner(true);
        }
      }

      try {
        const rawHistory = localStorage.getItem(HISTORY_KEY);
        const parsed = rawHistory ? JSON.parse(rawHistory) : [];
        setHistory(parsed);
        if (parsed && parsed.length > 0) {
          setSelectedHistory(parsed[0]);
        }
      } catch {
        setHistory([]);
      }

      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveCurrent({
      done,
      todo,
      problems,
      reportDate,
      customTags,
      hiddenTags,
      date: todayStr(),
    });
  }, [done, todo, problems, reportDate, customTags, hiddenTags, loaded]);

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
    navigator.clipboard.writeText(generateReport()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
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

  const handleClear = () => {
    setDone("");
    setTodo("");
    setProblems("");
    setReportDate(todayStr());
    setCleared(true);
    setShowRestoreBanner(false);
    setTimeout(() => setCleared(false), 2000);
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

  const baseTags = ["(jira)", "(figma)"];

  const appendTagToActiveField = (tag) => {
    if (!activeField) return;
    const append = (prev) => (prev ? `${prev} ${tag}` : tag);
    if (activeField === "done") setDone(append);
    if (activeField === "todo") setTodo(append);
    if (activeField === "problems") setProblems(append);
  };

  const handleAddCustomTag = () => {
    const name = window.prompt("Введи название тега (без обязательной #):");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const tag = trimmed;
    setCustomTags((prev) => {
      if (prev.includes(tag) || baseTags.includes(tag)) return prev;
      return [...prev, tag];
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', sans-serif",
        padding: "20px",
      }}
    >
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
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #2AABEE, #229ED9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
              }}
            >
              ✈️
            </div>
            <div>
              <div
                style={{ color: "#fff", fontWeight: "700", fontSize: "18px" }}
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
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }
            }}
          >
            {cleared ? "✓ Очищено" : "🗑 Очистить все"}
          </button>
        </div>

        {/* Banner: loaded from previous day */}
        {showRestoreBanner && (
          <div
            style={{
              background: "rgba(42,171,238,0.12)",
              border: "1px solid rgba(42,171,238,0.3)",
              borderRadius: "12px",
              padding: "10px 14px",
              marginBottom: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "13px" }}>
              💾 Загружены поля с{" "}
              <span style={{ color: "#2AABEE", fontWeight: "600" }}>
                {lastSavedDate}
              </span>{" "}
              — отредактируй если нужно
            </div>
            <button
              onClick={() => setShowRestoreBanner(false)}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.3)",
                cursor: "pointer",
                fontSize: "18px",
                lineHeight: 1,
                padding: "0 2px",
              }}
            >
              ×
            </button>
          </div>
        )}

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
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
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
            onClick={handleAddCustomTag}
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

        {/* Copy & Save buttons */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: "14px",
              border: "none",
              background: copied
                ? "linear-gradient(135deg, #00b09b, #00c853)"
                : "linear-gradient(135deg, #2AABEE, #229ED9)",
              color: "#fff",
              fontWeight: "700",
              fontSize: "16px",
              cursor: "pointer",
              transition: "all 0.3s",
              boxShadow: "0 4px 20px rgba(42,171,238,0.35)",
            }}
          >
            {copied ? "✅ Скопировано!" : "📋 Скопировать отчёт"}
          </button>
          <button
            type="button"
            onClick={handleSaveReportToHistory}
            style={{
              padding: "14px 18px",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.85)",
              fontWeight: "600",
              fontSize: "14px",
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

        <div
          style={{
            textAlign: "center",
            color: "rgba(255,255,255,0.2)",
            fontSize: "12px",
            marginBottom: "10px",
          }}
        >
          Поля сохраняются автоматически · Вставь в Telegram Ctrl+V
        </div>

        {/* History */}
        <div
          style={{
            marginTop: "12px",
            paddingTop: "12px",
            borderTop: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.8)",
              marginBottom: "4px",
              fontWeight: 600,
            }}
          >
            История отчётов
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.45)",
              marginBottom: "8px",
            }}
          >
            Нажми на дату, чтобы посмотреть и скопировать сохранённый отчёт.
          </div>
          {history && history.length > 0 ? (
            <>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  marginBottom: "10px",
                }}
              >
                {history.map((item) => (
                  <button
                    key={item.reportDate}
                    type="button"
                    onClick={() => setSelectedHistory(item)}
                    style={{
                      borderRadius: "999px",
                      border:
                        selectedHistory &&
                        selectedHistory.reportDate === item.reportDate
                          ? "1px solid rgba(42,171,238,0.9)"
                          : "1px solid rgba(255,255,255,0.18)",
                      background:
                        selectedHistory &&
                        selectedHistory.reportDate === item.reportDate
                          ? "rgba(42,171,238,0.3)"
                          : "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.9)",
                      fontSize: "11px",
                      padding: "4px 12px",
                      cursor: "pointer",
                    }}
                  >
                    {item.reportDate}
                  </button>
                ))}
              </div>
              {selectedHistory && (
                <div
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.8)",
                      fontWeight: 500,
                    }}
                  >
                    <span>Отчёт от {selectedHistory.reportDate}</span>
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(selectedHistory.text);
                          } catch (e) {
                            console.error(
                              "Error copying selected history entry",
                              e,
                            );
                          }
                        }}
                        style={{
                          borderRadius: "999px",
                          border: "1px solid rgba(255,255,255,0.25)",
                          background: "rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.95)",
                          fontSize: "11px",
                          padding: "4px 10px",
                          cursor: "pointer",
                        }}
                      >
                        Копировать
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
                              (h) =>
                                h.reportDate === selectedHistory.reportDate,
                            )
                          ) {
                            setSelectedHistory(updated[0]);
                          } else {
                            setSelectedHistory(updated[0] || null);
                          }
                        }}
                        style={{
                          borderRadius: "999px",
                          border: "1px solid rgba(255,80,80,0.6)",
                          background: "rgba(255,80,80,0.12)",
                          color: "#ff6b6b",
                          fontSize: "11px",
                          padding: "4px 10px",
                          cursor: "pointer",
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.9)",
                      fontFamily: "monospace",
                      lineHeight: "1.5",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}
                  >
                    {selectedHistory.text}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.3)",
              }}
            >
              Пока нет сохранённых отчётов
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
