import GLib from 'gi://GLib';

export const MAX_LENGTH = 6;
const VALID = /^[A-Za-z0-9]{1,6}$/;

export function isValidCode(code) {
    return VALID.test(code);
}

export function isCodeChar(ch) {
    return typeof ch === 'string' && /^[A-Za-z0-9]$/.test(ch);
}

function digest(salt, code) {
    return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, `${salt}:${code}`, -1);
}

export function makeStored(code) {
    if (!isValidCode(code))
        throw new Error('Kod musi mieć od 1 do 6 liter lub cyfr');
    const salt = GLib.uuid_string_random().replace(/-/g, '').slice(0, 16);
    return `${salt}$${digest(salt, code)}`;
}

export function hasCode(stored) {
    return typeof stored === 'string' && /^[0-9a-f]{16}\$[0-9a-f]{64}$/.test(stored);
}

export function verify(stored, input) {
    if (!hasCode(stored) || !isValidCode(input))
        return false;
    const [salt, hash] = stored.split('$');
    return digest(salt, input) === hash;
}
