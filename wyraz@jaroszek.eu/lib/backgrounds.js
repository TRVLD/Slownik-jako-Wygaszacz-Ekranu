import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {LublinBackground} from './lublinBackground.js';
import {WroclawBackground} from './wroclawBackground.js';

import {AURORA_CODE, COMMON_DECLARATIONS, OCEAN_CODE} from './shaders.js';

const BackgroundEffectBase = GObject.registerClass({
    GTypeFlags: GObject.TypeFlags.ABSTRACT,
}, class BackgroundEffectBase extends Shell.GLSLEffect {
    _init(params = {}) {
        super._init();
        this._timeLoc = this.get_uniform_location('time');
        this._resLoc = this.get_uniform_location('resolution');
        this._originLoc = this.get_uniform_location('origin');
        this._darkenLoc = this.get_uniform_location('darken');
        this.setGeometry(params.width ?? 1920, params.height ?? 1080,
            params.x ?? 0, params.y ?? 0);
        this.setDarken(params.darken ?? 0.3);
        this.set_uniform_float(this._timeLoc, 1, [0]);
    }

    setGeometry(width, height, x, y) {
        this.set_uniform_float(this._resLoc, 2, [Math.max(width, 1), Math.max(height, 1)]);
        this.set_uniform_float(this._originLoc, 2, [x, y]);
    }

    setDarken(value) {
        this.set_uniform_float(this._darkenLoc, 1, [value]);
    }

    setTime(seconds) {
        this.set_uniform_float(this._timeLoc, 1, [seconds]);
        this.queue_repaint();
    }
});

const AuroraEffect = GObject.registerClass(
class AuroraEffect extends BackgroundEffectBase {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT,
            COMMON_DECLARATIONS, AURORA_CODE, true);
    }
});

const OceanEffect = GObject.registerClass(
class OceanEffect extends BackgroundEffectBase {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT,
            COMMON_DECLARATIONS, OCEAN_CODE, true);
    }
});

class ShaderBackground {
    constructor(style, monitor) {
        this.actor = new St.Widget({
            x_expand: true,
            y_expand: true,
            style: 'background-color: #000;',
        });
        this._effect = null;
        try {
            this._effect = new style.effect({
                width: monitor.width,
                height: monitor.height,
                x: monitor.x,
                y: monitor.y,
                darken: 0.32,
            });
            this.actor.add_effect(this._effect);
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
