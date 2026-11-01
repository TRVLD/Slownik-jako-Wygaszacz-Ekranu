#include "words.h"
#include "util.h"

#include <json-glib/json-glib.h>
#include <stdio.h>
#include <string.h>

#define MULTI_VERSION 2
#define HISTORY_DAYS 366

static const char *LANG_CODE[LANG_N] = {"pl", "en"};
static const char *DATA_FILE[LANG_N] = {"words.tsv", "words-en.tsv"};

Entry *entry_new(const char *w, int lang)
{
    Entry *e = g_new0(Entry, 1);
    e->w = g_strdup(w);
    e->d = g_ptr_array_new_with_free_func(g_free);
    e->lang = lang;
    return e;
}

Entry *entry_copy(const Entry *e)
{
    Entry *c = entry_new(e->w, e->lang);
    for (guint i = 0; i < e->d->len; i++)
        g_ptr_array_add(c->d, g_strdup(g_ptr_array_index(e->d, i)));
    c->prank = e->prank;
    return c;
}

void entry_free(Entry *e)
{
    if (!e)
        return;
    g_free(e->w);
    g_ptr_array_unref(e->d);
    g_free(e);
}

static int lang_from(const char *s)
{
    return g_strcmp0(s, "en") == 0 ? LANG_EN : LANG_PL;
}

typedef struct {
    GMappedFile *file;
    const char *bytes;
    gsize len;
    guint32 *starts;
    guint total;
} Db;

static Db *db_open(int lang)
{
    char *path = g_build_filename(data_dir(), "data", DATA_FILE[lang], NULL);
    GError *err = NULL;
    GMappedFile *mf = g_mapped_file_new(path, FALSE, &err);
    if (!mf) {
        WARN("Brak bazy haseł %s: %s", path, err->message);
        g_error_free(err);
        g_free(path);
        return NULL;
    }
    g_free(path);
    Db *db = g_new0(Db, 1);
    db->file = mf;
    db->bytes = g_mapped_file_get_contents(mf);
    db->len = g_mapped_file_get_length(mf);
    guint lines = 0;
    for (gsize i = 0; i < db->len; i++)
        if (db->bytes[i] == '\n')
            lines++;
    if (db->len > 0 && db->bytes[db->len - 1] != '\n')
        lines++;
    db->starts = g_new(guint32, lines + 1);
    guint n = 0;
    if (lines > 0)
        db->starts[n++] = 0;
    for (gsize i = 0; i < db->len && n < lines; i++)
        if (db->bytes[i] == '\n')
            db->starts[n++] = (guint32)(i + 1);
    db->starts[lines] = (guint32)db->len;
    db->total = lines;
    return db;
}

static void db_free(Db *db)
{
    if (!db)
        return;
    g_free(db->starts);
    g_mapped_file_unref(db->file);
    g_free(db);
}

static gsize db_line_end(Db *db, guint i)
{
    gsize end = db->starts[i + 1];
    while (end > db->starts[i] && (db->bytes[end - 1] == '\n' || db->bytes[end - 1] == '\r'))
        end--;
    return end;
}

static char *db_headword(Db *db, guint i)
{
    gsize a = db->starts[i], end = db_line_end(db, i);
    const char *tab = memchr(db->bytes + a, '\t', end - a);
    gsize b = tab ? (gsize)(tab - db->bytes) : end;
    return g_strndup(db->bytes + a, b - a);
}

static Entry *db_entry(Db *db, guint i, int lang)
{
    gsize a = db->starts[i], end = db_line_end(db, i);
    char *line = g_strndup(db->bytes + a, end - a);
    char **parts = g_strsplit(line, "\t", -1);
    Entry *e = entry_new(parts[0] ? parts[0] : "", lang);
    for (int k = 1; parts[0] && parts[k]; k++)
        if (*parts[k])
            g_ptr_array_add(e->d, g_strdup(parts[k]));
    g_strfreev(parts);
    g_free(line);
    return e;
}

typedef struct {
    char *date;
    GPtrArray *words;
} HistDay;

