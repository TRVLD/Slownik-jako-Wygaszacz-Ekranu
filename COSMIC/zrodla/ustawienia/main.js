/**
 * main.js: okno ustawień „Słownik jako Wygaszacz Ekranu” dla COSMIC.
 *
 * Samodzielna aplikacja libadwaita (Flatpak eu.jaroszek.Wyraz), która
 * pokazuje to samo okno ustawień co wtyczka dla GNOME (prefs.js).
 * Uruchamiana poleceniem `wyraz-ustawienia` albo z menu aplikacji
 * i z menu apletu w panelu.
 */
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import System from 'system';

import WyrazPreferences from './prefs.js';
import {VERSION} from './lib/credits.js';

// Katalog danych programu (hasła): ustawia go skrypt wyraz-ustawienia
// (/usr/share/wyraz w pakiecie .deb, /app/share/wyraz we Flatpaku).
const DATA_DIR = GLib.getenv('WYRAZ_DATA_DIR') ?? '/app/share/wyraz';

const app = new Adw.Application({
    application_id: 'eu.jaroszek.Wyraz',
    flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
});

app.connect('activate', () => {
    let win = app.get_active_window();
    if (!win) {
        win = new Adw.PreferencesWindow({application: app, search_enabled: false});
        const prefs = new WyrazPreferences({
            path: DATA_DIR,
            metadata: {'version-name': VERSION},
            settings: new Gio.Settings({schema_id: 'eu.jaroszek.Wyraz'}),
        });
        prefs.fillPreferencesWindow(win);
        win.set_icon_name('eu.jaroszek.Wyraz');
    }
    win.present();
});

// Gtk musi być zainicjowany przed utworzeniem okna (robi to Adw.Application).
void Gtk;
app.run([System.programInvocationName, ...ARGV]);
