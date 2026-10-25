import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Screensaver} from './lib/screensaver.js';
import {WordStore} from './lib/wordStore.js';

const INHIBIT_IDLE = 8;
const INHIBIT_POLL_S = 30;
const PREVIEW_IDLE_MS = 1500;
const PREVIEW_TIMEOUT_MS = 20000;

function isIdleInhibited() {
    return new Promise(resolve => {
        Gio.DBus.session.call(
            'org.gnome.SessionManager',
            '/org/gnome/SessionManager',
            'org.gnome.SessionManager',
            'IsInhibited',
            new GLib.Variant('(u)', [INHIBIT_IDLE]),
            new GLib.VariantType('(b)'),
            Gio.DBusCallFlags.NONE,
            2000,
            null,
            (conn, res) => {
                try {
                    const [inhibited] = conn.call_finish(res).deepUnpack();
                    resolve(inhibited);
                } catch {
                    resolve(false);
                }
            });
    });
}

export default class WyrazExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._store = new WordStore(this.path);
        this._screensaver = new Screensaver({settings: this._settings, store: this._store});
        this._idleMonitor = global.backend.get_core_idle_monitor();
        this._idleWatchId = 0;
        this._pollId = 0;
        this._previewId = 0;

        this._settings.connectObject(
            'changed::idle-minutes', () => this._armIdleWatch(),
            'changed::preview-request', () => this._startPreview(),
            'changed::reset-today-request', () => {
                const counts = {
                    pl: this._settings.get_int('words-per-day'),
                    en: this._settings.get_int('words-per-day-en'),
                };
                this._store?.resetToday()
                    .then(() => this._store?.ensureToday(counts))
                    .catch(e => console.error(`[Wyraz] ${e.message}`));
            },
            this);
        Main.screenShield?.connectObject(
            'active-changed', () => this._onShieldActiveChanged(),
            'locked-changed', () => this._onLockedChanged(),
            this);
        Main.layoutManager.connectObject('monitors-changed',
            () => this._screensaver.rebuild(), this);

        this._armIdleWatch();
    }

    disable() {
        this._settings?.disconnectObject(this);
        Main.screenShield?.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);

        if (this._idleWatchId) {
            this._idleMonitor.remove_watch(this._idleWatchId);
            this._idleWatchId = 0;
        }
        this._stopInhibitPoll();
        this._stopPreview();

        this._screensaver?.destroy();
        this._screensaver = null;
        this._store?.destroy();
        this._store = null;
        this._idleMonitor = null;
        this._settings = null;
    }

    _thresholdMs() {
        return Math.max(1, this._settings.get_int('idle-minutes')) * 60 * 1000;
    }

    _armIdleWatch() {
        if (this._idleWatchId)
            this._idleMonitor.remove_watch(this._idleWatchId);
        this._idleWatchId = this._idleMonitor.add_idle_watch(this._thresholdMs(),
            () => this._onIdle().catch(e => console.error(`[Wyraz] ${e.message}`)));
    }

    _canShowNow() {
        if (Main.sessionMode.isLocked)
            return this._settings.get_boolean('show-on-lock-screen');
        const {currentMode, parentMode} = Main.sessionMode;
        if (currentMode !== 'user' && parentMode !== 'user')
            return false;
        return !Main.screenShield?.active;
    }

    async _onIdle() {
        if (!this._screensaver || this._screensaver.visible || !this._canShowNow())
            return;

        if (this._settings.get_boolean('respect-inhibitors') && await isIdleInhibited()) {
            this._startInhibitPoll();
            return;
        }

        if (!this._screensaver || !this._canShowNow() ||
            this._idleMonitor.get_idletime() < this._thresholdMs() - 1000)
            return;
        await this._screensaver.show();
    }

    _startInhibitPoll() {
        if (this._pollId)
            return;
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, INHIBIT_POLL_S, () => {
            if (!this._idleMonitor || this._idleMonitor.get_idletime() < this._thresholdMs()) {
                this._pollId = 0;
                return GLib.SOURCE_REMOVE;
            }
            isIdleInhibited().then(inhibited => {
                if (inhibited || !this._pollId)
                    return;
                this._stopInhibitPoll();
                if (this._screensaver && !this._screensaver.visible && this._canShowNow())
                    this._screensaver.show().catch(e => console.error(`[Wyraz] ${e.message}`));
            });
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._pollId, '[wyraz] inhibit poll');
    }

    _stopInhibitPoll() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
    }

    _startPreview() {
        this._stopPreview();
        if (Main.sessionMode.isLocked || !this._screensaver || this._screensaver.visible)
            return;
        const started = GLib.get_monotonic_time();
        this._previewId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            if ((GLib.get_monotonic_time() - started) / 1000 > PREVIEW_TIMEOUT_MS) {
                this._previewId = 0;
                return GLib.SOURCE_REMOVE;
            }
            if (this._idleMonitor.get_idletime() < PREVIEW_IDLE_MS)
                return GLib.SOURCE_CONTINUE;
            this._previewId = 0;
            this._screensaver?.show().catch(e => console.error(`[Wyraz] ${e.message}`));
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._previewId, '[wyraz] preview');
    }

    _stopPreview() {
        if (this._previewId) {
            GLib.source_remove(this._previewId);
            this._previewId = 0;
        }
    }

    _onShieldActiveChanged() {
        if (!Main.screenShield?.active || !this._screensaver)
            return;
        if (this._screensaver.codeRequired && !Main.sessionMode.isLocked)
            return;
        this._screensaver.hide(true);
    }

    _onLockedChanged() {
        if (Main.screenShield?.locked)
            this._screensaver?.hide(true);
    }
}
