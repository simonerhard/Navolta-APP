# Navolta Pendenzencockpit – Bölli Süd

[Geschützte App öffnen](https://navolta-pendenzencockpit.fizzysiren1027.chatgpt.site)

Die Anwendung dient der Bauleitung zur Verwaltung der Pendenzen in Niederlenz. Unter `source/` liegt der Quellcode mit einem leeren Datenbestand. Die produktiven Projektunterlagen, Erledigungsfotos und der Bearbeitungsverlauf liegen im geschützten Projektspeicher.

## Eigene Bereitstellung

Kopiere `hosting.example.json` nach `.openai/hosting.json`, trage die Site-ID ein und hinterlege Projektbestand und Logo in `seed.json`. Richte den privaten Zugang und die R2-Bindung `BUCKET` ein. Führe danach `npm install` und `npm run build` aus und stelle den Worker aus `dist/server/index.js` bereit.

Für den freigegebenen Microsoft-365-Direktversand werden `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` und `GRAPH_SENDER` als Laufzeitvariablen benötigt. Die Empfängeradressen im Beispiel sind Platzhalter.
