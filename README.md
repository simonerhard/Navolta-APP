# Navolta GitHub-App mit SharePoint-Anbindung (Vorbereitung)

## Was bei Navolta bereits geprüft wurde
- SharePoint-Website: https://navolta.sharepoint.com
- Bestehende Dokumentbibliothek: https://navolta.sharepoint.com/Shared%20Documents
- Die Hauptbibliothek enthält derzeit eine sichtbare Datei `USV_Berechnungen.pdf`, jedoch **keine sichtbaren Unterordner**.
- **Keine Ordner wurden angelegt oder verändert.** Es wurden auch keine Daten hochgeladen.

## Schritt für Schritt: Microsoft-Anmeldung einrichten
1. https://entra.microsoft.com öffnen. Mit einem Konto anmelden, das App-Registrierungen anlegen darf; ggf. Microsoft-365-Administrator hinzuziehen.
2. **Identität → Anwendungen → App-Registrierungen → Neue Registrierung**.
3. Name: `Navolta Projektcontrolling GitHub`.
4. Kontotyp: **Nur Konten in diesem Organisationsverzeichnis**.
5. Redirect URI: Plattform **Single-page application (SPA)** und URL `https://DEIN-GITHUB-NAME.github.io/navolta-projektcontrolling/` (exakt die veröffentlichte URL mit abschliessendem Schrägstrich). Falls nötig nach Erstellung unter **Authentifizierung → Plattform hinzufügen → Single-page application**.
6. **Registrieren**. Aus der Übersicht **Anwendungs-ID (Client)** und **Verzeichnis-ID (Mandant)** kopieren.
7. In `sharepoint-config.js` die zwei Platzhalter durch die GUIDs ersetzen. **Kein Client Secret erzeugen oder ins Repository hochladen.**
8. Unter **API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen**: `User.Read`, `Files.ReadWrite.All`, `Sites.ReadWrite.All` auswählen. Je nach Mandant ist eine Administratorzustimmung erforderlich. **Achtung:** Dies sind weitreichende delegierte Berechtigungen; vor Produktivbetrieb auf `Sites.Selected` bzw. eine engere Architektur umstellen, wenn möglich.
9. Die fünf Dateien `index.html`, `sharepoint-sync.js`, `sharepoint-config.js` und die vorhandenen PNG-Dateien in GitHub hochladen. In **Settings → Pages**: `Deploy from a branch`, `main`, `/(root)`.
10. GitHub-Seite über HTTPS öffnen und unten links **Microsoft anmelden** wählen. Pop-ups müssen zugelassen sein.

## Wie die Synchronisierung funktioniert
- **Von SharePoint laden**: Liest `navolta-projektcontrolling-sync.json` aus dem **Stamm der bestehenden Dokumentbibliothek** und ersetzt nach Bestätigung die lokalen Daten. Vorher wird automatisch eine JSON-Backup-Datei heruntergeladen.
- **Nach SharePoint sichern**: Speichert eine JSON-Sicherung der lokalen Projekte und detaillierten Zeiterfassung in der bestehenden Bibliothek. Die Sicherungsdatei wird erst beim ausdrücklichen Klick erstellt. Es werden **keine Ordner angelegt**.
- Bei erkannten Änderungen der entfernten Datei verhindert eine ETag-Prüfung ein stilles Überschreiben. **Keine automatische Zusammenführung** und **keine Echtzeit-Synchronisierung**.
- Browser-Dokumente aus IndexedDB sind **nicht Bestandteil** dieser JSON-Sicherung. Sie müssen weiterhin separat nach SharePoint hochgeladen werden.
- Die lokale HTML-Passwortmaske ist keine Sicherheitsgrenze. Die Microsoft-Anmeldung sichert nur Graph-Aufrufe, nicht die öffentliche HTML-Datei.
- **Keine vertraulichen Daten auf GitHub hochladen.** Die SharePoint-Sicherungsdatei unterliegt den SharePoint-Bibliotheksberechtigungen.

## Wichtiger Hinweis zur gemeinsamen Arbeit
Dies ist eine **manuelle Synchronisierungs-/Backup-Vorstufe**, keine konfliktfreie Mehrbenutzerlösung. Zwei gleichzeitig arbeitende Mitarbeiter können ihre Änderungen nicht automatisch zusammenführen. Für produktive Zusammenarbeit sind separate SharePoint-Listen mit Datensatzversionen und passenden Rollenrechten oder eine andere zentrale Datenbank nötig.

## Testablauf
1. Zuerst alte App-Daten sichern.
2. Entra-App registrieren, Konfiguration eintragen, GitHub aktualisieren.
3. Als berechtigter Benutzer anmelden.
4. Testdaten ohne vertrauliche Inhalte erfassen, **Nach SharePoint sichern**.
5. In zweitem Browser **Von SharePoint laden** wählen und Daten prüfen.
6. Konflikttest: Browser A lädt, Browser B lädt und speichert, Browser A versucht zu speichern → muss blockiert werden.


## Bereits eingetragen (27.10.2026)
- GitHub Pages / SPA-Umleitungs-URI: `https://simonerhard.github.io/Navolta-APP/`
- Client-ID und Tenant-ID aus der Entra-Registrierung sind in `sharepoint-config.js` eingetragen.
- Delegierte Graph-Berechtigungen User.Read, Files.ReadWrite.All und Sites.ReadWrite.All laut Screenshot genehmigt.
- Live-Anmeldung und Dateisynchronisierung sind **noch nicht getestet**. Die erste Sicherung nur mit Testdaten durchführen.
- Die lokale Passwortmaske ist kein wirksamer Schutz für vertrauliche Daten. Keine sensiblen Daten auf einer öffentlich zugänglichen GitHub-Pages-Anwendung ohne wirksame Zugriffskontrolle verwenden.


## Korrektur: block_nested_popups
Die Microsoft-Anmeldung verwendet jetzt MSAL `loginRedirect` statt `loginPopup`. Nach der Weiterleitung zu Microsoft wird die Anwendung unter `https://simonerhard.github.io/Navolta-APP/` erneut geöffnet. Danach «Von SharePoint laden» oder «Nach SharePoint sichern» verwenden. Die URI muss unter Entra > Authentication als SPA eingetragen sein.

Hinweis: Der lokale HTML-Login ist kein Zugriffsschutz für öffentliche GitHub-Dateien. SharePoint-Synchronisierung ist eine manuelle Gesamt-Snapshot-Sicherung ohne automatische Mehrbenutzer-Zusammenführung.
