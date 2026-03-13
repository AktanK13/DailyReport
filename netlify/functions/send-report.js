/* eslint-disable no-undef */
/* eslint-env node */

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Превращаем строки вида
// "- (jira = https://...)" -> "- <a href="https://...">(jira)</a>"
// "- (figma = https://...)" -> "- <a href="https://...">(figma)</a>"
// Остальной текст просто HTML-экранируем
function transformReportToHtml(text) {
  const lines = text.split("\n");
  const htmlLines = lines.map((line) => {
    const jiraMatch =
      line.match(/^(?<indent>\s*-\s*)\(jira\s*=\s*(?<url>\S+)\s*\)\s*$/i);
    if (jiraMatch && jiraMatch.groups) {
      const { indent, url } = jiraMatch.groups;
      const safeUrl = escapeHtml(url);
      return `${escapeHtml(indent)}<a href="${safeUrl}">(jira)</a>`;
    }

    const figmaMatch =
      line.match(/^(?<indent>\s*-\s*)\(figma\s*=\s*(?<url>\S+)\s*\)\s*$/i);
    if (figmaMatch && figmaMatch.groups) {
      const { indent, url } = figmaMatch.groups;
      const safeUrl = escapeHtml(url);
      return `${escapeHtml(indent)}<a href="${safeUrl}">(figma)</a>`;
    }

    // Остальные строки просто экранируем
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
    const chatId = process.env.TG_CHAT_ID;

    if (!token || !chatId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Telegram env vars not set" }),
      };
    }

    const htmlText = transformReportToHtml(text);

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: "HTML",
      }),
    });

    const data = await resp.json();

    if (!data.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Telegram API error", data }),
      };
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
