const MODULE_ID = "ginzzzu-boo";
const ALLOWED_EXT = [".mp3", ".ogg", ".wav"];

/* ------------------------- Settings ------------------------- */
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "soundFolder", {
    name: "Папка со звуками",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
});

/* -------------------- Application (AppV2+HB) -------------------- */
// Используем HandlebarsApplication (AppV2) — современный способ делать окна в v13.
class GinzzzuBooApp extends foundry.HandlebarsApplication {
  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    id: "ginzzzu-boo-app",
    classes: ["ginzzzu-boo"],
    template: `modules/${MODULE_ID}/templates/sender.hbs`,
    width: 420,
    height: "auto",
    resizable: true,
    title: "🎵 Отправка звука",
    window: { icon: "fa-solid fa-music" }
  };

  /** Данные для шаблона */
  async _prepareContext() {
    const folder = game.settings.get(MODULE_ID, "soundFolder");
    let files = [];
    if (folder) {
      try {
        // Берём содержимое папки через FilePicker и фильтруем по расширениям
        const resp = await FilePicker.browse("data", folder);
        // resp.files — список путей; превращаем в {path, name}
        files = resp.files
          .filter((f) => {
            const lower = f.toLowerCase();
            return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
          })
          .map((f) => ({
            path: f,
            name: f.startsWith(folder + "/") ? f.slice(folder.length + 1) : f
          }));
      } catch (e) {
        console.error(MODULE_ID, "browse error", e);
        ui.notifications.error("Не удалось прочитать папку со звуками.");
      }
    }

    const users = game.users
      .filter((u) => u.active)
      .map((u) => ({ id: u.id, name: u.name, isGM: u.isGM }));

    return {
      folder,
      files,
      hasFiles: files.length > 0,
      users
    };
  }

  /** Первый рендер — если папка не задана, сразу предложим выбрать */
  async _onFirstRender() {
    if (!game.settings.get(MODULE_ID, "soundFolder")) this.#pickFolder();
  }

  /** Навешиваем обработчики кликов */
  async _onRender() {
    const el = this.element;

    el.querySelector('[data-action="pick-folder"]')
      ?.addEventListener("click", () => this.#pickFolder());

    el.querySelector('[data-action="refresh"]')
      ?.addEventListener("click", () => this.render(true));

    el.querySelector('[data-action="play"]')
      ?.addEventListener("click", () => this.#play());

    el.querySelector('[data-action="select-all"]')
      ?.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        const turnOn = btn.dataset.state !== "on";
        btn.dataset.state = turnOn ? "on" : "off";
        el.querySelectorAll('input[name="user"]').forEach((cb) => (cb.checked = turnOn));
      });
  }

  async #pickFolder() {
    new FilePicker({
      type: "audio",
      callback: async (path) => {
        await game.settings.set(MODULE_ID, "soundFolder", path);
        ui.notifications.info(`📁 Папка со звуками сохранена: ${path}`);
        this.render(true);
      }
    }).browse();
  }

  async #play() {
    const el = this.element;
    const select = el.querySelector("#ginzzzu-sound-select");
    const soundFile = select?.value ?? "";

    const selectedUsers = Array.from(el.querySelectorAll('input[name="user"]:checked'))
      .map((cb) => cb.value);

    if (!soundFile) return ui.notifications.warn("❌ Не выбран звук.");
    if (!selectedUsers.length) return ui.notifications.warn("❌ Никого не выбрано.");

    try {
      // Адресное воспроизведение: channel 'environment', recipients — массив id юзеров
      foundry.audio.AudioHelper.play(
        { src: soundFile, volume: 1, autoplay: true, loop: false, channel: "environment" },
        { recipients: selectedUsers }
      );

      const names = selectedUsers.map((uid) => game.users.get(uid)?.name ?? "???").join(", ");
      ui.notifications.info(`🎶 Отправлен звук → ${names}`);
    } catch (e) {
      console.error(MODULE_ID, "play error", e);
      ui.notifications.error("Ошибка при попытке воспроизведения.");
    }
  }
}

/* ----------------------- Кнопка в панели слева ----------------------- */
// В v13 getSceneControlButtons даёт объект; на всякий случай поддержим и старую форму-массив.
let _appInstance = null;

Hooks.on("getSceneControlButtons", (controls) => {
  const tool = {
    name: "ginzzzu-boo",
    title: "Отправка звука",
    icon: "fa-solid fa-music",
    button: true,
    visible: game.user.isGM, // показываем только ГМу
    onChange: (_event, active) => {
      if (!_appInstance) _appInstance = new GinzzzuBooApp();
      if (active) _appInstance.render(true);
      else _appInstance.close();
    }
  };

  try {
    // v13: объект со свойством tokens.tools (объект)
    if (controls?.tokens?.tools) {
      if (Array.isArray(controls.tokens.tools)) {
        // На случай старого формата
        controls.tokens.tools.push(tool);
      } else {
        controls.tokens.tools["ginzzzu-boo"] = tool;
      }
      return;
    }

    // Фолбэк для формата-массива (v12-)
    if (Array.isArray(controls)) {
      const tokens = controls.find((c) => c.name === "token");
      if (tokens) (tokens.tools ??= []).push(tool);
    }
  } catch (err) {
    console.error(MODULE_ID, "Failed to add scene control", err);
  }
});
