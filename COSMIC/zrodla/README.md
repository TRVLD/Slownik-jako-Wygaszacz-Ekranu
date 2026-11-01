# Słownik jako Wygaszacz Ekranu – wersja dla COSMIC

Wersja wtyczki GNOME Shell „Słownik jako Wygaszacz Ekranu” (1.9.5) dla
pulpitu **COSMIC** (Pop!_OS 24.04 i nowsze, Wayland), w postaci natywnego
**apletu panelu**: pakiet **.deb** instalowany przez apt, jak każdy program
w Pop!_OS (alternatywnie Flatpak).

Te same cztery style (Aurora Borealis, Blue Ocean, Lublin Renesans, Wroclove
Herbowy), te same shadery, hasła, zegar w trzech położeniach, kod zamykający,
archiwum i to samo okno ustawień.

| Aurora Borealis | Blue Ocean |
|---|---|
| ![](docs/podglad/aurora-borealis.png) | ![](docs/podglad/blue-ocean.png) |
| **Lublin Renesans** | **Wroclove Herbowy** |
| ![](docs/podglad/lublin-renesans.png) | ![](docs/podglad/wroclove-herbowy.png) |

Autor: **M.T. Jaroszek** · licencja **EUPL 1.2** · udostępniane „tak jak jest”,
bez gwarancji. Program powstał we współpracy z Claude (Anthropic).

---

## Dla autora: budowanie paczki (Fedora, zsh)

```zsh
cd wyraz-cosmic
./zbuduj-deb.zsh
```

Skrypt kompiluje program w kontenerze `ubuntu:24.04` (podman, w razie potrzeby
doinstaluje go przez `sudo dnf`), bo Pop!_OS 24.04 jest oparty na Ubuntu 24.04.
Wynik:

* `dist/wyraz-cosmic_1.9.5+cosmic1_amd64.deb` – natywny pakiet dla Pop!_OS,
* `dist/wyraz-cosmic-1.9.5-cosmic1.tar.gz` – **jedna paczka dla wszystkich
  kolegów**: pakiet .deb, źródła (`zrodla/`), `zainstaluj-wyraz.sh`
  i `INSTRUKCJA.txt` (oraz `wyraz-cosmic.flatpak`, jeśli wcześniej zbudowano
  go `zbuduj-flatpak.zsh`).

Nie potrzeba Rusta, cargo, Flatpaka ani środowiska GNOME.

## Dla kolegów: instalacja (dowolny Linux z COSMIC)

```bash
tar xzf wyraz-cosmic-1.9.5-cosmic1.tar.gz
cd wyraz-cosmic-1.9.5-cosmic1
./zainstaluj-wyraz.sh
```

Instalator czyta `/etc/os-release` i wybiera drogę:

| System | Co robi |
|---|---|
| Pop!_OS 24.04+, Ubuntu 24.04+, Debian 13+ (apt, amd64) | `sudo apt install ./wyraz-cosmic_*.deb` |
| starszy system z apt albo inna architektura | kompilacja ze źródeł (apt) |
| Fedora, Nobara (dnf) | `sudo dnf install` nagłówków i gjs/libadwaita/URW, kompilacja, `sudo make install` do `/usr` |
| Arch, Manjaro, EndeavourOS (pacman) | jak wyżej przez `pacman -S --needed` |
| openSUSE (zypper) | jak wyżej przez `zypper` |
| Fedora Atomic (rpm-ostree) | wersja Flatpak z paczki (jeśli jest) |

Potem dopisuje aplet do górnego panelu
(`~/.config/cosmic/com.system76.CosmicPanel.Panel/v1/plugins_wings`, z kopią
`.bak`); panel COSMIC wczytuje zmianę od razu i pokazuje literę **W**.
Opcje: `--bez-panelu`, `--ze-zrodel` (kompilacja także na Pop!_OS),
`--odinstaluj` (usuwa pakiet albo pliki z `/usr` oraz aplet z panelu).

