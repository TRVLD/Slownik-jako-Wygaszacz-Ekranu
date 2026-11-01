/**
 * cosmic.js: ustawienia COSMIC, z których korzysta okno ustawień.
 *
 * cosmic-idle wyłącza ekran po czasie zapisanym w pliku
 * ~/.config/cosmic/com.system76.CosmicIdle/v1/screen_off_time
 * (format RON: „Some(900000)” w milisekundach albo „None”). Domyślnie,
 * gdy pliku nie ma, ekran gaśnie po 15 minutach.
 *
 * Flatpak ma do tego katalogu dostęp tylko do odczytu, a do katalogu
 * com.system76.CosmicIdle także do zapisu (przycisk „Wydłuż”).
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const IDLE_DIR = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'cosmic',
    'com.system76.CosmicIdle', 'v1']);
const SCREEN_OFF = GLib.build_filenamev([IDLE_DIR, 'screen_off_time']);
const DEFAULT_MS = 15 * 60 * 1000;

export const COSMIC = {
    /**
     * @returns {?number} czas do wyłączenia ekranu (ms) albo null, gdy wyłączone
     */
    screenOffMs() {
        try {
            const [ok, bytes] = GLib.file_get_contents(SCREEN_OFF);
            if (!ok)
                return DEFAULT_MS;
            const text = new TextDecoder().decode(bytes).trim();
            if (text === 'None')
                return null;
            const m = /^Some\((\d+)\)$/.exec(text);
            return m ? Number(m[1]) : DEFAULT_MS;
        } catch {
            return DEFAULT_MS;
        }
    },

    /**
     * @param {number} ms nowy czas do wyłączenia ekranu
     * @returns {boolean} czy zapis się udał
     */
    setScreenOffMs(ms) {
        try {
            GLib.mkdir_with_parents(IDLE_DIR, 0o755);
            GLib.file_set_contents(SCREEN_OFF, `Some(${Math.round(ms)})`);
            return true;
        } catch (e) {
            console.warn(`[Wyraz] Nie można zapisać ${SCREEN_OFF}: ${e.message}`);
            return false;
        }
    },

    /**
     * Obserwuje plik ustawienia (zmiany z Ustawień COSMIC → Zasilanie).
     *
     * @param {Function} callback
     * @returns {?Gio.FileMonitor}
     */
    monitorIdle(callback) {
        try {
            const monitor = Gio.File.new_for_path(SCREEN_OFF)
                .monitor_file(Gio.FileMonitorFlags.NONE, null);
            monitor.connect('changed', () => callback());
            return monitor;
        } catch {
            return null;
        }
    },
};
