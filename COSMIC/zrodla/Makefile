# Słownik jako Wygaszacz Ekranu dla COSMIC: budowanie i instalacja.
#
# Używane przez manifest Flatpak (eu.jaroszek.Wyraz.yml) wewnątrz
# org.gnome.Sdk, gdzie są wszystkie potrzebne biblioteki. Ręcznie:
#   make && make install PREFIX=/app
#
# Wymagane (pkg-config): wayland-client wayland-egl wayland-cursor egl glesv2
# xkbcommon pangocairo cairo fontconfig gio-2.0 json-glib-1.0 oraz wayland-scanner.

VERSION   ?= 1.9.5-cosmic1
PREFIX    ?= /usr/local
DATADIR   ?= $(PREFIX)/share
PKGDATA   ?= $(DATADIR)/wyraz
BUILD     ?= build
PKG_CONFIG ?= pkg-config
CC        ?= cc

PKGS := wayland-client wayland-egl wayland-cursor egl glesv2 xkbcommon pangocairo cairo fontconfig gio-2.0 json-glib-1.0
WAYLAND_SCANNER ?= $(shell $(PKG_CONFIG) --variable=wayland_scanner wayland-scanner 2>/dev/null || echo wayland-scanner)

CFLAGS  ?= -O2 -g
CFLAGS  += -std=gnu11 -Wall -Wextra -Wno-unused-parameter -D_GNU_SOURCE \
           -DWYRAZ_VERSION='"$(VERSION)"' -DWYRAZ_DATADIR='"$(PKGDATA)"' \
           -DWYRAZ_FONTDIRS='"$(DATADIR)/fonts/wyraz:$(DATADIR)/fonts/urw-base35"' \
           -I$(BUILD) -Isrc $(shell $(PKG_CONFIG) --cflags $(PKGS))
LIBS    := $(shell $(PKG_CONFIG) --libs $(PKGS)) -lm

PROTOCOLS := xdg-shell wlr-layer-shell-unstable-v1 ext-idle-notify-v1 viewporter fractional-scale-v1 \
             keyboard-shortcuts-inhibit-unstable-v1
PROTO_H   := $(PROTOCOLS:%=$(BUILD)/%-client-protocol.h)
PROTO_C   := $(PROTOCOLS:%=$(BUILD)/%-protocol.c)