typedef struct {
    char *date;
    GPtrArray *today;
    int cursor;
    GPtrArray *used[LANG_N];
    GHashTable *used_set[LANG_N];
    bool has_counts;
    int counts[LANG_N];
    GPtrArray *history;
} State;

static void hist_day_free(HistDay *h)
{
    g_free(h->date);
    g_ptr_array_unref(h->words);
    g_free(h);
}

static State *state_new(void)
{
    State *s = g_new0(State, 1);
    s->date = g_strdup("");
    s->today = g_ptr_array_new_with_free_func((GDestroyNotify)entry_free);
    for (int l = 0; l < LANG_N; l++) {
        s->used[l] = g_ptr_array_new_with_free_func(g_free);
        s->used_set[l] = g_hash_table_new(g_str_hash, g_str_equal);
    }
    s->history = g_ptr_array_new_with_free_func((GDestroyNotify)hist_day_free);
    return s;
}

static void state_free(State *s)
{
    if (!s)
        return;
    g_free(s->date);
    g_ptr_array_unref(s->today);
    for (int l = 0; l < LANG_N; l++) {
        g_hash_table_unref(s->used_set[l]);
        g_ptr_array_unref(s->used[l]);
    }
    g_ptr_array_unref(s->history);
    g_free(s);
}

static void used_add(State *s, int l, const char *w)
{
    if (g_hash_table_contains(s->used_set[l], w))
        return;
    char *copy = g_strdup(w);
    g_ptr_array_add(s->used[l], copy);
    g_hash_table_add(s->used_set[l], copy);
}

static void used_clear(State *s, int l)
{
    g_hash_table_remove_all(s->used_set[l]);
    g_ptr_array_set_size(s->used[l], 0);
}

static Entry *entry_from_json(JsonObject *o)
{
    if (!o || !json_object_has_member(o, "w"))
        return NULL;
    JsonNode *wn = json_object_get_member(o, "w");
    if (JSON_NODE_TYPE(wn) != JSON_NODE_VALUE || json_node_get_value_type(wn) != G_TYPE_STRING)
        return NULL;
    const char *lang = json_object_has_member(o, "lang")
        ? json_object_get_string_member_with_default(o, "lang", "pl") : "pl";
    Entry *e = entry_new(json_node_get_string(wn), lang_from(lang));
    JsonArray *d = json_object_has_member(o, "d") ? json_object_get_array_member(o, "d") : NULL;
    if (d) {
        for (guint i = 0; i < json_array_get_length(d); i++) {
            JsonNode *n = json_array_get_element(d, i);
            if (JSON_NODE_HOLDS_VALUE(n) && json_node_get_value_type(n) == G_TYPE_STRING)
                g_ptr_array_add(e->d, g_strdup(json_node_get_string(n)));
        }
    }
    return e;
}

