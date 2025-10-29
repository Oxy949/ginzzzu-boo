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
    }

    static DEFAULT_OPTIONS = {
        id: "ginzzzu-boo-toolbar",
        tag: "div",
        classes: [],
        window: {
            contentClasses: ["flexrow"],
            icon: "fa-solid fa-music",
            resizable: false,
        },
        actions: {
            // clearJournal: CommonToolbar.clearJournals,
            // clearImage: CommonToolbar.clearImage,
            // toggleScreen: CommonToolbar.toggleScreen,
            // toggleFocus: CommonToolbar.toggleFocus,
        },
        position: {
            height: 'auto',
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
        // If the sound folder is not set, prompt immediately (behavior from
        // the original sender implementation).
        if (!game.settings.get(MODULE_ID, "soundFolder")) this.pickFolder();
        // After the first render, apply any saved position so the window
        // opens where the user left it.
        try { this.applySavedPosition(); } catch (e) { /* ignore */ }
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        let css = [
            !game.user.isGM ? "hidectrl" : null
        ].filter(c => !!c).join(" ");
        let pos = this.getPos();

        // let screen = (setting("per-scene") ? foundry.utils.getProperty(canvas.scene, "flags.monks-ginzzzu-boo.screen") : setting("screen")) || "gm";
        // let focus = (setting("per-scene") ? foundry.utils.getProperty(canvas.scene, "flags.monks-ginzzzu-boo.focus") : setting("focus")) || "gm";

        // Integrate the sender context (folder/files/users) so the
        // `sender.hbs` template has the data it expects.
        const folder = game.settings.get(MODULE_ID, "soundFolder");
        let files = [];
        if (folder) {
            try {
                const resp = await FilePicker.browse("data", folder);
                files = (resp.files || [])
                    .filter((f) => typeof f === "string" && f)
                    .filter((f) => {
                        const lower = f.toLowerCase();
                        return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
                    })
                    .map((f) => {
                        // Normalize Windows backslashes and extract only the
                        // filename (basename) for display. Keep `path` as the
                        // original value so playback still uses the full path.
                        // const normalized = f.replace(/\\/g, "/");
                        // const parts = f.split("\\");
                        const basename = (f.match(/[^\\/]+$/) || [f])[0];
                        return {
                            path: f,
                            name: basename
                        };
                    });
            } catch (e) {
                console.error(MODULE_ID, "browse error", e);
                ui.notifications?.error?.("Не удалось прочитать папку со звуками.");
            }
        }

        const users = game.users
            .filter((u) => u.active)
            .map((u) => ({ id: u.id, name: u.name, isGM: u.isGM }));

        return foundry.utils.mergeObject(context, {
            tokens: this.tokens,
            cssClass: css,
            screen: {},
            focus: {},
            pos: pos,
            // Sender-specific
            folder,
            files,
            hasFiles: files.length > 0,
            users
        });
    }

    /** Attach event handlers for the sender template controls */
    async _onRender(...args) {
        if (super._onRender) await super._onRender(...args);
        const el = this.element;

        el.querySelector('[data-action="pick-folder"]')
            ?.addEventListener("click", () => this.pickFolder());

        el.querySelector('[data-action="refresh"]')
            ?.addEventListener("click", () => this.render(true));

        el.querySelector('[data-action="play"]')
            ?.addEventListener("click", () => this.play());

        el.querySelector('[data-action="select-all"]')
            ?.addEventListener("click", (e) => {
                const btn = e.currentTarget;
                const turnOn = btn.dataset.state !== "on";
                btn.dataset.state = turnOn ? "on" : "off";
                el.querySelectorAll('input[name="user"]').forEach((cb) => (cb.checked = turnOn));
            });
    }

    /** Ask the user to pick the folder and persist it */
    async pickFolder() {
        new FilePicker({
            type: "audio",
            callback: async (path) => {
                await game.settings.set(MODULE_ID, "soundFolder", path);
                ui.notifications?.info?.(`📁 Папка со звуками сохранена: ${path}`);
                this.render(true);
            }
        }).browse();
    }

    /** Play selected sound to selected users */
    async play() {
        const el = this.element;
        const select = el.querySelector("#ginzzzu-sound-select");
        const soundFile = select?.value ?? "";

        const selectedUsers = Array.from(el.querySelectorAll('input[name="user"]:checked'))
            .map((cb) => cb.value);

        if (!soundFile) return ui.notifications?.warn?.("❌ Не выбран звук.");
        if (!selectedUsers.length) return ui.notifications?.warn?.("❌ Никого не выбрано.");

        try {
            foundry.audio.AudioHelper.play(
                { src: soundFile, volume: 1, autoplay: true, loop: false, channel: "environment" },
                { recipients: selectedUsers }
            );

            const names = selectedUsers.map((uid) => game.users.get(uid)?.name ?? "???").join(", ");
            ui.notifications?.info?.(`🎶 Отправлен звук → ${names}`);
        } catch (e) {
            console.error(MODULE_ID, "play error", e);
            ui.notifications?.error?.("Ошибка при попытке воспроизведения.");
        }
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
        this.pos = game.user.getFlag(MODULE_ID, "position");

        if (this.pos == undefined) {
            this.pos = {
                top: 60,
                left: 120
            };
            game.user.setFlag(MODULE_ID, "position", this.pos);
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

    /** Read saved per-user flag and apply window position if present. */
    applySavedPosition() {
        try {
            const pos = game.user.getFlag(MODULE_ID, "position");
            if (!pos) return;
            const left = Number(pos.left);
            const top = Number(pos.top);
            if (Number.isFinite(left) && Number.isFinite(top)) {
                // Keep current width/height when applying position
                const cur = this.position || {};
                this.setPosition({ left, top, width: cur.width, height: cur.height });
            }
        } catch (e) { /* ignore */ }
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
                await canvas.scene.setFlag(MODULE_ID, MonksCommonDisplay.selectToken, tokenids);
                foundry.utils.setProperty(canvas.scene, `flags.${MODULE_ID}.${MonksCommonDisplay.selectToken}`, tokenids);
            } else {
                await game.settings.set(MODULE_ID, MonksCommonDisplay.selectToken, tokenids);
            }
            if (MonksCommonDisplay.selectToken == "screen") MonksCommonDisplay.screenChanged(); else MonksCommonDisplay.focusChanged();

            MonksCommonDisplay.selectToken = null;
        } else {
            let active = !setting("screen-toggle");
            await game.settings.set(MODULE_ID, "screen-toggle", active);
            if (active) {
                MonksCommonDisplay.screenChanged();
            }
        }
        this.render();
    }

    static async toggleFocus() {
        let active = !setting("focus-toggle");
        await game.settings.set(MODULE_ID, "focus-toggle", active);
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
                        await canvas.scene.setFlag(MODULE_ID, group, "gm");
                    else
                        await game.settings.set(MODULE_ID, group, "gm");
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
                        await canvas.scene.setFlag(MODULE_ID, group, "controlled");
                    else
                        await game.settings.set(MODULE_ID, group, "controlled");
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
                        await canvas.scene.setFlag(MODULE_ID, group, "scene");
                    else
                        await game.settings.set(MODULE_ID, group, "scene");
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
                        await canvas.scene.setFlag(MODULE_ID, group, "combat");
                    else
                        await game.settings.set(MODULE_ID, group, "combat");
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
                        await canvas.scene.setFlag(MODULE_ID, group, "party");
                    else
                        await game.settings.set(MODULE_ID, group, "party");
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

// The original sender implementation (older) was here; it has been
// integrated above into this Application class. The commented duplicate
// implementation has been removed for clarity.

/* ----------------------- Кнопка в панели слева ----------------------- */
// В v13 getSceneControlButtons даёт объект; на всякий случай поддержим и старую форму-массив.
let _appInstance = null;

Hooks.on('renderSceneControls', async (control, html, data) => {
  if (game.user.isGM && $('#scene-controls-layers .ginzzzu-boo-display', html).length == 0) {
    const name = 'monkscommondisplay';
    const title = game.i18n.localize("GINZZZUBOO.ToggleToolbar");
    const icon = 'fas fa-music';
    const active = setting('show-toolbar');
    const btn = $(`<button type="button" class="ginzzzu-boo toggle control ui-control layer icon ${icon} ${game.modules.get("minimal-ui")?.active ? "minimal " : ""}" role="tab" data-control="ginzzzu-boo" title="${title}" data-tool="${name}" aria-pressed="${active ? 'true' : 'false'}" aria-label="Common Controls" aria-controls="scene-controls-tools"></button>`);
    btn.on('click', async () => {
      let toggled = !setting("show-toolbar");
      game.settings.set(MODULE_ID, 'show-toolbar', toggled);

      if (!_appInstance) 
        _appInstance = new GinzzzuBooApp();
            if (toggled) {
                _appInstance.render(true);
                try { _appInstance.applySavedPosition(); } catch (e) { /* ignore */ }
            }
      else 
        _appInstance.close();
      
      $('#scene-controls-layers .ginzzzu-boo', html).attr("aria-pressed", toggled ? "true" : "false");
    });
    
    $(html).find('#scene-controls-layers').append($("<li>").append(btn));
  }
});

// Keep the app users list up-to-date: re-render when users change or are
// created/deleted. This ensures the checkbox list in the sender UI reflects
// current connected/active players.
const _reRenderApp = foundry.utils.debounce(() => {
    try { if (_appInstance) _appInstance.render(true); } catch (e) { /* ignore */ }
}, 250);

Hooks.on('createUser', _reRenderApp);
Hooks.on('updateUser', _reRenderApp);
Hooks.on('deleteUser', _reRenderApp);
Hooks.on('userConnected', _reRenderApp);
Hooks.on('userDisconnected', _reRenderApp);

// If the toolbar was open last time (stored in module setting), create and
// open the app automatically when Foundry is ready.
Hooks.once('ready', () => {
    try {
        if (game.user.isGM && setting('show-toolbar')) {
            if (!_appInstance) _appInstance = new GinzzzuBooApp();
            _appInstance.render(true);
            try { _appInstance.applySavedPosition(); } catch (e) { /* ignore */ }
        }
    } catch (e) { /* ignore */ }
});