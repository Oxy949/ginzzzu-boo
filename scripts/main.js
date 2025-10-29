const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

const MODULE_ID = "ginzzzu-boo";
const ALLOWED_EXT = [".mp3", ".ogg", ".wav"];

export let setting = key => {
    return game.settings.get(MODULE_ID, key);
};

/* ------------------------- Settings ------------------------- */
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "soundFolder", {
    name: "Папка со звуками",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
  game.settings.register(MODULE_ID, "show-toolbar", {
    name: "Показать панель инструментов",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });
});

/* -------------------- Application (AppV2+HB) -------------------- */
export class GinzzzuBooApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);

        this.tokens = [];
        this.thumbnails = {};
        this._collapsed = false;

        Hooks.on('canvasReady', () => {
            if (setting("show-toolbar"))
                this.render(true);
        });

        Hooks.on("updateCombat", () => {
            if (setting("show-toolbar"))
                this.render(true);
        });
    }

    static DEFAULT_OPTIONS = {
        id: "common-display-toolbar",
        tag: "div",
        classes: [],
        window: {
            contentClasses: ["flexrow"],
            icon: "fa-solid fa-chalkboard-teacher",
            resizable: false,
        },
        actions: {
            // clearJournal: CommonToolbar.clearJournals,
            // clearImage: CommonToolbar.clearImage,
            // toggleScreen: CommonToolbar.toggleScreen,
            // toggleFocus: CommonToolbar.toggleFocus,
        },
        position: {
            height: 95,
            width: 'auto',
        }
    };

    static PARTS = {
        main: {
            root: true,
            template: `modules/${MODULE_ID}/templates/sender.hbs`,
        }
    };

    persistPosition = foundry.utils.debounce(this.onPersistPosition.bind(this), 1000);

    onPersistPosition(position) {
        game.user.setFlag(MODULE_ID, "position", { left: position.left, top: position.top });
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this._createContextMenus(this.element);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        let css = [
            !game.user.isGM ? "hidectrl" : null
        ].filter(c => !!c).join(" ");
        let pos = this.getPos();

        // let screen = (setting("per-scene") ? foundry.utils.getProperty(canvas.scene, "flags.monks-common-display.screen") : setting("screen")) || "gm";
        // let focus = (setting("per-scene") ? foundry.utils.getProperty(canvas.scene, "flags.monks-common-display.focus") : setting("focus")) || "gm";

        return foundry.utils.mergeObject(context, {
            tokens: this.tokens,
            cssClass: css,
            screen: {
                // icon: this.getIcon(screen, "screen"),
                // img: this.getImage(screen, "screen"),
                // tooltip: this.getTooltip(screen, "screen"),
                // active: setting("screen-toggle")
            },
            focus: {
                // icon: this.getIcon(focus, "focus"),
                // img: this.getImage(focus, "focus"),
                // tooltip: this.getTooltip(focus, "focus"),
                // active: setting("focus-toggle")
            },
            pos: pos,
        });
    }

    getIcon(id, type) {
        if (MonksCommonDisplay.selectToken == type)
            return "fa-bullseye";

        if (id == "combat") // && game.combats.active)
            return "fa-swords";
        else if (id == "gm" || !id)
            return "fa-people-arrows";
        else if (id == "party")
            return "fa-users-viewfinder";
        else if (id == "controlled")
            return "fa-street-view";
        else if (id == "scene")
            return "fa-presentation-screen";

        return "fa-users";
    }

    getImage(id, type) {
        if (MonksCommonDisplay.selectToken == type)
            return null;

        if (id != "combat" && id != "gm") {
            //try and find the image of the token
            if (id.indexOf(",") > -1)
                return null;

            let token = canvas.scene.tokens.find(t => t.id == id || t.actor?.id == id);
            if (token)
                return token.texture.src;
        }
        return null;
    }

    getTooltip(id, type) {
        if (MonksCommonDisplay.selectToken == type)
            return "Selecting an Actor";

        if (id == "combat") // && game.combats.active)
            return game.i18n.localize("MonksCommonDisplay.Combatant");
        else if (id == "gm" || !id)
            return game.i18n.localize("MonksCommonDisplay.GM");
        else if (id == "party")
            return game.i18n.localize("MonksCommonDisplay.Party");
        else if (id == "controlled")
            return game.i18n.localize("MonksCommonDisplay.Controlled");
        else if (id == "scene")
            return game.i18n.localize("MonksCommonDisplay.FullScene");

        if (id.indexOf(",") > -1)
            return null;

        let token = canvas.scene.tokens.find(t => t.id == id || t.actor?.id == id);
        if (token)
            return token.name;

        return "";
    }

    getPos() {
        this.pos = game.user.getFlag("monks-common-display", "position");

        if (this.pos == undefined) {
            this.pos = {
                top: 60,
                left: 120
            };
            game.user.setFlag("monks-common-display", "position", this.pos);
        }

        let result = '';
        if (this.pos != undefined) {
            result = Object.entries(this.pos).filter(k => {
                return k[1] != null;
            }).map(k => {
                return k[0] + ":" + k[1] + 'px';
            }).join('; ');
        }

        return result;
    }

    setPosition(position) {
        position = super.setPosition(position);
        this.persistPosition(position);
        return position;
    }

    static clearJournals() {
        MonksCommonDisplay.emit("closeJournals");
    }

    static clearImage() {
        MonksCommonDisplay.emit("closeImagePopout");
    }

    static async toggleScreen() {
        if (!!MonksCommonDisplay.selectToken) {
            let tokenids = canvas.tokens.controlled.map((t) => t.id).join(",");
            if (setting("per-scene")) {
                await canvas.scene.setFlag("monks-common-display", MonksCommonDisplay.selectToken, tokenids);
                foundry.utils.setProperty(canvas.scene, `flags.monks-common-display.${MonksCommonDisplay.selectToken}`, tokenids);
            } else {
                await game.settings.set("monks-common-display", MonksCommonDisplay.selectToken, tokenids);
            }
            if (MonksCommonDisplay.selectToken == "screen") MonksCommonDisplay.screenChanged(); else MonksCommonDisplay.focusChanged();

            MonksCommonDisplay.selectToken = null;
        } else {
            let active = !setting("screen-toggle");
            await game.settings.set("monks-common-display", "screen-toggle", active);
            if (active) {
                MonksCommonDisplay.screenChanged();
            }
        }
        this.render();
    }

    static async toggleFocus() {
        let active = !setting("focus-toggle");
        await game.settings.set("monks-common-display", "focus-toggle", active);
        MonksCommonDisplay.focusChanged();
        this.render();
    }

    _createContextMenus() {
        this._createContextMenu(this._getContextOptions, ".common-button-group", {
            fixed: true,
            hookName: "getCommonDisplayContextOptions",
            parentClassHooks: false
        });
        this._createContextMenu(this._getContextOptions, ".common-button-group .header", {
            fixed: true,
            hookName: "getCommonDisplayContextOptions",
            parentClassHooks: false,
            eventName: "click",
        });
    }

    _getContextOptions() {
        return [
            {
                name: game.i18n.localize("MonksCommonDisplay.GM"),
                icon: '<i class="fas fa-user"></i>',
                condition: (btn) => {
                    return game.user.isGM && btn.closest(".common-button-group").dataset.group == "screen"
                },
                callback: async (btn) => {
                    let group = btn.closest(".common-button-group").dataset.group;
                    MonksCommonDisplay.selectToken = null;
                    if (setting("per-scene"))
                        await canvas.scene.setFlag("monks-common-display", group, "gm");
                    else
                        await game.settings.set("monks-common-display", group, "gm");
                    if (group == "screen") MonksCommonDisplay.screenChanged(); else MonksCommonDisplay.focusChanged();
                    this.render(true);
                }
            },
            {
                name: game.i18n.localize("MonksCommonDisplay.Controlled"),
                icon: '<i class="fas fa-street-view"></i>',
                condition: game.user.isGM,
                callback: async (btn) => {
                    let group = btn.closest(".common-button-group").dataset.group;
                    MonksCommonDisplay.selectToken = null;
                    if (setting("per-scene"))
                        await canvas.scene.setFlag("monks-common-display", group, "controlled");
                    else
                        await game.settings.set("monks-common-display", group, "controlled");
                    if (group == "screen") MonksCommonDisplay.screenChanged(); else MonksCommonDisplay.focusChanged();
                    this.render(true);
                }
            },
            {
                name: game.i18n.localize("MonksCommonDisplay.FullScene"),
                icon: '<i class="fas fa-presentation-screen"></i>',
                condition: (btn) => {
                    return game.user.isGM && btn.closest(".common-button-group").dataset.group == "screen";
                },
                callback: async (btn) => {
                    let group = btn.closest(".common-button-group").dataset.group;
                    MonksCommonDisplay.selectToken = null;
                    if (setting("per-scene"))
                        await canvas.scene.setFlag("monks-common-display", group, "scene");
                    else
                        await game.settings.set("monks-common-display", group, "scene");
                    if (group == "screen") MonksCommonDisplay.screenChanged(); else MonksCommonDisplay.focusChanged();
                    this.render(true);
                }
            },
            {
                name: game.i18n.localize("MonksCommonDisplay.Combatant"),
                icon: '<i class="fas fa-swords"></i>',
                condition: game.user.isGM,
                callback: async (btn) => {
                    let group = btn.closest(".common-button-group").dataset.group;
                    MonksCommonDisplay.selectToken = null;
                    if (setting("per-scene"))
                        await canvas.scene.setFlag("monks-common-display", group, "combat");
                    else
                        await game.settings.set("monks-common-display", group, "combat");
                    if (group == "screen") MonksCommonDisplay.screenChanged(); else MonksCommonDisplay.focusChanged();
                    this.render(true);
                }
            },
            {
                name: game.i18n.localize("MonksCommonDisplay.Party"),
                icon: '<i class="fas fa-users-viewfinder"></i>',
                condition: (btn) => {
                    return game.user.isGM && btn.closest(".common-button-group").dataset.group == "screen";
                },
                callback: async (btn) => {
                    let group = btn.closest(".common-button-group").dataset.group;
                    MonksCommonDisplay.selectToken = null;
                    if (setting("per-scene"))
                        await canvas.scene.setFlag("monks-common-display", group, "party");
                    else
                        await game.settings.set("monks-common-display", group, "party");
                    if (group == "screen") MonksCommonDisplay.screenChanged(); else MonksCommonDisplay.focusChanged();
                    this.render(true);
                }
            },
            {
                name: game.i18n.localize("MonksCommonDisplay.SelectTokens"),
                icon: '<i class="fas fa-bullseye"></i>',
                condition: game.user.isGM,
                callback: btn => {
                    let group = btn.closest(".common-button-group").dataset.group;
                    MonksCommonDisplay.selectToken = (!!MonksCommonDisplay.selectToken ? null : group);
                    this.render(true);
                }
            }
        ];
    }

    async updateToken(tkn, refresh = true) {
        let diff = {};

        if (tkn.img != (tkn.token.actor.img || tkn.token.texture.src)) {
            diff.img = (tkn.token.actor.img || tkn.token.texture.src);
            let thumb = this.thumbnails[diff.img];
            if (!thumb) {
                try {
                    thumb = await ImageHelper.createThumbnail(diff.img, { width: 50, height: 50 });
                    this.thumbnails[diff.img] = (thumb?.thumb || thumb);
                } catch {
                    thumb = 'icons/svg/mystery-man.svg';
                }
            }

            diff.thumb = (thumb?.thumb || thumb);
        }

        if (Object.keys(diff).length > 0) {
            foundry.utils.mergeObject(tkn, diff);
            if (refresh)
                this.render();
        }
    }
}