static State *state_from_json(JsonNode *root)
{
    State *s = state_new();
    if (!root || !JSON_NODE_HOLDS_OBJECT(root))
        return s;
    JsonObject *o = json_node_get_object(root);
    if (json_object_has_member(o, "date")) {
        JsonNode *n = json_object_get_member(o, "date");
        if (JSON_NODE_HOLDS_VALUE(n) && json_node_get_value_type(n) == G_TYPE_STRING) {
            g_free(s->date);
            s->date = g_strdup(json_node_get_string(n));
        }
    }
    if (json_object_has_member(o, "counts")) {
        JsonNode *n = json_object_get_member(o, "counts");
        if (JSON_NODE_HOLDS_OBJECT(n)) {
            JsonObject *c = json_node_get_object(n);
            bool ok = true;
            for (int l = 0; l < LANG_N; l++) {
                if (!json_object_has_member(c, LANG_CODE[l])) {
                    ok = false;
                    break;
                }
                gint64 v = json_object_get_int_member(c, LANG_CODE[l]);
                if (v < 0) {
                    ok = false;
                    break;
                }
                s->counts[l] = (int)v;
            }
            s->has_counts = ok;
        }
    }
    if (json_object_has_member(o, "cursor")) {
        gint64 c = json_object_get_int_member(o, "cursor");
        s->cursor = c >= 0 ? (int)c : 0;
    }
    if (json_object_has_member(o, "used")) {
        JsonNode *n = json_object_get_member(o, "used");
        if (JSON_NODE_HOLDS_ARRAY(n)) {
            JsonArray *a = json_node_get_array(n);
            for (guint i = 0; i < json_array_get_length(a); i++) {
                JsonNode *x = json_array_get_element(a, i);
                if (JSON_NODE_HOLDS_VALUE(x) && json_node_get_value_type(x) == G_TYPE_STRING)
                    used_add(s, LANG_PL, json_node_get_string(x));
            }
        } else if (JSON_NODE_HOLDS_OBJECT(n)) {
            JsonObject *u = json_node_get_object(n);
            for (int l = 0; l < LANG_N; l++) {
                if (!json_object_has_member(u, LANG_CODE[l]))
                    continue;
                JsonNode *an = json_object_get_member(u, LANG_CODE[l]);
                if (!JSON_NODE_HOLDS_ARRAY(an))
                    continue;
                JsonArray *a = json_node_get_array(an);
                for (guint i = 0; i < json_array_get_length(a); i++) {
                    JsonNode *x = json_array_get_element(a, i);
                    if (JSON_NODE_HOLDS_VALUE(x) && json_node_get_value_type(x) == G_TYPE_STRING)
                        used_add(s, l, json_node_get_string(x));
                }
            }
        }
    }
    if (json_object_has_member(o, "history")) {
        JsonNode *n = json_object_get_member(o, "history");
        if (JSON_NODE_HOLDS_ARRAY(n)) {
            JsonArray *a = json_node_get_array(n);
            for (guint i = 0; i < json_array_get_length(a); i++) {
                JsonNode *x = json_array_get_element(a, i);
                if (!JSON_NODE_HOLDS_OBJECT(x))
                    continue;
                JsonObject *h = json_node_get_object(x);
                if (!json_object_has_member(h, "date") || !json_object_has_member(h, "words"))
                    continue;
                JsonNode *wn = json_object_get_member(h, "words");
                if (!JSON_NODE_HOLDS_ARRAY(wn))
                    continue;
                HistDay *day = g_new0(HistDay, 1);
                day->date = g_strdup(json_object_get_string_member_with_default(h, "date", ""));
                day->words = g_ptr_array_new_with_free_func((GDestroyNotify)entry_free);
                JsonArray *wa = json_node_get_array(wn);
                for (guint k = 0; k < json_array_get_length(wa); k++) {
                    JsonNode *en = json_array_get_element(wa, k);
                    Entry *e = JSON_NODE_HOLDS_OBJECT(en) ? entry_from_json(json_node_get_object(en)) : NULL;
                    if (e)
                        g_ptr_array_add(day->words, e);
                }
                g_ptr_array_add(s->history, day);
            }
        }
    }
    if (json_object_has_member(o, "today")) {
        JsonNode *n = json_object_get_member(o, "today");
        if (JSON_NODE_HOLDS_ARRAY(n)) {
            JsonArray *a = json_node_get_array(n);
            for (guint i = 0; i < json_array_get_length(a); i++) {
                JsonNode *x = json_array_get_element(a, i);
                Entry *e = JSON_NODE_HOLDS_OBJECT(x) ? entry_from_json(json_node_get_object(x)) : NULL;
                if (e)
                    g_ptr_array_add(s->today, e);
            }
        }
    }
    for (guint i = 0; i < s->today->len; i++) {
        Entry *e = g_ptr_array_index(s->today, i);
        used_add(s, e->lang, e->w);
    }
    return s;
}

