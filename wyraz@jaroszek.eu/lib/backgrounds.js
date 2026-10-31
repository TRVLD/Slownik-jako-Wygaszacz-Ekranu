import St from 'gi://St';

import {LublinBackground} from './lublinBackground.js';
import {ShaderEffect} from './shaderEffect.js';
import {WroclawBackground} from './wroclawBackground.js';

import {AURORA_CODE, COMMON_DECLARATIONS, OCEAN_CODE} from './shaders.js';

class BackgroundEffect {
    constructor(key, code, params = {}) {
        this._shader = new ShaderEffect(key, COMMON_DECLARATIONS, code);
        this.effect = this._shader.effect;
        this.setGeometry(params.width ?? 1920, params.height ?? 1080,
            params.x ?? 0, params.y ?? 0);
        this.setDarken(params.darken ?? 0.3);
        this._shader.setFloat('time', [0]);
    }

    setGeometry(width, height, x, y) {
        this._shader.setFloat('resolution', [Math.max(width, 1), Math.max(height, 1)]);
        this._shader.setFloat('origin', [x, y]);
    }

    setDarken(value) {
        this._shader.setFloat('darken', [value]);
    }

    setTime(seconds) {
        this._shader.setFloat('time', [seconds]);
        this._shader.queueRepaint();
    }
}

const AuroraEffect = params => new BackgroundEffect('Aurora', AURORA_CODE, params);
const OceanEffect = params => new BackgroundEffect('Ocean', OCEAN_CODE, params);

class ShaderBackground {
    constructor(style, monitor) {
        this.actor = new St.Widget({
            x_expand: true,
            y_expand: true,
            style: 'background-color: #000;',
        });
        this._effect = null;
        try {
            this._effect = style.effect({
                width: monitor.width,
                height: monitor.height,
                x: monitor.x,
                y: monitor.y,
                darken: 0.32,
            });
            this.actor.add_effect(this._effect.effect);
        } catch (e) {
            console.warn(`[Wyraz] Shader niedostępny, używam gradientu: ${e.message}`);
            this.actor.style = style.fallback;
        }
    }

    setTime(seconds) {
        this._effect?.setTime(seconds);
    }

    destroy() {
        this._effect = null;
        this.actor.destroy();
    }
}

export const STYLES = {
    aurora: {
        effect: AuroraEffect,
        cssClass: 'wyraz-aurora',
        fallback: 'background-gradient-direction: vertical;' +
            'background-gradient-start: #020617; background-gradient-end: #06302a;',
        wordFont: null,
        textFont: null,
        wordScale: 0.13,
        charWidth: 0.56,
    },
    ocean: {
        effect: OceanEffect,
        cssClass: 'wyraz-ocean',
        fallback: 'background-gradient-direction: vertical;' +
            'background-gradient-start: #0b4d66; background-gradient-end: #010814;',
        wordFont: null,
        textFont: null,
        wordScale: 0.13,
        charWidth: 0.56,
    },
    lublin: {
        cssClass: 'wyraz-lublin',
        create: monitor => new LublinBackground(monitor),
        wordFont: 'renaissance',
        textFont: 'Exo 2',
        wordGeneric: 'serif',
        textGeneric: 'sans-serif',
        wordScale: 0.16,
        charWidth: 0.42,
    },
    wroclove: {
        cssClass: 'wyraz-wroclove',
        create: monitor => new WroclawBackground(monitor, {wordFont: 'Crimson Text'}),
        wordFont: 'Crimson Text',
        textFont: 'wroclove',
        wordGeneric: 'serif',
        textGeneric: 'sans-serif',
        wordScale: 0.11,
        charWidth: 0.52,
        defWidth: 0.5,
    },
};

export function getStyle(name) {
    return STYLES[name] ?? STYLES.aurora;
}

export function createBackground(name, monitor) {
    const style = getStyle(name);
    if (style.create) {
        try {
            return style.create(monitor);
        } catch (e) {
            console.error(`[Wyraz] Tło ${name}: ${e.message}`);
            return new ShaderBackground(STYLES.aurora, monitor);
        }
    }
    return new ShaderBackground(style, monitor);
}
