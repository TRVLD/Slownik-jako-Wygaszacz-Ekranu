/**
 * unlockCode.js: kod zamykający wygaszacz.
 *
 * Kod to od 1 do 6 liter alfabetu łacińskiego (A–Z, a–z) albo cyfr.
 * Nie jest hasłem do konta ani zabezpieczeniem sesji: chroni tylko przed
 * przypadkowym zamknięciem wygaszacza (np. przez dziecko albo kota na
 * klawiaturze). Prawdziwą blokadę zapewnia ekran blokady GNOME.
 */
import GLib from 'gi://GLib';

// W ustawieniach zapisywany jest tylko skrót SHA-256 z losową solą
// („sól$skrót”), nigdy sam kod. Sól sprawia, że ten sam kod na dwóch
// komputerach daje inny zapis.

// Największa długość kodu; tyle kratek pokazuje zawsze pole kodu.
export const MAX_LENGTH = 6;
// Wzorzec poprawnego kodu.
const VALID = /^[A-Za-z0-9]{1,6}$/;

/**
 * @param {string} code kod wpisany w ustawieniach
 * @returns {boolean} czy ma od 1 do 6 dozwolonych znaków
 */
export function isValidCode(code) {
    return VALID.test(code);
}

/**
 * Czy znak z klawiatury może należeć do kodu. Pozostałe klawisze (spacja,
 * znaki diakrytyczne, symbole) pole kodu pomija.
 *
 * @param {string} ch znak Unicode z get_key_unicode()
 * @returns {boolean}
 */
export function isCodeChar(ch) {
    return typeof ch === 'string' && /^[A-Za-z0-9]$/.test(ch);
}

/**
 * Skrót SHA-256 z tekstu „sól:kod” zapisany szesnastkowo (64 znaki).
 *
 * @param {string} salt 16 znaków szesnastkowych
 * @param {string} code
 * @returns {string}
 */
function digest(salt, code) {
    return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, `${salt}:${code}`, -1);
}

/**
 * Tworzy zapis kodu: 16 losowych znaków soli, znak „$” i skrót.
 *
 * @param {string} code
 * @returns {string} wartość do zapisania w ustawieniu unlock-code
 * @throws {Error} gdy kod jest niepoprawny
 */
export function makeStored(code) {
    if (!isValidCode(code))
        throw new Error('Kod musi mieć od 1 do 6 liter lub cyfr');
    const salt = GLib.uuid_string_random().replace(/-/g, '').slice(0, 16);
    return `${salt}$${digest(salt, code)}`;
}

/**
 * Czy ustawienie zawiera zapisany kod w poprawnej postaci. Pusty tekst
 * (domyślny) oznacza brak kodu: wygaszacz znika po dowolnym klawiszu.
 *
 * @param {string} stored wartość ustawienia unlock-code
 * @returns {boolean}
 */
export function hasCode(stored) {
    return typeof stored === 'string' && /^[0-9a-f]{16}\$[0-9a-f]{64}$/.test(stored);
}

/**
 * Sprawdza wpisany kod: liczy skrót z solą z zapisu i porównuje.
 *
 * @param {string} stored wartość ustawienia unlock-code
 * @param {string} input znaki wpisane w polu kodu
 * @returns {boolean} true tylko dla poprawnego kodu
 */
export function verify(stored, input) {
    if (!hasCode(stored) || !isValidCode(input))
        return false;
    const [salt, hash] = stored.split('$');
    return digest(salt, input) === hash;
}