Ręcznie: Ustawienia COSMIC → Pulpit → Panel → Aplety → Dodaj aplet →
„Słownik jako Wygaszacz Ekranu”.

## Alternatywa: Flatpak

`./zbuduj-flatpak.zsh` buduje to samo jako Flatpak (`dist/wyraz-cosmic-1.9.5-cosmic1.tar.gz`).
Wymaga jednak środowiska `org.gnome.Platform` 50 z Flathuba (ok. 1–2 GB u Ciebie
i kilkaset MB u kolegi), dlatego zalecany jest pakiet .deb. Skrypt doinstaluje
`flatpak`, `flatpak-builder` i `git` (`sudo dnf`); `--test` zapisuje klatki stylów
do `~/.var/app/eu.jaroszek.Wyraz/data/podglad/`; `--czysc` usuwa pliki budowania.
Instalator kolegi rozpoznaje, czy w paczce jest `.deb`, czy `.flatpak`.

## Jak to działa w COSMIC

![](docs/podglad/menu-apletu.png)

GNOME pozwala wtyczce rysować bezpośrednio w powłoce. COSMIC tego nie ma:
wygaszacz to osobny program, który rysuje pełnoekranowe warstwy (protokół
`wlr-layer-shell`). Panel COSMIC uruchamia go jako aplet przy logowaniu
i podaje mu gniazdo kompozytora (`X_PRIVILEGED_WAYLAND_SOCKET`), które działa
także w wersji Flatpak (tam `cosmic-comp` ukrywa layer-shell przed zwykłymi
programami z piaskownicy):

* **Aplet** (`wyraz-cosmic`, plik `eu.jaroszek.Wyraz.Applet.desktop`
  z `X-CosmicApplet=true` i `X-HostWaylandDisplay=true`) rysuje literę W
  w panelu i menu: *Pokaż wygaszacz*, *Wstrzymaj na godzinę*, *Ustawienia…*.
* **Silnik** w tym samym procesie łączy się przez uprzywilejowane gniazdo
  z kompozytorem, czeka na bezczynność (`ext-idle-notify-v1`) i pokazuje na
  każdym monitorze powierzchnię `layer-shell` w warstwie OVERLAY, rysowaną
  przez EGL/OpenGL ES z shaderami przeniesionymi 1:1 z wersji GNOME.
* Panel uruchamia po jednym aplecie na każdy monitor; wygaszacz działa tylko
  w jednym z nich (blokada pliku), pozostałe przejmują go, gdy ten zniknie.
* **Okno ustawień** (`wyraz-ustawienia`) to oryginalny `prefs.js` uruchamiany
  jako aplikacja libadwaita (GJS). Ustawienia (GSettings `eu.jaroszek.Wyraz`)
  i plik `state.json` są wspólne dla okna i apletu.

Dlaczego C, a nie Rust: aplety COSMIC zwykle pisze się w Rust (libcosmic), ale
wtyczka GNOME rysuje Cairo, Pango i GLSL. W C te same biblioteki są dostępne
bezpośrednio (i są już w każdym Pop!_OS), więc kształty Lublina, serca, kroje
i shadery są przeniesione wiernie, a program buduje się bez cargo i bez
pobierania setek pakietów Rusta.

### Odpowiedniki plików wersji GNOME

| GNOME (`wyraz@jaroszek.eu`) | COSMIC (`src/`) |
|---|---|
| `extension.js` (bezczynność, podgląd) | `engine.c` |
| `lib/screensaver.js` (MonitorView, Screensaver) | `view.c`, `engine.c` |
| `lib/shaders.js`, `lib/shaderEffect.js` | `shaders.c` (wygenerowany z shaders.js), `gl.c` |
| `lib/backgrounds.js` | `backgrounds.c` |
| `lib/lublin*.js` | `lublin.c` |
| `lib/wroclaw*.js` | `wroclaw.c` |
| `lib/codePrompt.js`, `lib/unlockCode.js` | `prompt.c`, `config.c` |
| `lib/wordStore.js`, `lib/selection.js`, `lib/prank.js` | `words.c` |
| St.Label + CSS (`stylesheet.css`) | `text.c` (Pango + cienie), tabela `STYLES` w `view.c` |
| `prefs.js` | `ustawienia/prefs.js` + `ustawienia/main.js` |
| — | `applet.c` (aplet panelu), `wlsource.c` (Wayland w pętli GLib) |

