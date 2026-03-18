/* eslint-disable no-undef */
/* eslint-env node */

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Любая строка вида " ( имя_тега = url ) " → кликабельная ссылка с текстом "( имя_тега )"
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

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { text } = JSON.parse(event.body || "{}");

    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No text provided" }),
      };
    }

    const token = process.env.TG_BOT_TOKEN;
    const botChatId = process.env.TG_BOT_ID;

    if (!token || !botChatId) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "TG_BOT_TOKEN or TG_BOT_ID env var not set",
        }),
      };
    }

    const htmlText = transformReportToHtml(text);
    const tgApi = `https://api.telegram.org/bot${token}/sendMessage`;

    // Сообщение 1: форматированный отчёт со ссылками
    const resp1 = await fetch(tgApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: botChatId,
        text: htmlText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const data1 = await resp1.json();

    if (!data1.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Telegram API error", data: data1 }),
      };
    }

    // Сообщение 2: plain text — легко выделить и скопировать целиком
    const resp2 = await fetch(tgApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: botChatId,
        text: `📋 Скопируй текст ниже:\n\n${text}`,
        disable_web_page_preview: true,
      }),
    });

    const data2 = await resp2.json();

    if (!data2.ok) {
      // первое сообщение уже ушло — не фейлим весь запрос, просто логируем
      console.error("Telegram API error (plain msg)", data2);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", details: String(e) }),
    };
  }
};