SRCS := $(wildcard src/*.c)
OBJS := $(SRCS:src/%.c=$(BUILD)/%.o) $(PROTO_C:.c=.o)

all: $(BUILD)/wyraz-cosmic

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/%-client-protocol.h: protocols/%.xml | $(BUILD)
	$(WAYLAND_SCANNER) client-header $< $@

$(BUILD)/%-protocol.c: protocols/%.xml | $(BUILD)
	$(WAYLAND_SCANNER) private-code $< $@

$(BUILD)/%-protocol.o: $(BUILD)/%-protocol.c
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/%.o: src/%.c $(PROTO_H) $(wildcard src/*.h) | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/wyraz-cosmic: $(OBJS)
	$(CC) $(LDFLAGS) -o $@ $^ $(LIBS)

install: all
	install -Dm755 $(BUILD)/wyraz-cosmic $(DESTDIR)$(PREFIX)/bin/wyraz-cosmic
	install -Dm755 data/wyraz-ustawienia $(DESTDIR)$(PREFIX)/bin/wyraz-ustawienia
	sed -i 's|@PKGDATA@|$(PKGDATA)|g' $(DESTDIR)$(PREFIX)/bin/wyraz-ustawienia
	install -Dm644 -t $(DESTDIR)$(PKGDATA)/data data/words.tsv data/words-en.tsv data/LICENSE-words-en.txt
	install -Dm644 -t $(DESTDIR)$(PKGDATA)/ustawienia ustawienia/main.js ustawienia/prefs.js
	install -Dm644 -t $(DESTDIR)$(PKGDATA)/ustawienia/lib ustawienia/lib/*.js
	install -Dm644 LICENSE $(DESTDIR)$(PKGDATA)/LICENSE
	install -Dm644 -t $(DESTDIR)$(DATADIR)/fonts/wyraz data/fonts/*.ttf
	install -Dm644 -t $(DESTDIR)$(DATADIR)/fonts/wyraz/licencje data/fonts/licencje/*.txt
	install -Dm644 data/eu.jaroszek.Wyraz.gschema.xml $(DESTDIR)$(DATADIR)/glib-2.0/schemas/eu.jaroszek.Wyraz.gschema.xml
	install -Dm644 data/eu.jaroszek.Wyraz.desktop $(DESTDIR)$(DATADIR)/applications/eu.jaroszek.Wyraz.desktop
	install -Dm644 data/eu.jaroszek.Wyraz.Applet.desktop $(DESTDIR)$(DATADIR)/applications/eu.jaroszek.Wyraz.Applet.desktop
	install -Dm644 data/eu.jaroszek.Wyraz.metainfo.xml $(DESTDIR)$(DATADIR)/metainfo/eu.jaroszek.Wyraz.metainfo.xml
	install -Dm644 data/icons/eu.jaroszek.Wyraz.svg $(DESTDIR)$(DATADIR)/icons/hicolor/scalable/apps/eu.jaroszek.Wyraz.svg
	install -Dm644 data/icons/eu.jaroszek.Wyraz-symbolic.svg $(DESTDIR)$(DATADIR)/icons/hicolor/symbolic/apps/eu.jaroszek.Wyraz-symbolic.svg
	glib-compile-schemas $(DESTDIR)$(DATADIR)/glib-2.0/schemas || true

# Usuwa to, co zainstalował „make install” (instalacja ze źródeł na Fedorze,
# Archu itp.; pakiet .deb usuwa się przez apt).
uninstall:
	rm -f $(DESTDIR)$(PREFIX)/bin/wyraz-cosmic $(DESTDIR)$(PREFIX)/bin/wyraz-ustawienia
	rm -rf $(DESTDIR)$(PKGDATA) $(DESTDIR)$(DATADIR)/fonts/wyraz
	rm -f $(DESTDIR)$(DATADIR)/glib-2.0/schemas/eu.jaroszek.Wyraz.gschema.xml \
	      $(DESTDIR)$(DATADIR)/applications/eu.jaroszek.Wyraz.desktop \
	      $(DESTDIR)$(DATADIR)/applications/eu.jaroszek.Wyraz.Applet.desktop \
	      $(DESTDIR)$(DATADIR)/metainfo/eu.jaroszek.Wyraz.metainfo.xml \
	      $(DESTDIR)$(DATADIR)/icons/hicolor/scalable/apps/eu.jaroszek.Wyraz.svg \
	      $(DESTDIR)$(DATADIR)/icons/hicolor/symbolic/apps/eu.jaroszek.Wyraz-symbolic.svg
	glib-compile-schemas $(DESTDIR)$(DATADIR)/glib-2.0/schemas || true

clean:
	rm -rf $(BUILD)

# Pakiet .deb dla Pop!_OS / Ubuntu 24.04 (budować w Ubuntu 24.04, np. przez
# zbuduj-deb.zsh w kontenerze podman). Wynik: dist/wyraz-cosmic_<wersja>_amd64.deb
DEBVERSION ?= $(subst -,+,$(VERSION))
DEBROOT    := $(BUILD)/debroot

deb:
	$(MAKE) PREFIX=/usr BUILD=$(BUILD) all
	rm -rf $(DEBROOT)
	$(MAKE) PREFIX=/usr BUILD=$(BUILD) DESTDIR=$(abspath $(DEBROOT)) install
	# skompilowany schemat i cache tworzą wyzwalacze dpkg (glib, fontconfig, ikony)
	rm -f $(DEBROOT)/usr/share/glib-2.0/schemas/gschemas.compiled
	install -Dm644 LICENSE $(DEBROOT)/usr/share/doc/wyraz-cosmic/copyright
	install -Dm644 README.md $(DEBROOT)/usr/share/doc/wyraz-cosmic/README.md
	mkdir -p $(DEBROOT)/DEBIAN
	sed -e 's/@DEBVERSION@/$(DEBVERSION)/' \
	    -e "s/@SIZE@/$$(du -sk --exclude=DEBIAN $(DEBROOT) | cut -f1)/" \
	    packaging/deb/control.in > $(DEBROOT)/DEBIAN/control
	find $(DEBROOT) -type d -exec chmod 755 {} +
	mkdir -p dist
	dpkg-deb --root-owner-group -Zxz --build $(DEBROOT) dist/wyraz-cosmic_$(DEBVERSION)_amd64.deb

.PHONY: all install uninstall clean deb
