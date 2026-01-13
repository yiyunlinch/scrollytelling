# sheepStory – Scrollbasierte Web-Erzählung

Eine interaktive Website, die Illustration, Fotografie und Animation vereint und die Veränderung vor meiner Haustür erzählt. 
Sie ist ausschließlich für die Webansicht konzipiert.

https://story.yiyun.me/

## Projektübersicht#

Mockup-Vergleich

Retrospektive Darstellung: https://preview.shorthand.com/6AGye9WPh2N9sGaH
Chronologische Darstellung: https://preview.shorthand.com/DJtHExqM2XXoq6Mn
Nach dem Vergleich habe ich mich für eine chronologische Erzählstruktur entschieden.

## Entwicklungsphasen
v1 – Vertikales Scrolling (von unten nach oben)

Die erste Version basierte auf vertikalem Scrolling und enthielt mehrere interaktive Elemente. Nach einem Visualisieren-Coaching wurde jedoch deutlich, dass der erzählerische Kern noch nicht klar genug war. Deshalb habe ich Fotos neu aufgenommen und Illustrationen überarbeitet. Die Version v1.1 reduzierte zudem viele Interaktionen.Die erzählerische Klarheit verbesserte sich, jedoch blieb die Übergangs- und Scroll-Flüssigkeit hinter den Erwartungen.

v2 – Horizontaler Einstieg (Experiment)

Durch Feedback von Kommiliton*innen im Visualisieren-Kurs wurde mir bewusst, dass die Aussage des Projekts – insbesondere im Schlussbereich – noch zu unklar war. Daher habe ich das Ende erneut visuell angepasst. Zur besseren Leserführung habe ich die ersten zwei Seiten auf eine horizontale Scrollebene (cover-h-track) umgestellt, die übrigen Seiten blieben vertikal.Der hybride Ansatz brachte neue Ideen, erwies sich jedoch in der praktischen Nutzung als wenig überzeugend und wurde verworfen.

v3 – Finale Version: Vertikal + Maskierung auf der Startseite

Die finale Version kehrte zu einem reinen vertikalen Layout zurück. Auf der ersten Seite wurden Maskierungen (sheepblack, sheeye, Maxi5) integriert, um das Hero-Schaf visuell zu führen. Gleichzeitig wurden Fotos und Illustrationen erneut überarbeitet, um das Thema klarer und visuell einheitlicher zu vermitteln. Dieses Konzept bildet die endgültige Darstellungsform des Projekts.

## Zentrale Herausforderungen & Lösungen

1) Unklare Logik beim „Zurück nach oben“-Scrollen
Zu Beginn war das Rückscroll-Verhalten nicht eindeutig definiert. Dadurch kam es beim Scrollen zum Ausgangspunkt zu Zustandsfehlern — insbesondere wegen der Maskierungen und Ebenen der ersten Seite.
Lösung: Neudefinition des Rücksprungs, Vereinheitlichung der Zustände, damit der Ausgangspunkt stabil wiederhergestellt wird.
![Nach dem Aktualisieren der Seite darf das Schaf beim Hochscrollen nicht die Maskenseite überdecken](images/readme/sheepontop.png)

2) Uneinheitliche Typografie → komplette Handschrift
Mehrere Schriftarten störten die visuelle Kohärenz sowie die erzählerische Stimmung.
Lösung: Umstellung auf eine einheitliche handschriftliche Typografie, passend zur Illustration und emotionalen Erzählweise.

3) Sound-Trigger auf der Startseite
Aufgrund der Maskierung auf der ersten Seite konnte der Sound nicht gleich beim Einstieg ausgelöst werden.
Lösung: Verschiebung des Sound-Triggers auf einen bestimmten Scroll- oder Interaktionspunkt, der nicht von Masken blockiert wird.


## Werkzeuge & Erkenntnisse#
1) AI Copilot – Unterstützung bei Illustration & Design
Der Einsatz von AI Copilot beschleunigte die visuellen Arbeitsschritte. Wichtiges Learning: präzise Aufgabenstellung (Stil, Detailtiefe, Ziel) führt zu bessern Ergebnissen.

2) Experimentelle KI-Animation (z. B. Räder, laufendes Schaf)
Die Tests zeigten, dass KI-Animation weiterhin manuelle Feinarbeit benötigt, etwa bei Timing, Hintergründen oder Keyframes.
![Im Bild werden gelegentlich unerwartete bzw. nicht vorgesehene Elemente angezeigt.]
(./images/readme/car.png)

3) Erstes Scroll-Narrativ mit Animation
da dies mein erstes scrollbasiertes Erzählprojekt mit Animation war, war anfangs nicht absehbar, welche Effekte technisch möglich oder problematisch sein würden. Dies führte zu vielen explorativen Anpassungen im Layout, in der Interaktion und im Responsive-Design.
Der gesamte Entwicklungsprozess dauerte ca. 3 Monate in Wochenend und führte schrittweise zur finalen Version v3. Dabei entstanden wertvolle praktische Erfahrungen zu Interaktionsdesign, Web-Animation und Cross-Device-Optimierung.


## Bugs

Allgemein

Die Logik für das Verschwinden des Schafs wird ab Seite 4 von rechts ausgelöst. Wenn jedoch sehr schnell nach unten gescrollt wird, kann das Schaf trotzdem noch auf Seite 5, 6 oder 7 sichtbar sein.

Seite 1

Ein Zurückscrollen zum Ausgangspunkt von Seite 1 ist nicht möglich; nur ein Neuladen der Seite funktioniert. Bisher gibt es keine überzeugende Lösung für diese Rücksprung-Logik.

Aufgrund der schwarzen Maske auf der Startseite wird kein Ton abgespielt.


## Technologien#

HTML, CSS, JavaScript
Scroll-Interaktion + Animation
Handgezeichnete Illustrationen + Fotografie + KI-unterstützte Assets +AE +Premiere