static void builder_entry(JsonBuilder *b, const Entry *e, int max_d)
{
    json_builder_begin_object(b);
    json_builder_set_member_name(b, "w");
    json_builder_add_string_value(b, e->w);
    json_builder_set_member_name(b, "d");
    json_builder_begin_array(b);
    for (guint i = 0; i < e->d->len && (max_d < 0 || (int)i < max_d); i++)
        json_builder_add_string_value(b, g_ptr_array_index(e->d, i));
    json_builder_end_array(b);
    json_builder_set_member_name(b, "lang");
    json_builder_add_string_value(b, LANG_CODE[e->lang]);
    json_builder_end_object(b);
}

static char *state_to_json(State *s)
{
    JsonBuilder *b = json_builder_new();
    json_builder_begin_object(b);
    json_builder_set_member_name(b, "version");
    json_builder_add_int_value(b, MULTI_VERSION);
    json_builder_set_member_name(b, "date");
    json_builder_add_string_value(b, s->date);
    json_builder_set_member_name(b, "today");
    json_builder_begin_array(b);
    for (guint i = 0; i < s->today->len; i++)
        builder_entry(b, g_ptr_array_index(s->today, i), -1);
    json_builder_end_array(b);
    json_builder_set_member_name(b, "cursor");
    json_builder_add_int_value(b, s->cursor);
    json_builder_set_member_name(b, "used");
    json_builder_begin_object(b);
    for (int l = 0; l < LANG_N; l++) {
        json_builder_set_member_name(b, LANG_CODE[l]);
        json_builder_begin_array(b);
        for (guint i = 0; i < s->used[l]->len; i++)
            json_builder_add_string_value(b, g_ptr_array_index(s->used[l], i));
        json_builder_end_array(b);
    }
    json_builder_end_object(b);
    json_builder_set_member_name(b, "counts");
    if (s->has_counts) {
        json_builder_begin_object(b);
        for (int l = 0; l < LANG_N; l++) {
            json_builder_set_member_name(b, LANG_CODE[l]);
            json_builder_add_int_value(b, s->counts[l]);
        }
        json_builder_end_object(b);
    } else {
        json_builder_add_null_value(b);
    }
    json_builder_set_member_name(b, "history");
    json_builder_begin_array(b);
    for (guint i = 0; i < s->history->len; i++) {
        HistDay *h = g_ptr_array_index(s->history, i);
        json_builder_begin_object(b);
        json_builder_set_member_name(b, "date");
        json_builder_add_string_value(b, h->date);
        json_builder_set_member_name(b, "words");
        json_builder_begin_array(b);
        for (guint k = 0; k < h->words->len; k++)
            builder_entry(b, g_ptr_array_index(h->words, k), 3);
        json_builder_end_array(b);
        json_builder_end_object(b);
    }
    json_builder_end_array(b);
    json_builder_end_object(b);
    JsonNode *root = json_builder_get_root(b);
    JsonGenerator *gen = json_generator_new();
    json_generator_set_root(gen, root);
    char *out = json_generator_to_data(gen, NULL);
    g_object_unref(gen);
    json_node_unref(root);
    g_object_unref(b);
    return out;
}

char *day_key_now(void)
{
    GDateTime *dt = g_date_time_new_now_local();
    char *k = g_date_time_format(dt, "%Y-%m-%d");
    g_date_time_unref(dt);
    return k;
}

static gint64 day_number(const char *key)
{
    int y, m, d;
    if (!key || sscanf(key, "%4d-%2d-%2d", &y, &m, &d) != 3 || strlen(key) != 10)
        return G_MININT64;
    GDateTime *dt = g_date_time_new_utc(y, m, d, 0, 0, 0);
    if (!dt)
        return G_MININT64;
    gint64 n = g_date_time_to_unix(dt) / 86400;
    g_date_time_unref(dt);
    return n;
}

static int hist_cmp(gconstpointer a, gconstpointer b)
{
    const HistDay *x = *(HistDay *const *)a, *y = *(HistDay *const *)b;
    return strcmp(x->date, y->date);
}