// class GinzzzuBooApp extends foundry.applications.api.ApplicationV2 {
//   static DEFAULT_OPTIONS = {
//     ...super.DEFAULT_OPTIONS,
//     id: "ginzzzu-boo-app",
//     classes: ["ginzzzu-boo"],
//     template: `modules/${MODULE_ID}/templates/sender.hbs`,
//     width: 420,
//     height: "auto",
//     resizable: true,
//     title: "🎵 Отправка звука",
//     window: { icon: "fa-solid fa-music" }
//   };

//   /** Данные для шаблона */
//   async _prepareContext() {
//     const folder = game.settings.get(MODULE_ID, "soundFolder");
//     let files = [];
//     if (folder) {
//       try {
//         // Берём содержимое папки через FilePicker и фильтруем по расширениям
//         const resp = await FilePicker.browse("data", folder);
//         // resp.files — список путей; превращаем в {path, name}
//         files = resp.files
//           .filter((f) => {
//             const lower = f.toLowerCase();
//             return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
//           })
//           .map((f) => ({
//             path: f,
//             name: f.startsWith(folder + "/") ? f.slice(folder.length + 1) : f
//           }));
//       } catch (e) {
//         console.error(MODULE_ID, "browse error", e);
//         ui.notifications.error("Не удалось прочитать папку со звуками.");
//       }
//     }