## Różnice względem wersji GNOME

* **Brak opcji „Pokazuj także na ekranie blokady”.** Ekranu blokady COSMIC
  (`cosmic-greeter`) nie da się przykryć. Wygaszacz sam rozpoznaje, że nikt go
  nie widzi (kompozytor przestaje mu wysyłać ramki), i chowa się, więc po
  odblokowaniu od razu widać pulpit. Tak samo ustępuje, gdy COSMIC wyłączy
  ekran (wyjątek jak w GNOME: wygaszacz z kodem zostaje pod wyłączonym ekranem,
  jeśli sesja nie jest zablokowana).
* **Skróty COSMIC (Super, Super+Escape…) nie działają, gdy widać wygaszacz**,
  tak jak przy modalnym przechwyceniu w GNOME: klawisz tylko zamyka wygaszacz
  (albo trafia do pola kodu). Przełączanie konsol (Ctrl+Alt+F3) działa zawsze.
* **„Nie przeszkadzaj podczas filmów”** korzysta z blokad bezczynności Wayland
  (`idle-inhibit`) i dodatkowo sprawdza, czy przeglądarka albo odtwarzacz wideo
  (MPRIS) właśnie gra. Odtwarzacze samej muzyki (Spotify, Rhythmbox, Lollypop…)
  wygaszacza nie wstrzymują, jak w GNOME. COSMIC nie udostępnia listy blokad D-Bus.
* **„Systemowe wyłączanie ekranu”** pokazuje i wydłuża czas z `cosmic-idle`
  (`~/.config/cosmic/com.system76.CosmicIdle/v1/screen_off_time`).
* **Nowość: „Wstrzymaj na godzinę”** w menu apletu (klucz `paused-until`).
* Czcionki (w tym P052 i C059) są w pakiecie, nic nie trzeba instalować.
* Pliki (.deb): ustawienia w dconf (`gsettings list-recursively eu.jaroszek.Wyraz`),
  historia haseł w `~/.local/share/wyraz-screensaver/state.json` – ta sama ścieżka
  i ten sam format co w GNOME, więc archiwum można po prostu skopiować. We Flatpaku:
  `~/.var/app/eu.jaroszek.Wyraz/…`.

## Zapomniany kod zamykający

Konsola tekstowa (Ctrl+Alt+F3), zaloguj się i wpisz:

```bash
gsettings set eu.jaroszek.Wyraz unlock-code-enabled false
# wersja Flatpak:
flatpak run --command=gsettings eu.jaroszek.Wyraz set eu.jaroszek.Wyraz unlock-code-enabled false
```

## Rozwiązywanie problemów

* **Brak litery W w panelu:** dodaj aplet ręcznie (wyżej) albo wyloguj się
  i zaloguj. Lista apletów: `cat ~/.config/cosmic/com.system76.CosmicPanel.Panel/v1/plugins_wings`.
* **Menu apletu pisze „Panel nie dał dostępu do warstwy ekranu”:** panel nie
  przekazał apletowi uprzywilejowanego gniazda (bardzo stara wersja COSMIC).
  Zaktualizuj system.
* **Dziennik** (komunikaty z prefiksem `[Wyraz]`):
  `journalctl --user -f | grep -i wyraz`
* **Podgląd stylów bez COSMIC:** `wyraz-cosmic --render-test ~/podglad`
  (Flatpak: `flatpak run --command=wyraz-cosmic eu.jaroszek.Wyraz --render-test ~/.var/app/eu.jaroszek.Wyraz/data/podglad`)