static void add_to_history(State *s, const char *date, GPtrArray *words, const char *now)
{
    if (date && *date && words && words->len) {
        HistDay *day = NULL;
        for (guint i = 0; i < s->history->len; i++) {
            HistDay *h = g_ptr_array_index(s->history, i);
            if (strcmp(h->date, date) == 0)
                day = h;
        }
        if (!day) {
            day = g_new0(HistDay, 1);
            day->date = g_strdup(date);
            day->words = g_ptr_array_new_with_free_func((GDestroyNotify)entry_free);
            g_ptr_array_add(s->history, day);
        }
        for (guint i = 0; i < words->len; i++) {
            Entry *e = g_ptr_array_index(words, i);
            bool dup = false;
            for (guint k = 0; k < day->words->len && !dup; k++) {
                Entry *x = g_ptr_array_index(day->words, k);
                dup = strcmp(x->w, e->w) == 0 && x->lang == e->lang;
            }
            if (!dup) {
                Entry *c = entry_copy(e);
                if (c->d->len > 3)
                    g_ptr_array_set_size(c->d, 3);
                g_ptr_array_add(day->words, c);
            }
        }
    }
    gint64 nowd = day_number(now ? now : date);
    if (nowd != G_MININT64) {
        gint64 limit = nowd - HISTORY_DAYS;
        for (guint i = s->history->len; i > 0; i--) {
            HistDay *h = g_ptr_array_index(s->history, i - 1);
            gint64 dn = day_number(h->date);
            if (dn == G_MININT64 || dn < limit)
                g_ptr_array_remove_index(s->history, i - 1);
        }
    }
    g_ptr_array_sort(s->history, hist_cmp);
}

static GArray *pick_unused(Db *db, GHashTable *used, GHashTable *extra, int n)
{
    GArray *picked = g_array_new(FALSE, FALSE, sizeof(guint));
    GHashTable *taken = g_hash_table_new(g_direct_hash, g_direct_equal);
    const int max_tries = 64;
    while ((int)picked->len < n && db->total > 0) {
        gint64 found = -1;
        for (int t = 0; t < max_tries && found < 0; t++) {
            guint i = (guint)(rnd() * db->total);
            if (g_hash_table_contains(taken, GUINT_TO_POINTER(i + 1)))
                continue;
            char *hw = db_headword(db, i);
            if (!g_hash_table_contains(used, hw) && !(extra && g_hash_table_contains(extra, hw)))
                found = i;
            g_free(hw);
        }
        if (found < 0) {
            guint start = (guint)(rnd() * db->total);
            for (guint k = 0; k < db->total && found < 0; k++) {
                guint i = (start + k) % db->total;
                if (g_hash_table_contains(taken, GUINT_TO_POINTER(i + 1)))
                    continue;
                char *hw = db_headword(db, i);
                if (!g_hash_table_contains(used, hw) && !(extra && g_hash_table_contains(extra, hw)))
                    found = i;
                g_free(hw);
            }
        }
        if (found < 0)
            break;
        guint f = (guint)found;
        g_hash_table_add(taken, GUINT_TO_POINTER(f + 1));
        g_array_append_val(picked, f);
    }
    g_hash_table_unref(taken);
    return picked;
}

static void plan_lang(State *s, int l, GPtrArray *mine, int count, Db *db, GPtrArray *out)
{
    if (count <= 0)
        return;
    for (guint i = 0; i < mine->len && (int)out->len < count; i++)
        g_ptr_array_add(out, entry_copy(g_ptr_array_index(mine, i)));
    if ((int)out->len >= count || !db)
        return;
    int missing = count - (int)out->len;
    GArray *idx = pick_unused(db, s->used_set[l], NULL, missing);
    if ((int)idx->len < missing) {
        used_clear(s, l);
        for (guint i = 0; i < out->len; i++)
            used_add(s, l, ((Entry *)g_ptr_array_index(out, i))->w);
        GHashTable *extra = g_hash_table_new_full(g_str_hash, g_str_equal, g_free, NULL);
        for (guint i = 0; i < idx->len; i++)
            g_hash_table_add(extra, db_headword(db, g_array_index(idx, guint, i)));
        GArray *more = pick_unused(db, s->used_set[l], extra, missing - (int)idx->len);
        g_array_append_vals(idx, more->data, more->len);
        g_array_unref(more);
        g_hash_table_unref(extra);
    }
    for (guint i = 0; i < idx->len; i++) {
        Entry *e = db_entry(db, g_array_index(idx, guint, i), l);
        used_add(s, l, e->w);
        g_ptr_array_add(out, e);
    }
    g_array_unref(idx);
}

