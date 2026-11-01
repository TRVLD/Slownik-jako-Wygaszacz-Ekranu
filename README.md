# Słownik jako Wygaszacz Ekranu

Wygaszacz ekranu dla Linuksa. Po okresie bezczynności pokazuje na animowanym
tle, dużą czcionką, losowe hasło ze *Słownika Języka Polskiego* (i opcjonalnie
z angielskiego słownika *Wordset*) wraz z definicją. Działa w dwóch wersjach:
jako rozszerzenie **GNOME Shell** i jako aplet panelu **COSMIC**.

| Aurora Borealis | Blue Ocean |
|---|---|
| <img width="400" alt="Aurora Borealis" src="https://github.com/user-attachments/assets/3c5a7020-3b86-4f98-a653-20cf3cd54f10" /> | <img width="400" alt="Blue Ocean" src="https://github.com/user-attachments/assets/8d18555e-b27a-4dc6-844b-6130a195137e" /> |
| **Lublin Renesans** | **Wroclove Herbowy** |
| <img width="400" alt="Lublin Renesans" src="https://github.com/user-attachments/assets/9d43e157-8ebf-4c48-95da-e2c05a95bb23" /> | <img width="400" alt="Wroclove Herbowy" src="https://github.com/user-attachments/assets/d569f005-7402-439e-99bd-52d8368193ee" /> |

