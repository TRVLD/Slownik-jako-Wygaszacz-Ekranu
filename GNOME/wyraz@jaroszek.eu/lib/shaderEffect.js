import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

const LEGACY = typeof Shell.GLSLEffect === 'function';
const classes = new Map();
const snippets = new Map();

function legacyClass(key, declarations, code) {
    let klass = classes.get(key);
    if (!klass) {
        let name = `WyrazShader${key}`;
        for (let i = 2; GObject.type_from_name(name); i++)
            name = `WyrazShader${key}${i}`;
        klass = GObject.registerClass({GTypeName: name},
            class extends Shell.GLSLEffect {
                vfunc_build_pipeline() {
                    this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, declarations, code, true);
                }
            });
        classes.set(key, klass);
    }
    return klass;
}

function snippetFor(key, declarations, code) {
    let snippet = snippets.get(key);
    if (!snippet) {
        snippet = Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, declarations, null);
        snippet.set_replace(code);
        snippets.set(key, snippet);
    }
    return snippet;
}

export class ShaderEffect {
    constructor(key, declarations, code) {
        if (LEGACY) {
            const Klass = legacyClass(key, declarations, code);
            this.effect = new Klass();
            this._locations = new Map();
        } else {
            this.effect = Clutter.ShaderEffect.new_with_snippet(
                snippetFor(key, declarations, code));
        }
    }

    setFloat(name, values) {
        if (LEGACY) {
            let loc = this._locations.get(name);
            if (loc === undefined) {
                loc = this.effect.get_uniform_location(name);
                this._locations.set(name, loc);
            }
            this.effect.set_uniform_float(loc, values.length, values);
        } else {
            this.effect.set_uniform_float(name, values.length, values);
        }
    }

    queueRepaint() {
        this.effect.queue_repaint();
    }
}