static void normalize_counts(const int in[LANG_N], int out[LANG_N])
{
    bool all0 = true;
    for (int l = 0; l < LANG_N; l++) {
        out[l] = MAX(0, in[l]);
        if (out[l])
            all0 = false;
    }
    if (all0)
        out[LANG_PL] = 1;
}

static bool needs_planning(State *s, const char *today, const int counts[LANG_N])
{
    if (strcmp(s->date, today) != 0)
        return true;
    if (s->has_counts) {
        for (int l = 0; l < LANG_N; l++)
            if (s->counts[l] != counts[l])
                return true;
        return false;
    }
    int have[LANG_N] = {0};
    for (guint i = 0; i < s->today->len; i++)
        have[((Entry *)g_ptr_array_index(s->today, i))->lang]++;
    for (int l = 0; l < LANG_N; l++)
        if (have[l] != counts[l])
            return true;
    return false;
}

static void plan_day_multi(State *s, const char *today, const int counts[LANG_N])
{
    bool same_day = strcmp(s->date, today) == 0;
    if (same_day)
        add_to_history(s, "", NULL, today);
    else
        add_to_history(s, s->date, s->today, today);

    GPtrArray *lists[LANG_N];
    for (int l = 0; l < LANG_N; l++) {
        GPtrArray *mine = g_ptr_array_new();
        if (same_day) {
            for (guint i = 0; i < s->today->len; i++) {
                Entry *e = g_ptr_array_index(s->today, i);
                if (e->lang == l)
                    g_ptr_array_add(mine, e);
            }
        }
        lists[l] = g_ptr_array_new_with_free_func((GDestroyNotify)entry_free);
        Db *db = counts[l] > 0 && (int)mine->len < counts[l] ? db_open(l) : NULL;
        plan_lang(s, l, mine, counts[l], db, lists[l]);
        db_free(db);
        g_ptr_array_unref(mine);
    }
    int cursor = same_day ? s->cursor : 0;
    g_ptr_array_set_size(s->today, 0);
    guint longest = MAX(lists[0]->len, lists[1]->len);
    for (guint i = 0; i < longest; i++)
        for (int l = 0; l < LANG_N; l++)
            if (i < lists[l]->len)
                g_ptr_array_add(s->today, entry_copy(g_ptr_array_index(lists[l], i)));
    for (int l = 0; l < LANG_N; l++)
        g_ptr_array_unref(lists[l]);
    g_free(s->date);
    s->date = g_strdup(today);
    s->has_counts = true;
    for (int l = 0; l < LANG_N; l++)
        s->counts[l] = counts[l];
    s->cursor = s->today->len ? cursor % (int)s->today->len : 0;
}

struct WordStore {
    char *dir;
    char *path;
    State *state;
    bool dirty;
};

WordStore *word_store_new(void)
{
    WordStore *s = g_new0(WordStore, 1);
    s->dir = g_build_filename(g_get_user_data_dir(), "wyraz-screensaver", NULL);
    s->path = g_build_filename(s->dir, "state.json", NULL);
    return s;
}

void word_store_free(WordStore *s)
{
    if (!s)
        return;
    word_store_save(s);
    state_free(s->state);
    g_free(s->dir);
    g_free(s->path);
    g_free(s);
}