//     const users = game.users
//       .filter((u) => u.active)
//       .map((u) => ({ id: u.id, name: u.name, isGM: u.isGM }));

//     return {
//       folder,
//       files,
//       hasFiles: files.length > 0,
//       users
//     };
//   }

//   /** Первый рендер — если папка не задана, сразу предложим выбрать */
//   async _onFirstRender() {
//     if (!game.settings.get(MODULE_ID, "soundFolder")) this.#pickFolder();
//   }

//   /** Навешиваем обработчики кликов */
//   async _onRender() {
//     const el = this.element;

//     el.querySelector('[data-action="pick-folder"]')
//       ?.addEventListener("click", () => this.#pickFolder());

//     el.querySelector('[data-action="refresh"]')
//       ?.addEventListener("click", () => this.render(true));

//     el.querySelector('[data-action="play"]')
//       ?.addEventListener("click", () => this.#play());

//     el.querySelector('[data-action="select-all"]')
//       ?.addEventListener("click", (e) => {
//         const btn = e.currentTarget;
//         const turnOn = btn.dataset.state !== "on";
//         btn.dataset.state = turnOn ? "on" : "off";
//         el.querySelectorAll('input[name="user"]').forEach((cb) => (cb.checked = turnOn));
//       });
//   }

//   async #pickFolder() {
//     new FilePicker({
//       type: "audio",
//       callback: async (path) => {
//         await game.settings.set(MODULE_ID, "soundFolder", path);
//         ui.notifications.info(`📁 Папка со звуками сохранена: ${path}`);
//         this.render(true);
//       }
//     }).browse();
//   }

