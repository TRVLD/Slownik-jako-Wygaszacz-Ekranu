import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {createBackground, getStyle} from './backgrounds.js';
import {CodePrompt} from './codePrompt.js';
import {formatDefinition} from './selection.js';
import {hasCode} from './unlockCode.js';

const FADE_IN_MS = 1400;
const FADE_OUT_MS = 350;
const WORD_OUT_MS = 900;
const WORD_IN_MS = 1500;
const FRAME_MS = 33;
const MOTION_THRESHOLD = 3;
const MOTION_GRACE_MS = 400;

const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

function polishDate(now) {
    const dt = now ?? GLib.DateTime.new_now_local();
    const day = DAYS[dt.get_day_of_week() % 7];
    const month = MONTHS[dt.get_month() - 1];
    return `${day}, ${dt.get_day_of_month()} ${month} · ${dt.format('%H:%M')}`;
}

function cssFamily(family, generic = 'serif') {
    const clean = String(family || generic).replace(/["';{}]/g, '').trim() || generic;
    return ['serif', 'sans-serif', 'cursive'].includes(clean) ? clean : `"${clean}", ${generic}`;
}

class MonitorView {
    constructor(monitor, styleName, fonts) {
        this.monitor = monitor;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._cssW = monitor.width / scale;
        this._cssH = monitor.height / scale;
        const style = getStyle(styleName);
        this._style = style;
        this._wordFamily = cssFamily(fonts.word, style.wordGeneric ?? 'serif');
        this._family = cssFamily(fonts.text, style.textGeneric ?? 'serif');

        this.actor = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            clip_to_allocation: true,
            style_class: `wyraz-monitor ${style.cssClass}`,
        });

        this._bg = createBackground(styleName, monitor);
        this.actor.add_child(this._bg.actor);

        this._blur = null;
        try {
            this._blur = new Shell.BlurEffect({
                name: 'wyraz-blur',
                mode: Shell.BlurMode.ACTOR,
                radius: 0,
                brightness: 1.0,
            });
            this.actor.add_effect(this._blur);
        } catch (e) {
            console.warn(`[Wyraz] Rozmycie niedostępne: ${e.message}`);
        }

        this._anchor = new St.Bin({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._quadMode = typeof this._bg.textQuadrant === 'function';
        if (this._quadMode) {
            this._qw = Math.floor(monitor.width / 2);
            this._qh = Math.floor(monitor.height / 2);
            const region = new St.Widget({x_expand: true, y_expand: true});
            this._quadBox = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                width: this._qw,
                height: this._qh,
                opacity: 0,
            });
            region.add_child(this._quadBox);
            this.actor.add_child(region);
            this._anchor.style = `margin-bottom: ${Math.round(this._cssH * 0.04)}px;`;
            this._quadBox.add_child(this._anchor);
            this._textQ = -1;
        } else {
            this.actor.add_child(this._anchor);
        }

        this._content = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'wyraz-content',
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this._anchor.set_child(this._content);

        const H = this._cssH;
        this._kicker = new St.Label({
            style_class: 'wyraz-kicker',
            x_align: Clutter.ActorAlign.CENTER,
            style: `font-family: ${this._family}; font-size: ${Math.round(H * 0.0175)}px;` +
                `margin-bottom: ${Math.round(H * 0.018)}px;`,
        });
        this._word = new St.Label({
            style_class: 'wyraz-word',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._word.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._rule = new St.Widget({
            style_class: 'wyraz-rule',
            x_align: Clutter.ActorAlign.CENTER,
            style: `width: ${Math.round(H * 0.12)}px;` +
                `margin-top: ${Math.round(H * 0.02)}px; margin-bottom: ${Math.round(H * 0.032)}px;`,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this._definition = new St.Label({
            style_class: 'wyraz-definition',
            x_align: Clutter.ActorAlign.CENTER,
            width: this._quadMode
                ? Math.round(this._qw * 0.84)
                : Math.round(monitor.width * (style.defWidth ?? 0.64)),
        });
        const ct = this._definition.clutter_text;
        ct.line_wrap = true;
        ct.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        ct.ellipsize = Pango.EllipsizeMode.NONE;
        ct.line_alignment = Pango.Alignment.CENTER;

        for (const a of [this._kicker, this._word, this._rule, this._definition]) {
            a.opacity = 0;
            this._content.add_child(a);
        }

        this._footer = new St.Label({
            style_class: 'wyraz-footer',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
            style: `font-family: ${this._family}; font-size: ${Math.round(H * 0.016)}px;` +
                `margin-bottom: ${Math.round(H * (this._quadMode ? 0.025 : 0.045))}px;`,
            text: polishDate(),
        });
        if (this._quadMode) {
            this._quadBox.add_child(this._footer);
        } else {
            this.actor.add_child(this._footer);
        }
    }

    setTime(seconds) {
        this._time = seconds;
        this._bg?.setTime(seconds);
        if (this._quadMode && this._bg)
            this._followRed(this._bg.textQuadrant(seconds));
    }

    _placeQuad(q) {
        this._quadBox.set_position((q % 2) * this._qw, Math.floor(q / 2) * this._qh);
    }

    _followRed(q) {
        if (q === this._textQ || this._moving)
            return;
        if (this._textQ < 0) {
            this._textQ = q;
            this._placeQuad(q);
            this._quadBox.ease({opacity: 255, duration: 600, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            return;
        }
        this._moving = true;
        this._quadBox.ease({
            opacity: 0,
            duration: 700,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: () => {
                if (!this._quadBox)
                    return;
                this._textQ = q;
                this._placeQuad(q);
                this._quadBox.ease({
                    opacity: 255,
                    duration: 1100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onStopped: () => {
                        this._moving = false;
                    },
                });
            },
        });
    }

    setBlur(on) {
        if (!this._blur)
            return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.actor.remove_transition('@effects.wyraz-blur.radius');
        this.actor.remove_transition('@effects.wyraz-blur.brightness');
        this.actor.ease_property('@effects.wyraz-blur.radius', on ? Math.round(64 * scale) : 0, {
            duration: on ? 350 : 450,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.actor.ease_property('@effects.wyraz-blur.brightness', on ? 0.72 : 1.0, {
            duration: on ? 350 : 450,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    updateClock(text) {
        this._footer.text = text;
    }

    _applyEntry(entry, index, total) {
        const H = this._cssH;
        const W = this._cssW;
        const word = entry.w;
        const {wordScale, charWidth} = this._style;
        const boxW = this._quadMode ? W / 2 : W;
        const maxPx = this._quadMode ? H * wordScale * 0.72 : H * wordScale;
        const wordPx = Math.max(24, Math.min(maxPx,
            (boxW * 0.86) / (Math.max(word.length, 4) * charWidth)));
        this._word.style = `font-family: ${this._wordFamily}; font-size: ${Math.round(wordPx)}px;`;
        this._word.text = word;

        const text = formatDefinition(entry.d, 3, 220);
        let defScale = 0.034;
        if (text.length > 450)
            defScale = 0.022;
        else if (text.length > 300)
            defScale = 0.025;
        else if (text.length > 160)
            defScale = 0.029;
        if (this._quadMode)
            defScale *= 0.82;
        this._definition.style = `font-family: ${this._family}; font-size: ${Math.round(H * defScale)}px;`;
        this._definition.text = text;

        const label = entry.lang === 'en' ? 'WORD OF THE DAY' : 'SŁOWO DNIA';
        this._kicker.text = total > 1 ? `${label}  ·  ${index + 1} / ${total}` : label;

        const m = this.monitor;
        const drift = this._quadMode ? 0.4 : 1;
        this._anchor.translation_x = Math.round((Math.random() - 0.5) * 0.05 * drift * m.width);
        this._anchor.translation_y = Math.round((Math.random() - 0.5) * 0.04 * drift * m.height);

        if (this._quadMode) {
            this._content.set_scale(1, 1);
            const [, natH] = this._content.get_preferred_height(-1);
            const [, natW] = this._content.get_preferred_width(-1);
            const fit = Math.min(1, this._qh * 0.8 / Math.max(natH, 1),
                this._qw * 0.9 / Math.max(natW, 1));
            this._content.set_scale(fit, fit);
        }
    }

    present(entry, index, total, first, interval = 30) {
        const lift = Math.round(this.monitor.height * 0.022);
        let moveTo = -1;
        if (this._quadMode && this._bg?.nextWord) {
            this._bg.nextWord(interval);
            const q = this._bg.textQuadrant(this._time ?? 0);
            if (!first && !this._moving && this._textQ >= 0 && q !== this._textQ)
                moveTo = q;
        }
        const showNew = () => {
            if (!this._content)
                return;
            this._applyEntry(entry, index, total);
            this._content.opacity = 255;
            this._content.translation_y = 0;

            this._kicker.opacity = 0;
            this._kicker.ease({
                opacity: 170,
                delay: first ? 600 : 100,
                duration: WORD_IN_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });

            this._word.opacity = 0;
            this._word.translation_y = lift;
            this._word.ease({
                opacity: 255,
                translation_y: 0,
                delay: first ? 700 : 200,
                duration: WORD_IN_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });

            this._rule.opacity = 0;
            this._rule.scale_x = 0;
            this._rule.ease({
                opacity: 255,
                scale_x: 1,
                delay: first ? 1000 : 500,
                duration: 1200,
                mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
            });

            this._definition.opacity = 0;
            this._definition.translation_y = Math.round(lift * 0.6);
            this._definition.ease({
                opacity: 235,
                translation_y: 0,
                delay: first ? 1250 : 750,
                duration: WORD_IN_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        };

        if (first) {
            showNew();
            return;
        }
        if (moveTo >= 0) {
            this._moving = true;
            this._quadBox.ease({
                opacity: 0,
                duration: WORD_OUT_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onStopped: () => {
                    if (!this._quadBox)
                        return;
                    this._textQ = moveTo;
                    this._placeQuad(moveTo);
                    showNew();
                    this._quadBox.ease({
                        opacity: 255,
                        duration: 400,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        onStopped: () => {
                            this._moving = false;
                        },
                    });
                },
            });
            return;
        }
        this._content.ease({
            opacity: 0,
            translation_y: -lift,
            duration: WORD_OUT_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: () => showNew(),
        });
    }

    destroy() {
        this._content = null;
        this._quadBox = null;
        this._bg?.destroy();
        this._bg = null;
        this.actor.destroy();
    }
}

export class Screensaver {
    constructor({settings, store}) {
        this._settings = settings;
        this._store = store;
        this._root = null;
        this._views = [];
        this._grab = null;
        this._cursorHidden = false;
        this._frameId = 0;
        this._advanceId = 0;
        this._clockId = 0;
        this._activeWatchId = 0;
        this._showToken = 0;
        this._idleMonitor = global.backend.get_core_idle_monitor();
        this._cursorTracker = global.backend.get_cursor_tracker();
        this._prompt = null;
        this._current = null;
        this._fading = new Set();
        this.codeRequired = false;
        this._codeGuard = {fails: 0, lockedUntil: 0};

        this._settings.connectObject(
            'changed::unlock-code-enabled', () => this._syncCode(),
            'changed::unlock-code', () => this._syncCode(),
            this);
    }

    get visible() {
        return this._root !== null;
    }

    _counts() {
        return {
            pl: this._settings.get_int('words-per-day'),
            en: this._settings.get_int('words-per-day-en'),
        };
    }

    _wantsCode() {
        return this._settings.get_boolean('unlock-code-enabled') &&
            hasCode(this._settings.get_string('unlock-code')) &&
            !Main.sessionMode.isLocked;
    }

    _syncCode() {
        if (!this._root || !this.codeRequired)
            return;
        if (!this._wantsCode()) {
            this.codeRequired = false;
            this._prompt?.hide();
        }
    }

    async show() {
        if (this._root)
            return;
        const token = ++this._showToken;
        const count = this._counts();

        let item = null;
        try {
            item = await this._store.next(count);
        } catch (e) {
            console.error(`[Wyraz] Nie udało się przygotować haseł: ${e.message}`);
        }
        if (token !== this._showToken || this._root)
            return;
        if (!item)
            return;

        this.codeRequired = this._wantsCode();
        this._current = item;
        try {
            this._build();
            if (!this._startInput()) {
                console.warn('[Wyraz] Nie udało się przechwycić wejścia, pomijam wygaszacz');
                this.hide(true);
                return;
            }
        } catch (e) {
            console.error(`[Wyraz] Błąd przy uruchamianiu wygaszacza: ${e.message}`);
            this.hide(true);
            return;
        }

        this._startUs = GLib.get_monotonic_time();
        this._frameId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
            const t = (GLib.get_monotonic_time() - this._startUs) / 1e6;
            try {
                for (const v of this._views)
                    v.setTime(t);
            } catch (e) {
                if (!this._frameError)
                    console.error(`[Wyraz] Animacja: ${e.message}`);
                this._frameError = true;
            }
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._frameId, '[wyraz] frame');

        this._clockId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            const text = polishDate();
            for (const v of this._views)
                v.updateClock(text);
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._clockId, '[wyraz] clock');

        this._root.ease({
            opacity: 255,
            duration: FADE_IN_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._present(item, true);

        const interval = Math.max(5, this._settings.get_int('change-interval'));
        this._advanceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._advance();
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._advanceId, '[wyraz] advance');
    }

    _build() {
        this._root = new St.Widget({
            name: 'wyrazScreensaver',
            reactive: true,
            can_focus: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
            opacity: 0,
            style: 'background-color: #000;',
        });
        Main.layoutManager.addTopChrome(this._root);
        Main.uiGroup.set_child_above_sibling(this._root, null);
        this._buildViews();
    }

    _buildViews() {
        const styleName = this._settings.get_string('background-style');
        const style = getStyle(styleName);
        const userFont = this._settings.get_string('font-family');
        const fonts = {
            word: style.wordFont === 'renaissance'
                ? this._settings.get_string('renaissance-font')
                : style.wordFont ?? userFont,
            text: style.textFont === 'wroclove'
                ? this._settings.get_string('wroclove-text-font')
                : style.textFont ?? userFont,
        };

        for (const monitor of Main.layoutManager.monitors) {
            const view = new MonitorView(monitor, styleName, fonts);
            this._root.add_child(view.actor);
            this._views.push(view);
        }

        const primary = Main.layoutManager.primaryMonitor ?? Main.layoutManager.monitors[0];
        const generic = style.textGeneric ?? 'serif';
        this._prompt = new CodePrompt({
            parent: this._root,
            monitor: primary,
            family: cssFamily(fonts.text, generic),
            styleClass: `wyraz-code ${style.cssClass}`,
            guard: this._codeGuard,
            getStored: () => this._settings.get_string('unlock-code'),
            onSuccess: () => this.hide(),
            onShown: () => this._views.forEach(v => v.setBlur(true)),
            onHidden: () => {
                this._views.forEach(v => v.setBlur(false));
                this._armActiveWatch();
            },
        });
    }

    _destroyViews() {
        this._prompt?.destroy();
        this._prompt = null;
        for (const v of this._views)
            v.destroy();
        this._views = [];
    }

    rebuild() {
        if (!this._root)
            return;
        this._destroyViews();
        this._root.set_size(global.stage.width, global.stage.height);
        this._buildViews();
        if (this._current)
            this._present(this._current, true);
        this._armActiveWatch();
    }

    _startInput() {
        const [px, py] = global.get_pointer();
        this._pointerStart = [px, py];
        this._shownAt = GLib.get_monotonic_time();

        this._grab = Main.pushModal(this._root, {actionMode: Shell.ActionMode.NONE});
        this._root.connect('captured-event', (_actor, event) => {
            try {
                return this._onEvent(event);
            } catch (e) {
                console.error(`[Wyraz] ${e.message}`);
                this.hide(true);
                return Clutter.EVENT_STOP;
            }
        });
        const grab = this._grab;
        if (!grab || grab.is_revoked?.())
            return false;
        if (typeof grab.get_seat_state === 'function' && Clutter.GrabState &&
            (grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0)
            return false;
        this._root.grab_key_focus();

        this._cursorTracker.inhibit_cursor_visibility();
        this._cursorHidden = true;

        this._armActiveWatch();
        return true;
    }

    _armActiveWatch() {
        if (!this._root || this._activeWatchId)
            return;
        this._activeWatchId = this._idleMonitor.add_user_active_watch(() => {
            this._activeWatchId = 0;
            if (this.codeRequired)
                this._prompt?.show();
            else
                this.hide();
        });
    }

    _onEvent(event) {
        if (this.codeRequired)
            return this._onCodeEvent(event);

        switch (event.type()) {
        case Clutter.EventType.KEY_PRESS:
        case Clutter.EventType.BUTTON_PRESS:
        case Clutter.EventType.SCROLL:
        case Clutter.EventType.TOUCH_BEGIN:
        case Clutter.EventType.TOUCHPAD_SWIPE:
        case Clutter.EventType.TOUCHPAD_PINCH:
        case Clutter.EventType.PAD_BUTTON_PRESS:
            this.hide();
            break;
        case Clutter.EventType.MOTION:
            if (this._movedEnough(event))
                this.hide();
            break;
        default:
            break;
        }
        return Clutter.EVENT_STOP;
    }

    _onCodeEvent(event) {
        switch (event.type()) {
        case Clutter.EventType.KEY_PRESS:
            this._prompt?.handleKey(event);
            break;
        case Clutter.EventType.BUTTON_PRESS:
        case Clutter.EventType.SCROLL:
        case Clutter.EventType.TOUCH_BEGIN:
        case Clutter.EventType.TOUCHPAD_SWIPE:
        case Clutter.EventType.TOUCHPAD_PINCH:
        case Clutter.EventType.PAD_BUTTON_PRESS:
            this._prompt?.show();
            break;
        case Clutter.EventType.MOTION:
            if (this._movedEnough(event))
                this._prompt?.show();
            break;
        default:
            break;
        }
        return Clutter.EVENT_STOP;
    }

    _movedEnough(event) {
        if (GLib.get_monotonic_time() - this._shownAt < MOTION_GRACE_MS * 1000)
            return false;
        const [x, y] = event.get_coords();
        const [sx, sy] = this._pointerStart;
        return Math.abs(x - sx) > MOTION_THRESHOLD || Math.abs(y - sy) > MOTION_THRESHOLD;
    }

    async _advance() {
        if (!this._root)
            return;
        const token = this._showToken;
        let item = null;
        try {
            item = await this._store.next(this._counts());
        } catch (e) {
            console.error(`[Wyraz] ${e.message}`);
        }
        if (item && this._root && token === this._showToken) {
            this._current = item;
            this._present(item, false);
        }
    }

    _present(item, first) {
        const interval = Math.max(5, this._settings.get_int('change-interval'));
        for (const v of this._views)
            v.present(item.entry, item.index, item.total, first, interval);
    }

    hide(immediate = false) {
        this._showToken++;
        if (!this._root)
            return;

        for (const id of [this._frameId, this._advanceId, this._clockId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._frameId = this._advanceId = this._clockId = 0;

        if (this._activeWatchId) {
            this._idleMonitor.remove_watch(this._activeWatchId);
            this._activeWatchId = 0;
        }

        if (this._grab) {
            try {
                Main.popModal(this._grab);
            } catch (e) {
                console.warn(`[Wyraz] popModal: ${e.message}`);
            }
            this._grab = null;
        }

        if (this._cursorHidden) {
            this._cursorTracker.uninhibit_cursor_visibility();
            this._cursorHidden = false;
        }

        const root = this._root;
        const views = this._views;
        const prompt = this._prompt;
        this._root = null;
        this._views = [];
        this._prompt = null;
        this._current = null;
        this.codeRequired = false;
        root.reactive = false;

        const finish = () => {
            if (!this._fading.delete(finish))
                return;
            prompt?.destroy();
            for (const v of views)
                v.destroy();
            root.destroy();
        };
        this._fading.add(finish);
        root.remove_all_transitions();
        if (immediate) {
            finish();
        } else {
            root.ease({
                opacity: 0,
                duration: FADE_OUT_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: finish,
            });
        }

        this._store.save().catch(() => {});
    }

    destroy() {
        this.hide(true);
        for (const finish of [...this._fading])
            finish();
        this._settings?.disconnectObject(this);
        this._store = null;
        this._settings = null;
    }
}
