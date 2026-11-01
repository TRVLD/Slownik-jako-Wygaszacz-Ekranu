import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    LANGS, dayKey, indexDatabase, needsPlanningMulti, normalizeCounts, normalizeMulti,
    planDayMulti, resetToday,
} from './selection.js';

const DATA_FILES = {pl: 'words.tsv', en: 'words-en.tsv'};

function loadBytes(file) {
    return new Promise((resolve, reject) => {
        file.load_contents_async(null, (f, res) => {
            try {
                const [, contents] = f.load_contents_finish(res);
                resolve(contents);
            } catch (e) {
                reject(e);
            }
        });
    });
}

function replaceContents(file, bytes) {
    return new Promise((resolve, reject) => {
        file.replace_contents_bytes_async(new GLib.Bytes(bytes), null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
                try {
                    f.replace_contents_finish(res);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
    });
}

export class WordStore {
    constructor(extensionPath) {
        this._dataFiles = {};
        for (const l of LANGS) {
            this._dataFiles[l] = Gio.File.new_for_path(
                GLib.build_filenamev([extensionPath, 'data', DATA_FILES[l]]));
        }
        const dir = GLib.build_filenamev([GLib.get_user_data_dir(), 'wyraz-screensaver']);
        this._stateDir = Gio.File.new_for_path(dir);
        this._stateFile = this._stateDir.get_child('state.json');
        this._state = null;
        this._dirty = false;
        this._decoder = new TextDecoder('utf-8');
        this._encoder = new TextEncoder();
        this._busy = null;
    }

    async _loadState() {
        if (this._state)
            return;
        try {
            const bytes = await loadBytes(this._stateFile);
            this._state = normalizeMulti(JSON.parse(this._decoder.decode(bytes)));
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                console.warn(`[Wyraz] Nie udało się odczytać stanu: ${e.message}`);
            this._state = normalizeMulti(null);
        }
    }

    async save() {
        if (!this._state || !this._dirty)
            return;
        this._dirty = false;
        try {
            this._stateDir.make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                console.warn(`[Wyraz] Nie można utworzyć katalogu stanu: ${e.message}`);
        }
        try {
            const json = JSON.stringify(this._state);
            await replaceContents(this._stateFile, this._encoder.encode(json));
        } catch (e) {
            this._dirty = true;
            console.warn(`[Wyraz] Nie udało się zapisać stanu: ${e.message}`);
        }
    }

    async _openDatabase(lang) {
        try {
            const bytes = await loadBytes(this._dataFiles[lang]);
            return indexDatabase(bytes, this._decoder);
        } catch (e) {
            console.warn(`[Wyraz] Brak bazy haseł ${lang}: ${e.message}`);
            return null;
        }
    }

    async ensureToday(counts) {
        while (this._busy)
            await this._busy;
        this._busy = this._ensureToday(normalizeCounts(counts));
        try {
            return await this._busy;
        } finally {
            this._busy = null;
        }
    }

    async _ensureToday(counts) {
        await this._loadState();
        const today = dayKey();
        if (needsPlanningMulti(this._state, today, counts)) {
            const dbs = {};
            for (const l of LANGS) {
                if (counts[l] > 0)
                    dbs[l] = await this._openDatabase(l);
            }
            this._state = planDayMulti(this._state, today, counts, dbs);
            this._dirty = true;
            await this.save();
        }
        return this._state.today;
    }

    async resetToday() {
        while (this._busy)
            await this._busy;
        await this._loadState();
        this._state = resetToday(this._state);
        this._dirty = true;
        await this.save();
    }

    async next(counts) {
        const list = await this.ensureToday(counts);
        if (list.length === 0)
            return null;
        const index = this._state.cursor % list.length;
        this._state.cursor = (index + 1) % list.length;
        this._dirty = true;
        return {entry: list[index], index, total: list.length};
    }

    destroy() {
        this.save().catch(() => {});
        this._state = null;
    }
}