Autor: **[M.T. Jaroszek](https://www.linkedin.com/in/jaroszek/)** · licencja
**EUPL 1.2** ([wersja polska](https://eupl.eu/1.2/pl/), plik
[`LICENSE.md`](LICENSE.md)) · udostępniane „tak jak jest” (as-is), bez
gwarancji. Program powstał we współpracy z Claude (Anthropic).

## Która wersja?

| Pulpit | Folder | Postać | Instrukcja |
|---|---|---|---|
| **GNOME 50** (np. Fedora 44), Wayland | [`GNOME/`](GNOME/) | rozszerzenie GNOME Shell | [GNOME/README.md](GNOME/README.md) |
| **COSMIC** (Pop!_OS 24.04+, Fedora, Arch, openSUSE…), Wayland | [`COSMIC/`](COSMIC/) | aplet panelu (litera **W**) | [COSMIC/README.md](COSMIC/README.md) |

Obie wersje mają te same style, shadery, bazę haseł i okno ustawień.
Więcej informacji jest w [Wiki](https://github.com/TRVLD/Slownik-jako-Wygaszacz-Ekranu/wiki).

## Co potrafi

- **96 304 polskie hasła** z prawdziwą definicją, z pisownią według zasad
  obowiązujących od 2026 r., oraz opcjonalnie **67 483 hasła angielskie**
  z Wordset.
- Codziennie losuje *N* polskich i *M* angielskich haseł, pokazywanych na
  przemian. **Hasło użyte jednego dnia nigdy nie wraca w innym dniu.**
  Dzisiejsze hasła można wylosować od nowa.
- Ma cztery animowane style rysowane na GPU: zorzę polarną pod niebem gwiazd
  (Aurora Borealis), głębię oceanu (Blue Ocean), figury Lublina (Lublin
  Renesans) i barwy Wrocławia (Wroclove Herbowy).
- Pokazuje zegar w jednym z trzech położeń.
- W oknie ustawień jest wyszukiwarka haseł. Wielkość liter nie ma znaczenia,
  a polskie znaki nie są konieczne.
- Znika po najmniejszym ruchu myszy, kliknięciu albo naciśnięciu klawisza.
  Naciśnięty klawisz nie trafia do aplikacji.
- Opcjonalnie wymaga kodu zamykającego (1–6 znaków). **Kod nie zastępuje
  hasła systemu.** Chroni tylko przed przypadkowym zamknięciem wygaszacza.
- Nie uruchamia się podczas oglądania filmów.
- Przy każdej zmianie hasła lekko przesuwa tekst, żeby chronić ekrany OLED
  przed wypaleniem.

## Instalacja

### GNOME

```bash
git clone https://github.com/TRVLD/Slownik-jako-Wygaszacz-Ekranu.git
cd Slownik-jako-Wygaszacz-Ekranu/GNOME
./install.sh
```

Następnie **wyloguj się i zaloguj ponownie**, bo na Waylandzie GNOME Shell
wczytuje nowe rozszerzenia dopiero przy logowaniu. Ustawienia otworzysz
poleceniem `gnome-extensions prefs wyraz@jaroszek.eu`. Szczegóły są
w [GNOME/README.md](GNOME/README.md).

### COSMIC

Z najnowszego wydania COSMIC w zakładce
[Releases](https://github.com/TRVLD/Slownik-jako-Wygaszacz-Ekranu/releases)
pobierz paczkę `wyraz-cosmic-….tar.gz`, a potem uruchom:

```bash
tar xzf wyraz-cosmic-*.tar.gz
cd wyraz-cosmic-*/
./zainstaluj-wyraz.sh
```

Instalator sam rozpoznaje system. Na Pop!_OS i Ubuntu instaluje pakiet `.deb`,
a na Fedorze, Archu i openSUSE kompiluje program ze źródeł. Na koniec dodaje
aplet do górnego panelu. Pojawia się tam litera **W** z menu: *Pokaż
wygaszacz*, *Wstrzymaj na godzinę* i *Ustawienia…*. Szczegóły są
w [COSMIC/README.md](COSMIC/README.md).

Wersja COSMIC jest nowa. Jeśli coś nie działa, zgłoś to w
[Issues](https://github.com/TRVLD/Slownik-jako-Wygaszacz-Ekranu/issues).

## Różnice między wersjami

| | GNOME | COSMIC |
|---|---|---|
| Postać | rozszerzenie powłoki (JavaScript) | osobny program-aplet (C) i okno ustawień (GJS) |
| Instalacja | `install.sh` z repozytorium | paczka z Releases (`.deb` albo kompilacja ze źródeł) |
| Wygaszacz na ekranie blokady | tak (opcja) | nie, ekranu blokady COSMIC nie da się przykryć |
| „Wstrzymaj na godzinę” | — | tak, w menu apletu |
| Czcionki | C059 z systemu (`urw-base35-c059-fonts`) | dołączone do pakietu |
| Historia haseł | `~/.local/share/wyraz-screensaver/state.json` | ta sama ścieżka i ten sam format |

Historię użytych haseł można przenosić między wersjami. Wystarczy skopiować
plik `state.json`.

## Struktura repozytorium

```
Slownik-jako-Wygaszacz-Ekranu/
├── README.md               ten plik
├── LICENSE.md              EUPL 1.2
├── GNOME/                  rozszerzenie GNOME Shell 50
│   ├── README.md
│   ├── install.sh, uninstall.sh
│   └── wyraz@jaroszek.eu/  kod rozszerzenia, hasła, czcionki, schematy
└── COSMIC/                 aplet panelu COSMIC
    ├── README.md
    ├── zbuduj-deb.zsh, zbuduj-flatpak.zsh, Makefile
    ├── src/                wygaszacz i aplet (C)
    ├── ustawienia/         okno ustawień (GJS)
    ├── data/               hasła, czcionki, schemat GSettings, ikony
    └── dla-kolegi/         instalator zainstaluj-wyraz.sh i instrukcja
```

## Źródła danych i licencje

- **Program:** licencja EUPL 1.2 ([`LICENSE.md`](LICENSE.md)). Udostępniany
  „tak jak jest”, bez jakichkolwiek gwarancji. Autor nie odpowiada za błędy
  ani za szkody wynikłe z jego użycia.
- **Polskie hasła:** [robert00s/sjp](https://github.com/robert00s/sjp)
  (wydanie 1.0, 2019) na podstawie [sjp.pl](https://sjp.pl). Pisownię
  dostosowano do zasad Rady Języka Polskiego obowiązujących od 1 stycznia
  2026 r.
- **Angielskie hasła:** [Wordset](https://github.com/wordset/wordset-dictionary),
  oparty na Princeton WordNet 3.0. Plik `words-en.tsv` jest udostępniany na
  licencji CC BY-SA 4.0, niezależnie od licencji programu.
- **Czcionki:** na licencji SIL OFL 1.1 (z Google Fonts: Crimson Text,
  Belleza, Hind, Quintessential, Fondamento, Carattere, Exo 2; oraz Wyraz
  Futhark) i URW base35 (C059, P052; AGPL-3.0 z wyjątkiem dla czcionek).
- Figury stylu Lublin Renesans odwzorowują elementy identyfikacji wizualnej
  miasta Lublin.
- Pełna lista składników open source z licencjami jest w oknie ustawień,
  na karcie „O wtyczce” (GNOME) albo „O programie” (COSMIC).