static void load_state(WordStore *s)
{
    if (s->state)
        return;
    char *text = NULL;
    gsize len = 0;
    GError *err = NULL;
    if (!g_file_get_contents(s->path, &text, &len, &err)) {
        if (!g_error_matches(err, G_FILE_ERROR, G_FILE_ERROR_NOENT))
            WARN("Nie udało się odczytać stanu: %s", err->message);
        g_clear_error(&err);
        s->state = state_new();
        return;
    }
    JsonParser *p = json_parser_new();
    if (json_parser_load_from_data(p, text, (gssize)len, &err)) {
        s->state = state_from_json(json_parser_get_root(p));
    } else {
        WARN("Uszkodzony plik stanu: %s", err->message);
        g_clear_error(&err);
        s->state = state_new();
    }
    g_object_unref(p);
    g_free(text);
}

void word_store_save(WordStore *s)
{
    if (!s->state || !s->dirty)
        return;
    s->dirty = false;
    g_mkdir_with_parents(s->dir, 0700);
    char *json = state_to_json(s->state);
    GError *err = NULL;
    if (!g_file_set_contents(s->path, json, -1, &err)) {
        s->dirty = true;
        WARN("Nie udało się zapisać stanu: %s", err->message);
        g_error_free(err);
    }
    g_free(json);
}

void word_store_ensure_today(WordStore *s, const int counts_in[LANG_N])
{
    int counts[LANG_N];
    normalize_counts(counts_in, counts);
    load_state(s);
    char *today = day_key_now();
    if (needs_planning(s->state, today, counts)) {
        plan_day_multi(s->state, today, counts);
        s->dirty = true;
        word_store_save(s);
    }
    g_free(today);
}

Entry *word_store_next(WordStore *s, const int counts[LANG_N], int *index, int *total)
{
    word_store_ensure_today(s, counts);
    GPtrArray *list = s->state->today;
    if (list->len == 0)
        return NULL;
    int i = s->state->cursor % (int)list->len;
    s->state->cursor = (i + 1) % (int)list->len;
    s->dirty = true;
    if (index)
        *index = i;
    if (total)
        *total = (int)list->len;
    return entry_copy(g_ptr_array_index(list, i));
}

void word_store_reset_today(WordStore *s)
{
    load_state(s);
    State *st = s->state;
    add_to_history(st, st->date, st->today, st->date);
    g_free(st->date);
    st->date = g_strdup("");
    g_ptr_array_set_size(st->today, 0);
    st->cursor = 0;
    st->has_counts = false;
    s->dirty = true;
    word_store_save(s);
}

static bool is_trailing_junk(gunichar c)
{
    return g_unichar_isspace(c) || c == ',' || c == ';' || c == ':' || c == 0x2013 || c == '-';
}

char *format_definition(GPtrArray *meanings, int max_meanings, int max_chars)
{
    GPtrArray *shown = g_ptr_array_new_with_free_func(g_free);
    for (guint i = 0; i < meanings->len && (int)i < max_meanings; i++) {
        const char *m = g_ptr_array_index(meanings, i);
        glong n = g_utf8_strlen(m, -1);
        if (n <= max_chars) {
            g_ptr_array_add(shown, g_strdup(m));
            continue;
        }
        glong cnt = 0;
        gunichar *u = g_utf8_to_ucs4_fast(m, -1, &cnt);
        glong cut = max_chars;
        glong sp = -1;
        for (glong k = 0; k < cut; k++)
            if (u[k] == ' ')
                sp = k;
        glong end = sp > max_chars * 0.6 ? sp : cut;
        while (end > 0 && is_trailing_junk(u[end - 1]))
            end--;
        char *part = g_ucs4_to_utf8(u, end, NULL, NULL, NULL);
        g_ptr_array_add(shown, g_strconcat(part ? part : "", "…", NULL));
        g_free(part);
        g_free(u);
    }
    char *out;
    if (shown->len == 1) {
        out = g_strdup(g_ptr_array_index(shown, 0));
    } else {
        GString *s = g_string_new(NULL);
        for (guint i = 0; i < shown->len; i++) {
            if (i)
                g_string_append_c(s, '\n');
            g_string_append_printf(s, "%u. %s", i + 1, (char *)g_ptr_array_index(shown, i));
        }
        out = g_string_free(s, FALSE);
    }
    g_ptr_array_unref(shown);
    return out;
}

