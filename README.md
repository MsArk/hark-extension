# HARK

> Captura peticiones de red que coinciden con un patrón y descarga automáticamente el **cuerpo de la respuesta** (JSON, texto, etc.).

HARK es una extensión de Chrome (Manifest V3) que escucha el tráfico de la pestaña activa y, cuando una petición coincide con el patrón configurado, obtiene el body vía Chrome DevTools Protocol y lo guarda como archivo. Pensada para flujos en los que necesitas el JSON o el payload de **una request concreta** (por ejemplo `prospecting-full`) sin abrir DevTools ni exportar todo el panel Network.

---

## Características

- **Captura selectiva** por patrón de URL o por el último segmento del path (nombre del recurso).
- **Texto plano o regex**: envuelve el patrón entre `/.../` para usar expresión regular.
- **Match exacto del path** (opcional): solo el último segmento del path debe coincidir con el patrón (útil para no mezclar con rutas tipo `/saved/123`).
- **Filtro por método HTTP**: GET, POST, PUT, PATCH, DELETE; si no marcas ninguno, se aceptan todos. Las peticiones **OPTIONS** (preflight CORS) se ignoran siempre.
- **Descarga automática** opcional; si la desactivas, la sesión sigue activa pero no se descargan coincidencias (útil si en el futuro se añade otra acción sobre el match).
- **Solo respuestas 2xx** se consideran para descargar el body.
- **JSON legible**: si la respuesta es JSON, se formatea con indentación al guardar.
- **Nombre de archivo** incluye recurso, marca de tiempo, y a veces un hint de página (`pagina-N` / `offset-N`) si el body del POST es JSON con `page` u `offset`.
- **Sin dependencias**, JavaScript estándar.

---

## Instalación

Mientras no esté publicada en la Chrome Web Store:

1. Clona o descarga este repo.
2. Abre `chrome://extensions`.
3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** y selecciona la carpeta del proyecto.
5. Opcional: fija la extensión en la barra de herramientas.

---

## Uso

1. Abre la pestaña donde quieras observar el tráfico.
2. Haz clic en el icono de **HARK**.
3. Configura el **patrón** (por defecto: `prospecting-full`), opciones de path exacto, métodos HTTP y si quieres descarga automática.
4. Pulsa **Iniciar captura**.
5. Aparecerá la barra amarilla: *DevTools is debugging this tab*. Es normal: HARK usa el mismo mecanismo que el panel Network para leer bodies.
6. Dispara la petición. Si coincide con el patrón y la respuesta es 2xx, se descarga el archivo (por ejemplo `.json`).
7. Pulsa **Detener captura** cuando termines.
8. **Reset** desactiva la captura en todas las pestañas y limpia el estado guardado de pestañas activas.

### Ejemplos de patrón

| Patrón | Comportamiento |
| ------ | --------------- |
| `prospecting-full` | Substring en la URL completa o en el último segmento del path (salvo modo path exacto). |
| `api/users` | Cualquier URL que contenga `api/users`. |
| `/\/api\/v\d+\/prospecting/` | Regex sobre URL o nombre de recurso. |
| `/\.json$/` | Regex sobre URL o nombre. |

Si el patrón empieza y termina con `/`, se interpreta como regex. Si no, búsqueda por substring **sensible a mayúsculas** en la URL y en el nombre del recurso (último segmento del path).

Con **Match exacto del path**, el nombre del recurso debe ser **exactamente** igual al patrón (modo texto plano; no aplica la interpretación tipo substring en URL larga para ese último segmento).

---

## Cómo funciona

HARK usa [`chrome.debugger`](https://developer.chrome.com/docs/extensions/reference/api/debugger) para hablar **CDP (Chrome DevTools Protocol)** con la pestaña:

1. El popup envía `start` / `stop` al service worker con el `tabId`.
2. El worker hace `chrome.debugger.attach()` y `Network.enable`.
3. Escucha `Network.requestWillBeSent`, `Network.responseReceived`, `Network.loadingFinished` (y limpia en `loadingFailed`).
4. Tras aplicar filtros (OPTIONS, métodos permitidos, patrón), si corresponde llama `Network.getResponseBody` y guarda el contenido con `chrome.downloads.download` (vía data URL), eligiendo extensión según `Content-Type`.

**Nota:** La versión actual **no** genera un archivo HAR 1.2 completo; exporta el body de la respuesta coincidente. Si necesitas un HAR estándar para otras herramientas, puedes usar *Save all as HAR* en DevTools además de HARK para los casos puntuales.

---

## Estructura del proyecto

```
Hark/
├── manifest.json    # Manifest V3
├── background.js    # Service worker: CDP, filtros y descarga
├── popup.html       # UI del popup
├── popup.js         # Estado y mensajes al worker
└── LICENSE
```

---

## Limitaciones conocidas

- **Barra amarilla de depuración**: Chrome la muestra mientras el debugger está adjunto; no se puede ocultar.
- **Un cliente CDP por pestaña**: no uses DevTools Network en la misma pestaña con captura activa, o puede haber conflictos.
- **Bodies grandes**: respuestas muy pesadas pueden fallar o ser impracticables vía data URL.
- **Documentos HTML**: el body del documento principal no siempre está disponible tras el render.
- **Service worker (MV3)**: si hubiera pausas raras sin actividad, detén e inicia la captura de nuevo.

---

## Roadmap (ideas)

- [ ] Opción de exportar coincidencias como **HAR 1.2** además del body suelto.
- [ ] Acumular varias requests en un único HAR y descargar al detener.
- [ ] Lista de varios patrones.
- [ ] Vista previa de las últimas N respuestas capturadas.
- [ ] Modo silencioso para la bandeja de descargas.
- [ ] Publicación en Chrome Web Store.

---

## Contribuir

Se aceptan PRs e ideas. Si informas de un bug, incluye versión de Chrome, patrón y filtros usados, URL aproximada (puedes ofuscar dominios) y comportamiento esperado vs. observado.

---

## Licencia

MIT — sin garantías.
