import http from "node:http";

const port = Number(process.env.PORT ?? 9094);
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim() ?? "";

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const truncate = (value, maxLength) => {
  const text = String(value ?? "");
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
};

const alertColor = (status, severity) => {
  if (status === "resolved") return 0x2ecc71;
  if (severity === "critical") return 0xe74c3c;
  if (severity === "warning") return 0xf1c40f;
  return 0x3498db;
};

const alertTitle = (alert) => {
  const labels = alert.labels ?? {};
  return labels.alertname ?? alert.annotations?.summary ?? "KICE Arena alert";
};

const alertDescription = (alert) => {
  const annotations = alert.annotations ?? {};
  const labels = alert.labels ?? {};
  const parts = [
    annotations.summary,
    annotations.description,
    labels.severity ? `severity: ${labels.severity}` : "",
    labels.service ? `service: ${labels.service}` : ""
  ].filter(Boolean);
  return truncate(parts.join("\n"), 3900);
};

const makeDiscordPayload = (payload) => {
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  const firingCount = alerts.filter((alert) => alert.status === "firing").length;
  const resolvedCount = alerts.filter((alert) => alert.status === "resolved").length;
  const status = payload.status ?? (firingCount > 0 ? "firing" : "resolved");
  const service = payload.commonLabels?.service ?? "kice-arena";
  const group = payload.groupLabels?.alertname ?? payload.commonLabels?.alertname ?? "KICE Arena alerts";

  return {
    username: "KICE Arena Alertmanager",
    content: `**${service}** ${group}: ${firingCount} firing, ${resolvedCount} resolved`,
    embeds: alerts.slice(0, 10).map((alert) => ({
      title: truncate(alertTitle(alert), 256),
      description: alertDescription(alert),
      color: alertColor(alert.status ?? status, alert.labels?.severity),
      timestamp: alert.startsAt || new Date().toISOString(),
      fields: [
        alert.labels?.cause ? { name: "cause", value: truncate(alert.labels.cause, 1024), inline: true } : null,
        alert.labels?.severity ? { name: "severity", value: truncate(alert.labels.severity, 1024), inline: true } : null,
        alert.endsAt && alert.status === "resolved"
          ? { name: "resolvedAt", value: truncate(alert.endsAt, 1024), inline: false }
          : null
      ].filter(Boolean)
    }))
  };
};

const sendDiscord = async (payload) => {
  if (!discordWebhookUrl) return { skipped: true };

  const response = await fetch(discordWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeDiscordPayload(payload))
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook failed with ${response.status}: ${truncate(body, 500)}`);
  }

  return { skipped: false };
};

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, discordConfigured: Boolean(discordWebhookUrl) }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/alertmanager") {
    res.writeHead(404);
    res.end();
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const result = await sendDiscord(payload);
    res.writeHead(result.skipped ? 204 : 200);
    res.end();
  } catch (error) {
    console.error(error);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "discord_delivery_failed" }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Alertmanager Discord bridge listening on ${port}`);
});