//   async #play() {
//     const el = this.element;
//     const select = el.querySelector("#ginzzzu-sound-select");
//     const soundFile = select?.value ?? "";

//     const selectedUsers = Array.from(el.querySelectorAll('input[name="user"]:checked'))
//       .map((cb) => cb.value);

//     if (!soundFile) return ui.notifications.warn("❌ Не выбран звук.");
//     if (!selectedUsers.length) return ui.notifications.warn("❌ Никого не выбрано.");

//     try {
//       // Адресное воспроизведение: channel 'environment', recipients — массив id юзеров
//       foundry.audio.AudioHelper.play(
//         { src: soundFile, volume: 1, autoplay: true, loop: false, channel: "environment" },
//         { recipients: selectedUsers }
//       );

//       const names = selectedUsers.map((uid) => game.users.get(uid)?.name ?? "???").join(", ");
//       ui.notifications.info(`🎶 Отправлен звук → ${names}`);
//     } catch (e) {
//       console.error(MODULE_ID, "play error", e);
//       ui.notifications.error("Ошибка при попытке воспроизведения.");
//     }
//   }
// }

/* ----------------------- Кнопка в панели слева ----------------------- */
// В v13 getSceneControlButtons даёт объект; на всякий случай поддержим и старую форму-массив.
let _appInstance = null;

Hooks.on('renderSceneControls', async (control, html, data) => {
  if (game.user.isGM && $('#scene-controls-layers .common-display', html).length == 0) {
    const name = 'monkscommondisplay';
    const title = game.i18n.localize("GINZZZUBOO.ToggleToolbar");
    const icon = 'fas fa-music';
    const active = setting('show-toolbar');
    const btn = $(`<button type="button" class="common-display toggle control ui-control layer icon ${icon} ${game.modules.get("minimal-ui")?.active ? "minimal " : ""}" role="tab" data-control="common-display" title="${title}" data-tool="${name}" aria-pressed="${active ? 'true' : 'false'}" aria-label="Common Controls" aria-controls="scene-controls-tools"></button>`);
    btn.on('click', async () => {
      let toggled = !setting("show-toolbar");
      game.settings.set(MODULE_ID, 'show-toolbar', toggled);

      if (!_appInstance) 
        _appInstance = new GinzzzuBooApp();
      if (toggled) 
        _appInstance.render(true);
      else 
        _appInstance.close();
      
      $('#scene-controls-layers .common-display', html).attr("aria-pressed", toggled ? "true" : "false");
    });
    
    $(html).find('#scene-controls-layers').append($("<li>").append(btn));
  }
});