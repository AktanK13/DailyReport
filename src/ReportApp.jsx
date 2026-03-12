import { useState, useEffect } from "react";

const todayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

const STORAGE_KEY = "daily_report_fields";

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
  const [copied, setCopied] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lastSavedDate, setLastSavedDate] = useState(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);

  useEffect(() => {
    loadSaved().then((data) => {
      if (data) {
        setDone(data.done || "");
        setTodo(data.todo || "");
        setProblems(data.problems || "");
        setLastSavedDate(data.date || null);
        if (data.date && data.date !== todayStr()) {
          setShowRestoreBanner(true);
        }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveCurrent({ done, todo, problems, date: todayStr() });
  }, [done, todo, problems, loaded]);

  const generateReport = () => {
    const date = todayStr();
    return `/done
#Отчет_${date}

- Что делал ?
  ${done || "(не указано)"}

- Что буду делать ?
  ${todo || "(не указано)"}

- Какие проблемы?
  ${problems || "нет проблем"}`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateReport()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleClear = () => {
    setDone("");
    setTodo("");
    setProblems("");
    setCleared(true);
    setShowRestoreBanner(false);
    setTimeout(() => setCleared(false), 2000);
  };

  const fields = [
    {
      label: "✅ Что делал",
      value: done,
      set: setDone,
      placeholder: "Например: реализовал экран авторизации на Flutter...",
    },
    {
      label: "🔜 Что буду делать",
      value: todo,
      set: setTodo,
      placeholder: "Например: начну работу над Push-уведомлениями...",
    },
    {
      label: "⚠️ Какие проблемы",
      value: problems,
      set: setProblems,
      placeholder: "Нет проблем / опиши если есть...",
    },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
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
          maxWidth: "640px",
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
              <div style={{ color: "#fff", fontWeight: "700", fontSize: "18px" }}>
                Ежедневный отчёт
              </div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
                📅 {todayStr()}
              </div>
            </div>
          </div>
          <button
            onClick={handleClear}
            style={{
              background: cleared ? "rgba(255,100,100,0.25)" : "rgba(255,255,255,0.07)",
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
            {cleared ? "✓ Очищено" : "🗑 Очистить"}
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
        {fields.map(({ label, value, set, placeholder }) => (
          <div key={label} style={{ marginBottom: "20px" }}>
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
            <textarea
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={placeholder}
              rows={3}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px",
                padding: "12px 14px",
                color: "#fff",
                fontSize: "14px",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                lineHeight: "1.5",
                transition: "border 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(42,171,238,0.6)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
            />
          </div>
        ))}

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

        {/* Copy button */}
        <button
          onClick={handleCopy}
          style={{
            width: "100%",
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

        <div
          style={{
            textAlign: "center",
            color: "rgba(255,255,255,0.2)",
            fontSize: "12px",
            marginTop: "14px",
          }}
        >
          💾 Поля сохраняются автоматически · Вставь в Telegram Ctrl+V
        </div>
      </div>
    </div>
  );
}