static const char *PROVERBS[][2] = {
    {"Tak krawiec kraje, jak mu materii staje.",
     "‘w swoich działaniach jesteśmy ograniczeni okolicznościami’"},
    {"Panu Bogu świeczkę i diabłu ogarek.",
     "‘chcieć zadowolić dwie przeciwstawne strony’"},
    {"Nie święci garnki lepią.",
     "‘nie trzeba być wyjątkową osobą, aby coś zrobić’"},
    {"Na bezrybiu i rak ryba.",
     "‘gdy nie ma rzeczy, na której nam zależy, musimy się zadowolić jej namiastką’"},
    {"Kto wiatr sieje, ten zbiera burzę.",
     "‘musimy spodziewać się poważnych konsekwencji naszych złych czynów’"},
    {"Czym skorupka za młodu nasiąknie, tym na starość trąci.",
     "‘nabyte w młodości cechy i przyzwyczajenia ujawniają się w życiu dojrzałym’"},
    {"Kowal zawinił, a Cygana powiesili.",
     "‘ktoś został niesprawiedliwie ukarany za czyjeś winy’"},
    {"Zły to ptak, co własne gniazdo kala.",
     "‘ktoś, kto występuje przeciwko własnemu środowisku, własnej rodzinie’"},
    {"Łaska pańska na pstrym koniu jeździ.",
     "‘przychylność możnych jest zależna od ich kaprysów’"},
    {"Przyganiał kocioł garnkowi, a sam smoli.",
     "‘ktoś zwraca uwagę innym, a sam popełnia podobne błędy’"},
    {"Pańskie oko konia tuczy.",
     "‘warto osobiście angażować się w swoje sprawy, a nie polegać wyłącznie na innych’"},
    {"Czego oko nie widzi, tego sercu nie żal.",
     "‘jeśli nic nie wiemy o przykrych dla nas faktach, to nie cierpimy z tego powodu’"},
    {"Gdzie drwa rąbią, tam wióry lecą.",
     "‘każdy czyn ma swoje skutki uboczne’"},
    {"Na złodzieju czapka gore.",
     "‘winowajca nie umie ukryć lęku przed zdemaskowaniem i swoim zachowaniem zwraca na siebie uwagę’"},
    {"Złej baletnicy przeszkadza rąbek u spódnicy.",
     "‘osoba, która nie umie czegoś zrobić, chętnie zrzuca winę na niesprzyjające okoliczności’"},
    {"Nie dla psa kiełbasa, nie dla kota spyrka.",
     "‘pewne rzeczy są dostępne tylko dla określonej grupy odbiorców’"},
};

const char *PRANK_CREDIT = "Poprawność Językowa, IDiKS, UWr";

bool is_april_first(void)
{
    if (g_getenv("WYRAZ_APRIL_FIRST"))
        return true;
    GDateTime *dt = g_date_time_new_now_local();
    bool r = g_date_time_get_month(dt) == 4 && g_date_time_get_day_of_month(dt) == 1;
    g_date_time_unref(dt);
    return r;
}

GPtrArray *pick_proverbs(int n)
{
    int total = G_N_ELEMENTS(PROVERBS);
    GArray *pool = g_array_new(FALSE, FALSE, sizeof(int));
    for (int i = 0; i < total; i++)
        g_array_append_val(pool, i);
    GPtrArray *out = g_ptr_array_new_with_free_func((GDestroyNotify)entry_free);
    while ((int)out->len < n && pool->len) {
        guint k = (guint)(rnd() * pool->len);
        int i = g_array_index(pool, int, k);
        g_array_remove_index(pool, k);
        Entry *e = entry_new(PROVERBS[i][0], LANG_PL);
        g_ptr_array_add(e->d, g_strdup(PROVERBS[i][1]));
        e->prank = true;
        g_ptr_array_add(out, e);
    }
    g_array_unref(pool);
    return out;
}