## Jak to sprawdzono

* Kompilacja z `-Wall -Wextra` bez ostrzeżeń.
* Render offscreen (EGL Mesa) wszystkich stylów i położeń zegara, pola kodu
  z rozmyciem (`--render-test`); obrazy w `docs/podglad/`.
* Test integracyjny z testowym kompozytorem Wayland (2 monitory, w tym jeden
  ze skalą 150%): bezczynność → nakładki na obu monitorach (z blokadą skrótów)
  → ruch myszy i klawisz zamykają; aplet: ikona, menu, „Pokaż wygaszacz” →
  podgląd; „zablokowana sesja” (1 ramka/s jak w cosmic-comp) → wygaszacz
  chowa się po 4 s; kod zamykający (polski układ klawiatury): klawisz
  pokazuje pole kodu, zły kod nie zamyka, dobry zamyka.
* Logika haseł (losowanie, przeplatanie PL/EN, przejście na nowy dzień
  z archiwum, brak powtórzeń) i format `state.json` zgodny z wersją GNOME.
* Pakiet .deb zbudowany na Ubuntu 24.04 (baza Pop!_OS 24.04) i zainstalowany
  przez dpkg: zadziałały wyzwalacze schematu GSettings, czcionek i ikon,
  a zainstalowany `/usr/bin/wyraz-cosmic` przeszedł testy apletu i blokady.
* Instalator kolegów: rozpoznanie Pop!_OS, Ubuntu, Fedory i Archa (podstawione
  `/etc/os-release`), prawdziwa kompilacja ze źródeł i `make install` do `/usr`
  (z atrapą `dnf`/`pacman`), działający program po instalacji ze źródeł,
  odinstalowanie bez śladów w `/usr`.
* Skrypty: `zsh -n` i próbne przejście `zbuduj-deb.zsh` i `zbuduj-flatpak.zsh`
  z atrapami `podman`/`flatpak`; instalator kolegi na kopii konfiguracji panelu
  (dopisanie, ponowne dopisanie, usunięcie apletu).
* Okno ustawień (GJS) dostosowane do libadwaita 1.5 z Pop!_OS 24.04
  (sprawdzona składnia; tu nie było GJS, by je uruchomić).
* Nie testowano na fizycznym Pop!_OS z COSMIC – pierwszy prawdziwy test to
  instalacja u kolegi.

## Struktura

```
wyraz-cosmic/
├── zbuduj-deb.zsh            pakiet .deb dla Pop!_OS (Fedora, zsh, podman) → dist/
├── zbuduj-flatpak.zsh        alternatywnie Flatpak → dist/
├── eu.jaroszek.Wyraz.yml     manifest Flatpak (GNOME 50 + fonty URW)
├── Makefile                  kompilacja, instalacja, `make deb`
├── packaging/deb/            plik control pakietu .deb
├── src/                      wygaszacz i aplet (C)
├── protocols/                protokoły Wayland (layer-shell, idle-notify…)
├── ustawienia/               okno ustawień (GJS, prefs.js z wersji GNOME)
├── data/                     hasła, czcionki, schemat GSettings, .desktop, ikony
├── dla-kolegi/               zainstaluj-wyraz.sh, INSTRUKCJA.txt
└── docs/podglad/             zrzuty stylów
```

## Źródła danych i licencje

Hasła: [robert00s/sjp](https://github.com/robert00s/sjp) (sjp.pl), pisownia
dostosowana do zasad z 2026 r.; angielskie: [Wordset](https://github.com/wordset/wordset-dictionary)
(CC BY-SA 4.0). Czcionki OFL (Google Fonts, Wyraz Futhark) i URW base35
(AGPL-3.0 z wyjątkiem dla czcionek). Pełna lista na karcie „O programie”
w ustawieniach. Figury stylu Lublin Renesans odwzorowują elementy
identyfikacji wizualnej Lublina.
