import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {MAX_LENGTH, isCodeChar, verify} from './unlockCode.js';

const IDLE_HIDE_S = 12;
const MAX_FAILS = 5;
const LOCKOUT_S = 30;

export class CodePrompt {
    constructor({parent, monitor, family, styleClass, guard, getStored, onSuccess, onShown, onHidden}) {
        this._getStored = getStored;
        this._onSuccess = onSuccess;
        this._onHidden = onHidden;
        this._onShown = onShown;
        this._input = '';
        this._guard = guard ?? {fails: 0, lockedUntil: 0};
        this._hideId = 0;
        this._tickId = 0;
        this.visible = false;

        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const H = monitor.height / scale;

        this.actor = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            opacity: 0,
            visible: false,
            style_class: styleClass,
        });

        this._box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
            style_class: 'wyraz-code-box',
            style: `font-family: ${family};` +
                `margin-bottom: ${Math.round(H * 0.12)}px;` +
                `padding: ${Math.round(H * 0.022)}px ${Math.round(H * 0.04)}px;`,
        });
        this.actor.add_child(this._box);

        this._title = new St.Label({
            text: 'Wpisz kod, aby odblokować',
            style_class: 'wyraz-code-title',
            x_align: Clutter.ActorAlign.CENTER,
            style: `font-size: ${Math.round(H * 0.019)}px; margin-bottom: ${Math.round(H * 0.016)}px;`,
        });
        this._box.add_child(this._title);

        const slotsRow = new St.BoxLayout({x_align: Clutter.ActorAlign.CENTER});
        this._slots = [];
        const slot = Math.round(H * 0.042);
        for (let i = 0; i < MAX_LENGTH; i++) {
            const glyph = new St.Label({
                text: '',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style: `font-size: ${Math.round(slot * 0.6)}px;`,
            });
            const s = new St.Bin({
                child: glyph,
                style_class: 'wyraz-code-slot',
                style: `width: ${slot}px; height: ${slot}px;` +
                    `margin: 0 ${Math.round(slot * 0.14)}px;`,
            });
            s._glyph = glyph;
            slotsRow.add_child(s);
            this._slots.push(s);
        }
        this._box.add_child(slotsRow);

        this._message = new St.Label({
            text: ' ',
            style_class: 'wyraz-code-message',
            x_align: Clutter.ActorAlign.CENTER,
            style: `font-size: ${Math.round(H * 0.015)}px; margin-top: ${Math.round(H * 0.014)}px;`,
        });
        this._box.add_child(this._message);

        parent.add_child(this.actor);
    }

    show() {
        this._armHide();
        if (this.visible)
            return;
        this.visible = true;
        this.actor.visible = true;
        this._onShown?.();
        this.actor.remove_all_transitions();
        this.actor.ease({
            opacity: 255,
            duration: 220,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._render();
        if (this._lockedRemaining() > 0 && !this._tickId)
            this._startCountdown();
    }

    hide() {
        this._clearTimer('_hideId');
        if (!this.visible)
            return;
        this.visible = false;
        this._input = '';
        this._render();
        this.actor.remove_all_transitions();
        this.actor.ease({
            opacity: 0,
            duration: 300,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (!this.visible && this.actor)
                    this.actor.visible = false;
            },
        });
        this._onHidden?.();
    }

    handleKey(event) {
        this.show();
        if (this._lockedRemaining() > 0)
            return;

        const sym = event.get_key_symbol();
        if (sym === Clutter.KEY_Escape) {
            this.hide();
            return;
        }
        if (sym === Clutter.KEY_BackSpace) {
            this._input = this._input.slice(0, -1);
            this._message.text = ' ';
            this._render();
            return;
        }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter || sym === Clutter.KEY_ISO_Enter) {
            this._submit();
            return;
        }
        const ch = event.get_key_unicode();
        if (isCodeChar(ch) && this._input.length < MAX_LENGTH) {
            this._input += ch;
            this._message.text = ' ';
            this._render();
            if (this._input.length === MAX_LENGTH)
                this._submit();
        }
    }

    _submit() {
        if (this._input.length === 0)
            return;
        if (verify(this._getStored(), this._input)) {
            this._input = '';
            this._guard.fails = 0;
            this._onSuccess();
            return;
        }
        this._guard.fails++;
        this._input = '';
        this._render();
        this._shake();
        if (this._guard.fails >= MAX_FAILS) {
            this._guard.fails = 0;
            this._guard.lockedUntil = GLib.get_monotonic_time() + LOCKOUT_S * 1e6;
            this._startCountdown();
        } else {
            this._message.text = 'Nieprawidłowy kod';
        }
    }

    _lockedRemaining() {
        return Math.max(0, Math.ceil((this._guard.lockedUntil - GLib.get_monotonic_time()) / 1e6));
    }

    _startCountdown() {
        this._clearTimer('_tickId');
        const update = () => {
            const left = this._lockedRemaining();
            this._message.text = left > 0 ? `Zbyt wiele prób, spróbuj za ${left} s` : ' ';
            this._armHide();
            if (left > 0)
                return GLib.SOURCE_CONTINUE;
            this._tickId = 0;
            return GLib.SOURCE_REMOVE;
        };
        update();
        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, update);
        GLib.Source.set_name_by_id(this._tickId, '[wyraz] code lockout');
    }

    _shake() {
        const d = Math.round(this.actor.height * 0.012);
        this._box.remove_all_transitions();
        this._box.translation_x = 0;
        const steps = [d, -d, d * 0.6, -d * 0.6, 0];
        const next = i => {
            if (i >= steps.length || !this._box)
                return;
            this._box.ease({
                translation_x: steps[i],
                duration: 55,
                mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                onComplete: () => next(i + 1),
            });
        };
        next(0);
    }

    _render() {
        this._slots.forEach((s, i) => {
            const filled = i < this._input.length;
            s._glyph.text = filled ? '•' : '';
            if (filled)
                s.add_style_class_name('filled');
            else
                s.remove_style_class_name('filled');
        });
    }

    _armHide() {
        this._clearTimer('_hideId');
        this._hideId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, IDLE_HIDE_S, () => {
            this._hideId = 0;
            if (this._lockedRemaining() === 0)
                this.hide();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._hideId, '[wyraz] code hide');
    }

    _clearTimer(name) {
        if (this[name]) {
            GLib.source_remove(this[name]);
            this[name] = 0;
        }
    }

    destroy() {
        this._clearTimer('_hideId');
        this._clearTimer('_tickId');
        this._onHidden = null;
        this._onShown = null;
        this.actor.destroy();
        this.actor = null;
        this._box = null;
    }
}
