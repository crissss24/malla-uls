# trama. · Mallas curriculares interactivas ULS

Proyecto **independiente, no oficial** para explorar planes de estudio de la **Universidad de La Serena**. Inspirado en la experiencia de las mallas interactivas universitarias, con interfaz y código originales. **No contiene horarios** ni necesita API o servidor propio.

## Publicar en GitHub Pages (sin conocimientos de programación)

1. [Crea un repositorio en GitHub](https://github.com/new), por ejemplo `mallas-uls`, de acceso **Public**.
2. Sube **todo el contenido de esta carpeta** (no solamente `index.html`) a la **raíz** del repositorio, mediante **Add file → Upload files**, y confirma con **Commit changes**. En particular, deben quedar las carpetas `css`, `js`, `data`, `assets` y el archivo `index.html` en la raíz.
3. Abre **Settings → Pages → Build and deployment**. En **Source** elige **Deploy from a branch**; elige **main** y la carpeta **/(root)**; pulsa **Save**.
4. Tu página quedará disponible en `https://TU-USUARIO.github.io/mallas-uls/`. GitHub Pages puede tardar unos instantes en publicar los cambios. Si ves un error 404, revisa la rama y el nombre del repositorio.

El proyecto usa URLs **relativas**, así que funciona tanto en `usuario.github.io/mallas-uls/` como en un dominio personalizado. No necesita configuraciones de Vite, React, npm en el servidor ni variables secretas.

> **No abras `index.html` directamente con doble clic desde tu computador** (`file://`): los navegadores bloquean habitualmente la lectura de archivos JSON mediante `fetch` desde el sistema de archivos. Usa GitHub Pages o un servidor local.

## Probar localmente

Necesitas Python 3 para previsualizar y Node.js 18+ para las pruebas automáticas (sin dependencias externas).

```bash
cd uls-mallas-interactivas
python3 -m http.server 5173
```

Abre `http://localhost:5173/` en tu navegador. En otra terminal:

```bash
npm test
```

Al subir cambios, `.github/workflows/validate.yml` ejecuta las pruebas en GitHub Actions. No es necesario ejecutarlo para que funcione GitHub Pages.

## Funciones

- Catálogo de carreras ULS agrupadas por facultad, con búsqueda.
- Múltiples versiones por carrera cuando hay publicaciones distintas; cada una tiene progreso independiente.
- Malla horizontal por semestres, colores por áreas, búsqueda y filtros.
- Marcar y desmarcar asignaturas aprobadas; porcentaje, aprobados y pendientes.
- Ficha detallada de cada asignatura.
- Definir **prerrequisitos propios**, solo entre semestres anteriores, mostrar relaciones y conectar las tarjetas mediante líneas. **No son datos certificados por la ULS**.
- Guardado local (`localStorage`), modo oscuro y vista adaptable a móviles.
- Importar/exportar respaldo en JSON para migrar entre dispositivos.
- Compartir URL de un plan publicado.
- Crear mallas individuales pegando asignaturas por semestre. Quedan solo en el navegador; el respaldo permite trasladarlas.
- No tiene cuentas, rastreadores, base de datos, inscripción de asignaturas ni horarios.

## Calidad y límites de los datos

**Importante:** la presencia de una malla en el sitio **no significa** que sea la resolución curricular vigente para todos los estudiantes. Las transcripciones provienen de publicaciones públicas señaladas en el campo `sources` de cada JSON, **mayoritariamente secundarias** (por ejemplo, Cursos y Carreras), y pueden estar incompletas o desactualizadas. Deben cotejarse con los planes de tu cohorte, Secretaría de Estudios o las resoluciones oficiales. El catálogo de carreras proviene de [ULS](https://userena.cl/carreras).

- La etiqueta `2025+` en algunas mallas civiles identifica una **renovación comunicada por la Facultad de Ingeniería**; **no confirma que todas las asignaturas o el año específico coincidan con la resolución de tu cohorte**.
- Las versiones marcadas `parcial` incluyen los semestres encontrados, pero **no** deben interpretarse como la duración real de la carrera.
- Las versiones `historico` son referencias anteriores cuyo año exacto de aplicación podría requerir verificación.
- **No se incluyen prerrequisitos institucionales, códigos de curso o créditos SCT no verificados**. La ausencia de relaciones en una tarjeta **no** indica libertad para inscribirla.
- Para carreras sin transcripción, se muestra un estado vacío con enlace institucional y posibilidad de crear un plan propio. **Nunca se fabrican asignaturas para llenar huecos**.
- El área/color de las asignaturas es una **clasificación visual heurística** y no un departamento oficial.

Fuentes indicativas de la recopilación: [Oferta de carreras ULS](https://userena.cl/carreras), [comunicado ULS sobre renovación de ingenierías](https://userena.cl/actualidad/7383-en-un-hito-hist%C3%B3rico-la-facultad-de-ingenier%C3%ADa-de-la-userena-titul%C3%B3-a-m%C3%A1s-de-500-nuev-s-profesionales.html), [Cursos y Carreras](https://www.cursosycarreras.cl/), [MiMalla](https://mimalla.com/) y [Mallapp](https://mallapp.cl/). Las referencias precisas de cada plan están en `data/plans/*.json`.

## Estructura de carpetas

```text
uls-mallas-interactivas/
├── index.html                 # Interfaz accesible y cuadros de diálogo
├── css/styles.css             # Diseño original, móvil y modo oscuro
├── js/app.js                  # Controlador: navegación, eventos, detalle, estado
├── js/logic.js                # Reglas puras: avance, filtro, mallas, relaciones
├── js/storage.js              # Guardado y respaldo local
├── data/catalog.json          # Catálogo y versiones disponibles
├── data/plans/*.json          # Una malla por archivo
├── assets/favicon.svg         # Ícono del sitio
├── scripts/build_data.py      # Generador de la recopilación inicial
├── tests/logic.test.mjs       # Pruebas automatizadas
├── .github/workflows/validate.yml
├── .nojekyll
└── README.md
```

## Añadir o corregir una malla de forma permanente

1. Reúne la **fuente curricular** (idealmente un PDF oficial con resolución y fecha).
2. Crea `data/plans/id-de-la-malla.json` siguiendo el esquema de otro plan. Cada entrada de `semesters` es un semestre, y cada curso lleva un `id` único, un `name` y un `area` (`matematicas`, `ciencias`, `ingenieria`, `gestion`, `humanidades`, `formacion`, `general`).
3. Registra `notes`, `sources`, `year`, `quality` y `prerequisitesVerified` correctamente. Mantén los prerrequisitos vacíos cuando no estén documentados.
4. Agrega el plan en `data/catalog.json` dentro de `plans`, con `file`, `semesters`, `subjects`, `label`, `careerId` e `id`.
5. Ejecuta `npm test`. Corrige los datos si alguna prueba falla. Sube los archivos a GitHub.

**Nota para quienes editen los datos:** `scripts/build_data.py` regenera los JSON de la recopilación inicial. Si corriges manualmente un plan, guarda la corrección en el script también o no vuelvas a ejecutar el generador sin revisar las diferencias.

## Privacidad y licencia

El progreso se almacena **solo en tu navegador**. Si borras los datos del sitio, lo perderás salvo que hayas exportado el respaldo. No se transfiere información académica a un servidor. Este proyecto es de código abierto, licencia MIT (ver `LICENSE`). «Universidad de La Serena» se emplea con fines descriptivos, sin implicar respaldo institucional.
