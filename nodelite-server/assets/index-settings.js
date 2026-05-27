export function createAdminPanels(deps) {
  const {
    t,
    escapeHtml,
    fmtDurationSeconds,
    fmtDateTime,
    fetchJson,
    postSettingsJson,
    compareVersions,
    generatePassword,
    updateConsole,
  } = deps;

  let latestSettings = null;
  let latestAlerts = null;
  let alertsDraft = emptyAlertsConfig();
  let pendingTwoFactorSetup = null;
  function settingsRoot() {
    return document.getElementById("settings-root");
  }
  function accountRoot() {
    return document.getElementById("account-root");
  }
  function alertsRoot() {
    return document.getElementById("alerts-root");
  }

  function emptyAlertsConfig() {
    return {
      enabled: false,
      smtp: {
        enabled: false,
        host: "",
        port: 587,
        username: "",
        sender: "",
        recipients: [],
        transport: "start_tls",
        password_configured: false,
      },
      webhook: {
        enabled: false,
        url: "",
        send_resolved: true,
        secret_configured: false,
      },
      rules: [],
      inspection: {
        enabled: false,
        local_time: "09:00",
        lookback_hours: 24,
        delivery: ["smtp"],
        offline_grace_minutes: 10,
        latency_warn_ms: 250,
        cpu_warn_percent: 85,
        memory_warn_percent: 90,
      },
    };
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function loadSystemSettings() {
    const root = settingsRoot();
    if (!root) return;
    root.innerHTML = `<div class="empty">${escapeHtml(t("settings.loading"))}</div>`;
    try {
      latestSettings = await fetchJson("/api/settings");
      renderSystemSettings();
    } catch (error) {
      root.innerHTML = `<div class="empty">${escapeHtml(t("settings.load_failed", { error: error.message }))}</div>`;
    }
  }

  async function loadAccountSettings() {
    const root = accountRoot();
    if (!root) return;
    root.innerHTML = `<div class="empty">${escapeHtml(t("settings.loading"))}</div>`;
    try {
      latestSettings = await fetchJson("/api/settings");
      renderAccountSettings();
    } catch (error) {
      root.innerHTML = `<div class="empty">${escapeHtml(t("settings.load_failed", { error: error.message }))}</div>`;
    }
  }

  async function loadAlertSettings() {
    const root = alertsRoot();
    if (!root) return;
    root.innerHTML = `<div class="empty">${escapeHtml(t("alerts.loading"))}</div>`;
    try {
      latestAlerts = await fetchJson("/api/settings/alerts");
      alertsDraft = deepClone(latestAlerts.config || emptyAlertsConfig());
      renderAlertSettings();
    } catch (error) {
      root.innerHTML = `<div class="empty">${escapeHtml(t("alerts.load_failed", { error: error.message }))}</div>`;
    }
  }

  function applyChrome(activeTab) {
    if (activeTab === "settings" && latestSettings) {
      renderSystemSettings();
    }
    if (activeTab === "account" && latestSettings) {
      renderAccountSettings();
    }
    if (activeTab === "alerts" && latestAlerts) {
      renderAlertSettings();
    }
  }

  function kv(label, value) {
    return `<div><span>${escapeHtml(label)}</span><span>${escapeHtml(value ?? t("common.not_available"))}</span></div>`;
  }

  function tokenTable(agents) {
    if (!agents.length) return `<div class="empty">${escapeHtml(t("settings.tokens.empty"))}</div>`;
    const rows = agents.map((agent) => {
      const seconds = agent.token_expires_in_secs;
      const cls = seconds == null ? "" : seconds <= 0 ? "token-expired" : seconds < 7 * 86400 ? "token-expiring" : "token-ok";
      return `<tr>
        <td>${escapeHtml(agent.node_label || agent.node_id)}<div class="settings-note">${escapeHtml(agent.node_id)}</div></td>
        <td>${escapeHtml(agent.online ? t("common.online") : t("common.offline"))}</td>
        <td>${escapeHtml(agent.agent_version || t("common.not_available"))}</td>
        <td>${escapeHtml(agent.remote_ip || t("common.not_available"))}</td>
        <td>${escapeHtml(agent.token_expires_at ? fmtDateTime(agent.token_expires_at) : t("settings.token.no_expiry"))}</td>
        <td class="numeric ${cls}">${escapeHtml(fmtDurationSeconds(seconds))}</td>
      </tr>`;
    }).join("");
    return `<table class="token-table">
      <thead><tr>
        <th>${escapeHtml(t("settings.tokens.node"))}</th>
        <th>${escapeHtml(t("settings.tokens.status"))}</th>
        <th>${escapeHtml(t("settings.tokens.agent"))}</th>
        <th>${escapeHtml(t("settings.tokens.ip"))}</th>
        <th>${escapeHtml(t("settings.tokens.expires_at"))}</th>
        <th>${escapeHtml(t("settings.tokens.remaining"))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderSystemSettings() {
    const settings = latestSettings;
    const root = settingsRoot();
    if (!settings || !root) return;
    const auth = settings.auth || {};
    root.innerHTML = `
      <article class="settings-card">
        <h2>${escapeHtml(t("settings.version.title"))}</h2>
        <div class="settings-kv">
          ${kv(t("settings.version.current"), settings.server_version)}
          ${kv(t("settings.version.repository"), settings.repository)}
          ${kv(t("settings.version.public_url"), settings.public_base_url)}
          ${kv(t("settings.version.listen"), settings.listen)}
        </div>
        <div class="settings-actions">
          <button type="button" class="settings-button primary" id="settings-check-update">${escapeHtml(t("settings.version.check_updates"))}</button>
          <button type="button" class="settings-button" id="settings-view-update-log">${escapeHtml(t("settings.version.view_update_log"))}</button>
          <a class="settings-button" href="${escapeHtml(settings.updates.latest_release_url)}" target="_blank" rel="noreferrer">${escapeHtml(t("settings.version.open_release"))}</a>
        </div>
        <form class="settings-form manual-update-form" id="server-update-form">
          <p class="settings-note">${escapeHtml(t(auth.two_factor_enabled ? "settings.version.manual_update_note_2fa" : "settings.version.manual_update_note_password"))}</p>
          ${serverUpdateConfirmationField(auth)}
          <div class="settings-actions">
            <button type="submit" class="settings-button primary">${escapeHtml(t("settings.version.update_now"))}</button>
          </div>
        </form>
        <div id="settings-update-message" class="settings-message"></div>
      </article>

      <article class="settings-card settings-card-wide">
        <h2>${escapeHtml(t("settings.tokens.title"))}</h2>
        ${tokenTable(settings.agents || [])}
      </article>

      <article class="settings-card settings-card-wide">
        <h2>${escapeHtml(t("settings.ops.title"))}</h2>
        <div class="settings-kv">
          ${kv(t("settings.ops.config"), settings.config_path)}
          ${kv(t("settings.ops.registry"), settings.registry_path)}
          ${kv(t("settings.ops.history"), settings.history_db_path)}
          ${kv(t("settings.ops.snapshot"), settings.snapshot_path)}
        </div>
        <p class="settings-note">${escapeHtml(t("settings.ops.server_upgrade"))}</p>
        <pre class="settings-note settings-code">${escapeHtml(settings.updates.server_upgrade_command)}</pre>
        <p class="settings-note">${escapeHtml(t("settings.ops.agent_upgrade"))}</p>
        <pre class="settings-note settings-code">${escapeHtml(settings.updates.agent_upgrade_command)}</pre>
      </article>
    `;
    bindSystemSettingsActions(settings);
  }

  function renderAccountSettings() {
    const settings = latestSettings;
    const root = accountRoot();
    if (!settings || !root) return;
    const auth = settings.auth || {};
    root.innerHTML = `
      <article class="settings-card">
        <h2>${escapeHtml(t("settings.security.title"))}</h2>
        <div class="settings-kv">
          ${kv(t("settings.security.auth"), auth.enabled ? t("common.online") : t("common.offline"))}
          ${kv(t("settings.security.username"), auth.username || t("common.not_available"))}
          ${kv(t("settings.security.2fa"), auth.two_factor_enabled ? t("settings.enabled") : t("settings.disabled"))}
          ${kv(t("settings.security.session_ttl"), fmtDurationSeconds(auth.session_ttl_secs))}
        </div>
        <p class="settings-note">${escapeHtml(t("settings.security.2fa_note"))}</p>
        ${twoFactorControls(auth)}
        <div class="settings-actions">
          <button type="button" class="settings-button danger" id="account-logout">${escapeHtml(t("settings.security.logout"))}</button>
        </div>
      </article>

      <article class="settings-card">
        <h2>${escapeHtml(t("settings.password.title"))}</h2>
        <form class="settings-form" id="password-form">
          <label>${escapeHtml(t("settings.password.current"))}<input class="settings-input" type="password" name="current_password" autocomplete="current-password" required></label>
          <label>${escapeHtml(t("settings.password.new"))}<input class="settings-input" type="password" name="new_password" autocomplete="new-password" minlength="8" required></label>
          <div class="settings-actions">
            <button type="button" class="settings-button" id="password-generate">${escapeHtml(t("settings.password.generate"))}</button>
            <button type="submit" class="settings-button primary">${escapeHtml(t("settings.password.submit"))}</button>
          </div>
          <div id="password-message" class="settings-message"></div>
        </form>
      </article>
    `;
    bindAccountActions(settings);
  }

  function serverUpdateConfirmationField(auth) {
    if (auth.two_factor_enabled) {
      return `<label>${escapeHtml(t("settings.security.verification_code"))}<input class="settings-input" type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>`;
    }
    return `<label>${escapeHtml(t("settings.password.current"))}<input class="settings-input" type="password" name="current_password" autocomplete="current-password" required></label>`;
  }

  function twoFactorControls(auth) {
    if (auth.two_factor_enabled) {
      return `<form class="settings-form totp-setup" id="totp-disable-form">
        <p class="settings-note">${escapeHtml(t("settings.security.disable_note"))}</p>
        <label>${escapeHtml(t("settings.password.current"))}<input class="settings-input" type="password" name="current_password" autocomplete="current-password" required></label>
        <label>${escapeHtml(t("settings.security.verification_code"))}<input class="settings-input" type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
        <div class="settings-actions">
          <button type="submit" class="settings-button danger">${escapeHtml(t("settings.security.disable_2fa"))}</button>
        </div>
        <div id="totp-message" class="settings-message"></div>
      </form>`;
    }
    if (!pendingTwoFactorSetup) {
      return `<div class="settings-actions">
        <button type="button" class="settings-button primary" id="totp-start">${escapeHtml(t("settings.security.start_2fa"))}</button>
      </div>
      <div id="totp-message" class="settings-message"></div>`;
    }
    return `<div class="totp-setup" id="totp-setup-panel">
      <div class="totp-setup-grid">
        <div><div class="totp-qr-wrap">${pendingTwoFactorSetup.qr_svg}</div></div>
        <div>
          <h3>${escapeHtml(t("settings.security.scan_qr"))}</h3>
          <p class="settings-note">${escapeHtml(t("settings.security.setup_note"))}</p>
          <div class="secret-box">${escapeHtml(pendingTwoFactorSetup.secret)}</div>
        </div>
      </div>
      <form class="settings-form" id="totp-enable-form">
        <label>${escapeHtml(t("settings.password.current"))}<input class="settings-input" type="password" name="current_password" autocomplete="current-password" required></label>
        <label>${escapeHtml(t("settings.security.verification_code"))}<input class="settings-input" type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
        <div class="settings-actions">
          <button type="submit" class="settings-button primary">${escapeHtml(t("settings.security.enable_2fa"))}</button>
          <button type="button" class="settings-button" id="totp-cancel">${escapeHtml(t("settings.security.cancel_setup"))}</button>
        </div>
        <div id="totp-message" class="settings-message"></div>
      </form>
    </div>`;
  }

  function bindSystemSettingsActions(settings) {
    document.getElementById("settings-check-update")?.addEventListener("click", () => checkForUpdates(settings));
    document.getElementById("settings-view-update-log")?.addEventListener("click", () => {
      updateConsole.open();
      void updateConsole.fetch({ reset: true });
    });
    document.getElementById("server-update-form")?.addEventListener("submit", submitServerUpdate);
  }

  function bindAccountActions(settings) {
    document.getElementById("account-logout")?.addEventListener("click", () => {
      try { window.localStorage.removeItem("nodelite.auth.timestamp"); } catch (_e) {}
      window.location.href = "/logout-and-reauth";
    });
    document.getElementById("totp-start")?.addEventListener("click", startTwoFactorSetup);
    document.getElementById("totp-cancel")?.addEventListener("click", () => {
      pendingTwoFactorSetup = null;
      renderAccountSettings();
    });
    document.getElementById("totp-enable-form")?.addEventListener("submit", submitTwoFactorEnable);
    document.getElementById("totp-disable-form")?.addEventListener("submit", submitTwoFactorDisable);
    document.getElementById("password-generate")?.addEventListener("click", () => {
      const input = document.querySelector("#password-form [name=new_password]");
      if (input) input.value = generatePassword();
    });
    document.getElementById("password-form")?.addEventListener("submit", submitPasswordChange);
  }

  async function checkForUpdates(settings) {
    const message = document.getElementById("settings-update-message");
    if (!message) return;
    message.className = "settings-message";
    message.textContent = t("settings.version.checking");
    try {
      const api = String(settings.repository || "").replace("https://github.com/", "https://api.github.com/repos/") + "/releases/latest";
      const release = await fetchJson(api);
      const latest = String(release.tag_name || "").replace(/^v/, "");
      const current = String(settings.server_version || "").replace(/^v/, "");
      const newer = compareVersions(latest, current) > 0;
      message.className = `settings-message ${newer ? "ok" : ""}`;
      message.textContent = newer
        ? t("settings.version.update_available", { version: latest })
        : t("settings.version.up_to_date", { version: current });
    } catch (error) {
      message.className = "settings-message error";
      message.textContent = t("settings.version.check_failed", { error: error.message });
    }
  }

  async function submitServerUpdate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById("settings-update-message");
    const auth = latestSettings?.auth || {};
    const payload = auth.two_factor_enabled
      ? { code: form.code.value }
      : { current_password: form.current_password.value };
    message.className = "settings-message";
    message.textContent = t("settings.version.update_starting");
    updateConsole.open();
    updateConsole.reset();
    updateConsole.setStatus("waiting", t("settings.version.console_status_waiting"));
    updateConsole.setMeta(t("settings.version.console_preparing"));
    updateConsole.setText(`[client] ${t("settings.version.update_starting")}`);
    try {
      await postSettingsJson("/api/settings/update/server", payload);
      message.className = "settings-message ok";
      message.textContent = t("settings.version.update_started");
      updateConsole.appendLine(`[client] ${t("settings.version.update_started")}`);
      updateConsole.setStatus("running", t("settings.version.console_status_running"));
      updateConsole.setMeta(t("settings.version.console_connecting"));
      void updateConsole.fetch({ reset: true });
    } catch (error) {
      message.className = "settings-message error";
      message.textContent = t("settings.version.update_failed", { error: error.message });
      updateConsole.appendLine(`[client] ${t("settings.version.update_failed", { error: error.message })}`);
      updateConsole.setStatus("error", t("settings.version.console_status_error"));
      updateConsole.setMeta(t("settings.version.console_failed_to_start"));
    }
  }

  async function startTwoFactorSetup() {
    const message = document.getElementById("totp-message");
    if (!message) return;
    message.className = "settings-message";
    message.textContent = t("settings.security.starting_2fa");
    try {
      pendingTwoFactorSetup = await postSettingsJson("/api/settings/2fa/start", {});
      renderAccountSettings();
    } catch (error) {
      message.className = "settings-message error";
      message.textContent = t("settings.security.action_failed", { error: error.message });
    }
  }

  async function submitTwoFactorEnable(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById("totp-message");
    message.className = "settings-message";
    message.textContent = t("settings.security.enabling_2fa");
    try {
      await postSettingsJson("/api/settings/2fa/enable", {
        current_password: form.current_password.value,
        secret: pendingTwoFactorSetup?.secret || "",
        code: form.code.value,
      });
      pendingTwoFactorSetup = null;
      message.className = "settings-message ok";
      message.textContent = t("settings.security.enabled_saved");
      window.setTimeout(() => loadAccountSettings(), 600);
    } catch (error) {
      message.className = "settings-message error";
      message.textContent = t("settings.security.action_failed", { error: error.message });
    }
  }

  async function submitTwoFactorDisable(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById("totp-message");
    message.className = "settings-message";
    message.textContent = t("settings.security.disabling_2fa");
    try {
      await postSettingsJson("/api/settings/2fa/disable", {
        current_password: form.current_password.value,
        code: form.code.value,
      });
      message.className = "settings-message ok";
      message.textContent = t("settings.security.disabled_saved");
      window.setTimeout(() => loadAccountSettings(), 600);
    } catch (error) {
      message.className = "settings-message error";
      message.textContent = t("settings.security.action_failed", { error: error.message });
    }
  }

  async function submitPasswordChange(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById("password-message");
    message.className = "settings-message";
    message.textContent = t("settings.password.saving");
    try {
      await postSettingsJson("/api/settings/password", {
        current_password: form.current_password.value,
        new_password: form.new_password.value,
      });
      message.className = "settings-message ok";
      message.textContent = t("settings.password.saved");
      try { window.localStorage.removeItem("nodelite.auth.timestamp"); } catch (_e) {}
      window.setTimeout(() => { window.location.href = "/logout-and-reauth"; }, 900);
    } catch (error) {
      message.className = "settings-message error";
      message.textContent = t("settings.password.failed", { error: error.message });
    }
  }

  function renderAlertSettings() {
    const root = alertsRoot();
    if (!root) return;
    const config = alertsDraft || emptyAlertsConfig();
    const preview = latestAlerts?.preview || null;
    root.innerHTML = `
      <article class="settings-card">
        <h2>${escapeHtml(t("alerts.overview.title"))}</h2>
        <p class="settings-note">${escapeHtml(t("alerts.overview.note"))}</p>
        <label class="settings-checkbox">
          <input type="checkbox" id="alerts-enabled" ${config.enabled ? "checked" : ""}>
          <span>${escapeHtml(t("alerts.overview.enabled"))}</span>
        </label>
      </article>

      <article class="settings-card">
        <h2>${escapeHtml(t("alerts.smtp.title"))}</h2>
        <form class="settings-form" id="alerts-smtp-form">
          <label class="settings-checkbox"><input type="checkbox" name="enabled" ${config.smtp.enabled ? "checked" : ""}><span>${escapeHtml(t("alerts.smtp.enabled"))}</span></label>
          <label>${escapeHtml(t("alerts.smtp.host"))}<input class="settings-input" name="host" value="${escapeHtml(config.smtp.host)}"></label>
          <div class="settings-split">
            <label>${escapeHtml(t("alerts.smtp.port"))}<input class="settings-input" type="number" min="1" max="65535" name="port" value="${escapeHtml(config.smtp.port)}"></label>
            <label>${escapeHtml(t("alerts.smtp.transport"))}
              <select class="settings-input" name="transport">
                ${transportOptions(config.smtp.transport)}
              </select>
            </label>
          </div>
          <label>${escapeHtml(t("alerts.smtp.username"))}<input class="settings-input" name="username" value="${escapeHtml(config.smtp.username)}"></label>
          <label>${escapeHtml(t("alerts.smtp.password"))}<input class="settings-input" type="password" name="password" placeholder="${config.smtp.password_configured ? escapeHtml(t("alerts.secret.keep")) : ""}"></label>
          <label class="settings-checkbox"><input type="checkbox" name="clear_password"><span>${escapeHtml(t("alerts.secret.clear"))}</span></label>
          <label>${escapeHtml(t("alerts.smtp.sender"))}<input class="settings-input" name="sender" value="${escapeHtml(config.smtp.sender)}"></label>
          <label>${escapeHtml(t("alerts.smtp.recipients"))}<input class="settings-input" name="recipients" value="${escapeHtml(config.smtp.recipients.join(", "))}"></label>
        </form>
      </article>

      <article class="settings-card">
        <h2>${escapeHtml(t("alerts.webhook.title"))}</h2>
        <form class="settings-form" id="alerts-webhook-form">
          <label class="settings-checkbox"><input type="checkbox" name="enabled" ${config.webhook.enabled ? "checked" : ""}><span>${escapeHtml(t("alerts.webhook.enabled"))}</span></label>
          <label>${escapeHtml(t("alerts.webhook.url"))}<input class="settings-input" name="url" value="${escapeHtml(config.webhook.url)}"></label>
          <label>${escapeHtml(t("alerts.webhook.secret"))}<input class="settings-input" type="password" name="secret" placeholder="${config.webhook.secret_configured ? escapeHtml(t("alerts.secret.keep")) : ""}"></label>
          <label class="settings-checkbox"><input type="checkbox" name="clear_secret"><span>${escapeHtml(t("alerts.secret.clear"))}</span></label>
          <label class="settings-checkbox"><input type="checkbox" name="send_resolved" ${config.webhook.send_resolved ? "checked" : ""}><span>${escapeHtml(t("alerts.webhook.send_resolved"))}</span></label>
        </form>
      </article>

      <article class="settings-card settings-card-wide">
        <h2>${escapeHtml(t("alerts.inspection.title"))}</h2>
        <form class="settings-form" id="alerts-inspection-form">
          <label class="settings-checkbox"><input type="checkbox" name="enabled" ${config.inspection.enabled ? "checked" : ""}><span>${escapeHtml(t("alerts.inspection.enabled"))}</span></label>
          <div class="settings-split">
            <label>${escapeHtml(t("alerts.inspection.local_time"))}<input class="settings-input" name="local_time" value="${escapeHtml(config.inspection.local_time)}" placeholder="09:00"></label>
            <label>${escapeHtml(t("alerts.inspection.lookback_hours"))}<input class="settings-input" type="number" min="1" max="720" name="lookback_hours" value="${escapeHtml(config.inspection.lookback_hours)}"></label>
          </div>
          <div class="settings-split">
            <label>${escapeHtml(t("alerts.inspection.offline_grace_minutes"))}<input class="settings-input" type="number" min="1" name="offline_grace_minutes" value="${escapeHtml(config.inspection.offline_grace_minutes)}"></label>
            <label>${escapeHtml(t("alerts.inspection.latency_warn_ms"))}<input class="settings-input" type="number" min="1" name="latency_warn_ms" value="${escapeHtml(config.inspection.latency_warn_ms)}"></label>
          </div>
          <div class="settings-split">
            <label>${escapeHtml(t("alerts.inspection.cpu_warn_percent"))}<input class="settings-input" type="number" min="1" max="100" name="cpu_warn_percent" value="${escapeHtml(config.inspection.cpu_warn_percent)}"></label>
            <label>${escapeHtml(t("alerts.inspection.memory_warn_percent"))}<input class="settings-input" type="number" min="1" max="100" name="memory_warn_percent" value="${escapeHtml(config.inspection.memory_warn_percent)}"></label>
          </div>
          <div>
            <div class="settings-label">${escapeHtml(t("alerts.inspection.delivery"))}</div>
            <div class="settings-chip-row">${deliveryCheckboxes(config.inspection.delivery, "inspection-delivery")}</div>
          </div>
        </form>
      </article>

      <article class="settings-card settings-card-wide">
        <div class="section-head">
          <h2>${escapeHtml(t("alerts.rules.title"))}</h2>
          <button type="button" class="settings-button" id="alerts-add-rule">${escapeHtml(t("alerts.rules.add"))}</button>
        </div>
        <div id="alerts-rules-list" class="rule-list">${config.rules.length ? config.rules.map(alertRuleCard).join("") : `<div class="empty">${escapeHtml(t("alerts.rules.empty"))}</div>`}</div>
      </article>

      <article class="settings-card settings-card-wide">
        <div class="section-head">
          <h2>${escapeHtml(t("alerts.preview.title"))}</h2>
          <button type="button" class="settings-button primary" id="alerts-save">${escapeHtml(t("alerts.save"))}</button>
        </div>
        <div id="alerts-message" class="settings-message"></div>
        ${alertPreviewMarkup(preview)}
      </article>
    `;
    bindAlertActions();
  }

  function transportOptions(selected) {
    return [
      ["start_tls", t("alerts.smtp.transport.start_tls")],
      ["tls", t("alerts.smtp.transport.tls")],
      ["plain", t("alerts.smtp.transport.plain")],
    ].map(([value, label]) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function deliveryCheckboxes(selected, name) {
    return [
      ["smtp", t("alerts.channel.smtp")],
      ["webhook", t("alerts.channel.webhook")],
    ].map(([value, label]) => `
      <label class="settings-checkbox">
        <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${selected.includes(value) ? "checked" : ""}>
        <span>${escapeHtml(label)}</span>
      </label>
    `).join("");
  }

  function alertRuleCard(rule, index) {
    return `<section class="alert-rule-card" data-rule-index="${index}">
      <div class="section-head">
        <strong>${escapeHtml(rule.name || `${t("alerts.rules.title")} ${index + 1}`)}</strong>
        <button type="button" class="settings-button danger alerts-remove-rule" data-rule-index="${index}">${escapeHtml(t("alerts.rules.remove"))}</button>
      </div>
      <div class="rule-grid">
        <label>${escapeHtml(t("alerts.rules.id"))}<input class="settings-input" name="id" value="${escapeHtml(rule.id || `rule-${index + 1}`)}"></label>
        <label>${escapeHtml(t("alerts.rules.name"))}<input class="settings-input" name="name" value="${escapeHtml(rule.name || "")}"></label>
        <label>${escapeHtml(t("alerts.rules.metric"))}<select class="settings-input" name="metric">${metricOptions(rule.metric)}</select></label>
        <label>${escapeHtml(t("alerts.rules.comparator"))}<select class="settings-input" name="comparator">${comparatorOptions(rule.comparator)}</select></label>
        <label>${escapeHtml(t("alerts.rules.threshold"))}<input class="settings-input" type="number" min="0" name="threshold" value="${escapeHtml(rule.threshold ?? 0)}"></label>
        <label>${escapeHtml(t("alerts.rules.window_minutes"))}<input class="settings-input" type="number" min="1" name="window_minutes" value="${escapeHtml(rule.window_minutes ?? 5)}"></label>
        <label>${escapeHtml(t("alerts.rules.cooldown_minutes"))}<input class="settings-input" type="number" min="1" name="cooldown_minutes" value="${escapeHtml(rule.cooldown_minutes ?? 30)}"></label>
        <label>${escapeHtml(t("alerts.rules.severity"))}<select class="settings-input" name="severity">${severityOptions(rule.severity)}</select></label>
        <label>${escapeHtml(t("alerts.rules.scope_mode"))}<select class="settings-input" name="scope_mode">${scopeOptions(rule.scope_mode)}</select></label>
        <label>${escapeHtml(t("alerts.rules.node_ids"))}<input class="settings-input" name="node_ids" value="${escapeHtml((rule.node_ids || []).join(", "))}"></label>
        <label>${escapeHtml(t("alerts.rules.tags"))}<input class="settings-input" name="tags" value="${escapeHtml((rule.tags || []).join(", "))}"></label>
      </div>
      <div class="settings-chip-row">${deliveryCheckboxes(rule.delivery || [], `rule-delivery-${index}`)}</div>
      <div class="settings-chip-row">
        <label class="settings-checkbox"><input type="checkbox" name="enabled" ${rule.enabled ? "checked" : ""}><span>${escapeHtml(t("alerts.rules.enabled"))}</span></label>
        <label class="settings-checkbox"><input type="checkbox" name="send_resolved" ${rule.send_resolved ? "checked" : ""}><span>${escapeHtml(t("alerts.rules.send_resolved"))}</span></label>
      </div>
    </section>`;
  }

  function metricOptions(selected) {
    return [
      ["cpu_usage_percent", t("alerts.metric.cpu")],
      ["memory_usage_percent", t("alerts.metric.memory")],
      ["disk_usage_percent", t("alerts.metric.disk")],
      ["latency_ms", t("alerts.metric.latency")],
      ["offline_minutes", t("alerts.metric.offline")],
    ].map(([value, label]) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function comparatorOptions(selected) {
    return [
      ["gt", t("alerts.comparator.gt")],
      ["lt", t("alerts.comparator.lt")],
    ].map(([value, label]) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function severityOptions(selected) {
    return [
      ["warning", t("alerts.severity.warning")],
      ["critical", t("alerts.severity.critical")],
    ].map(([value, label]) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function scopeOptions(selected) {
    return [
      ["all", t("alerts.scope.all")],
      ["node_ids", t("alerts.scope.node_ids")],
      ["tags", t("alerts.scope.tags")],
    ].map(([value, label]) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function alertPreviewMarkup(preview) {
    if (!preview) {
      return `<div class="empty">${escapeHtml(t("alerts.preview.empty"))}</div>`;
    }
    const triggered = preview.triggered_rules.length
      ? `<ul class="preview-list">${preview.triggered_rules.map((rule) => `<li><strong>${escapeHtml(rule.rule_name)}</strong><span>${escapeHtml(rule.node_ids.join(", "))}</span></li>`).join("")}</ul>`
      : `<div class="empty compact">${escapeHtml(t("alerts.preview.no_triggered_rules"))}</div>`;
    const highlights = preview.inspection.highlights.length
      ? `<ul class="preview-list">${preview.inspection.highlights.map((item) => `<li><strong>${escapeHtml(item.node_label || item.node_id)}</strong><span>${escapeHtml(item.reasons.join(", "))}</span></li>`).join("")}</ul>`
      : `<div class="empty compact">${escapeHtml(t("alerts.preview.no_highlights"))}</div>`;
    return `
      <div class="preview-grid">
        <div>
          <div class="settings-label">${escapeHtml(t("alerts.preview.triggered_rules"))}</div>
          ${triggered}
        </div>
        <div>
          <div class="settings-label">${escapeHtml(t("alerts.preview.inspection_summary"))}</div>
          <div class="settings-kv preview-kv">
            ${kv(t("alerts.preview.total_nodes"), preview.inspection.total_nodes)}
            ${kv(t("alerts.preview.offline_nodes"), preview.inspection.offline_nodes)}
            ${kv(t("alerts.preview.latency_nodes"), preview.inspection.latency_nodes)}
            ${kv(t("alerts.preview.cpu_hot_nodes"), preview.inspection.cpu_hot_nodes)}
            ${kv(t("alerts.preview.memory_hot_nodes"), preview.inspection.memory_hot_nodes)}
          </div>
          <div class="settings-label">${escapeHtml(t("alerts.preview.highlights"))}</div>
          ${highlights}
        </div>
      </div>
    `;
  }

  function bindAlertActions() {
    document.getElementById("alerts-add-rule")?.addEventListener("click", () => {
      syncAlertDraftFromDom();
      alertsDraft.rules.push(blankRule(alertsDraft.rules.length));
      renderAlertSettings();
    });
    document.querySelectorAll(".alerts-remove-rule").forEach((button) => {
      button.addEventListener("click", () => {
        syncAlertDraftFromDom();
        alertsDraft.rules.splice(Number(button.dataset.ruleIndex || 0), 1);
        renderAlertSettings();
      });
    });
    document.getElementById("alerts-save")?.addEventListener("click", submitAlertSettings);
  }

  function blankRule(index) {
    return {
      id: `rule-${index + 1}`,
      name: "",
      enabled: true,
      metric: "cpu_usage_percent",
      comparator: "gt",
      threshold: 85,
      window_minutes: 5,
      severity: "warning",
      scope_mode: "all",
      node_ids: [],
      tags: [],
      delivery: ["smtp"],
      cooldown_minutes: 30,
      send_resolved: true,
    };
  }

  function syncAlertDraftFromDom() {
    const smtpForm = document.getElementById("alerts-smtp-form");
    const webhookForm = document.getElementById("alerts-webhook-form");
    const inspectionForm = document.getElementById("alerts-inspection-form");
    if (!smtpForm || !webhookForm || !inspectionForm) return;

    alertsDraft.enabled = document.getElementById("alerts-enabled")?.checked || false;
    alertsDraft.smtp = {
      ...alertsDraft.smtp,
      enabled: smtpForm.enabled.checked,
      host: smtpForm.host.value.trim(),
      port: Number(smtpForm.port.value || 587),
      username: smtpForm.username.value.trim(),
      sender: smtpForm.sender.value.trim(),
      recipients: csvToArray(smtpForm.recipients.value),
      transport: smtpForm.transport.value,
      password: smtpForm.password.value,
      clear_password: smtpForm.clear_password.checked,
    };
    alertsDraft.webhook = {
      ...alertsDraft.webhook,
      enabled: webhookForm.enabled.checked,
      url: webhookForm.url.value.trim(),
      send_resolved: webhookForm.send_resolved.checked,
      secret: webhookForm.secret.value,
      clear_secret: webhookForm.clear_secret.checked,
    };
    alertsDraft.inspection = {
      enabled: inspectionForm.enabled.checked,
      local_time: inspectionForm.local_time.value.trim(),
      lookback_hours: Number(inspectionForm.lookback_hours.value || 24),
      delivery: checkedValues(inspectionForm, "inspection-delivery"),
      offline_grace_minutes: Number(inspectionForm.offline_grace_minutes.value || 10),
      latency_warn_ms: Number(inspectionForm.latency_warn_ms.value || 250),
      cpu_warn_percent: Number(inspectionForm.cpu_warn_percent.value || 85),
      memory_warn_percent: Number(inspectionForm.memory_warn_percent.value || 90),
    };
    alertsDraft.rules = Array.from(document.querySelectorAll(".alert-rule-card")).map((card, index) => ({
      id: card.querySelector("[name=id]")?.value.trim() || `rule-${index + 1}`,
      name: card.querySelector("[name=name]")?.value.trim() || "",
      enabled: card.querySelector("[name=enabled]")?.checked || false,
      metric: card.querySelector("[name=metric]")?.value || "cpu_usage_percent",
      comparator: card.querySelector("[name=comparator]")?.value || "gt",
      threshold: Number(card.querySelector("[name=threshold]")?.value || 0),
      window_minutes: Number(card.querySelector("[name=window_minutes]")?.value || 5),
      severity: card.querySelector("[name=severity]")?.value || "warning",
      scope_mode: card.querySelector("[name=scope_mode]")?.value || "all",
      node_ids: csvToArray(card.querySelector("[name=node_ids]")?.value || ""),
      tags: csvToArray(card.querySelector("[name=tags]")?.value || ""),
      delivery: checkedValues(card, `rule-delivery-${index}`),
      cooldown_minutes: Number(card.querySelector("[name=cooldown_minutes]")?.value || 30),
      send_resolved: card.querySelector("[name=send_resolved]")?.checked || false,
    }));
  }

  function checkedValues(root, name) {
    return Array.from(root.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
  }

  function csvToArray(value) {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function submitAlertSettings() {
    syncAlertDraftFromDom();
    const message = document.getElementById("alerts-message");
    message.className = "settings-message";
    message.textContent = t("alerts.saving");
    try {
      latestAlerts = await postSettingsJson("/api/settings/alerts", {
        enabled: alertsDraft.enabled,
        smtp: {
          enabled: alertsDraft.smtp.enabled,
          host: alertsDraft.smtp.host,
          port: alertsDraft.smtp.port,
          username: alertsDraft.smtp.username,
          password: alertsDraft.smtp.password || null,
          clear_password: alertsDraft.smtp.clear_password || false,
          sender: alertsDraft.smtp.sender,
          recipients: alertsDraft.smtp.recipients,
          transport: alertsDraft.smtp.transport,
        },
        webhook: {
          enabled: alertsDraft.webhook.enabled,
          url: alertsDraft.webhook.url,
          secret: alertsDraft.webhook.secret || null,
          clear_secret: alertsDraft.webhook.clear_secret || false,
          send_resolved: alertsDraft.webhook.send_resolved,
        },
        rules: alertsDraft.rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          enabled: rule.enabled,
          metric: rule.metric,
          comparator: rule.comparator,
          threshold: rule.threshold,
          window_minutes: rule.window_minutes,
          severity: rule.severity,
          scope_mode: rule.scope_mode,
          node_ids: rule.node_ids,
          tags: rule.tags,
          delivery: rule.delivery,
          cooldown_minutes: rule.cooldown_minutes,
          send_resolved: rule.send_resolved,
        })),
        inspection: alertsDraft.inspection,
      });
      alertsDraft = deepClone(latestAlerts.config || emptyAlertsConfig());
      message.className = "settings-message ok";
      message.textContent = t("alerts.saved");
      renderAlertSettings();
    } catch (error) {
      message.className = "settings-message error";
      message.textContent = t("alerts.save_failed", { error: error.message });
    }
  }

  return {
    applyChrome,
    loadAccountSettings,
    loadAlertSettings,
    loadSystemSettings,
  };
}
