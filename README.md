# Lienzo ER

Prototipo móvil de un editor conceptual de diagramas entidad–relación con notación académica tipo Chen. El diagrama semántico es la fuente de verdad; React Flow solo representa su proyección visual.

La interfaz está en español e incluye entidades fuertes/débiles, atributos clave, relaciones binarias con cardinalidades, atributos de relación, temas, persistencia local y undo/redo.

## Arquitectura

- `src/domain/`: modelo, operaciones, store Zustand, persistencia y muestra inicial.
- `src/renderers/chen-stem/`: proyección React Flow y componentes visuales de la notación.
- `src/themes/`: presets visuales independientes del modelo.
- `src/App.tsx` y `src/styles/`: shell responsive, flujos y bottom sheets.

El contenido guardado es un `Diagram` semántico versionado bajo `er-diagram:v1`; los nodos y edges de React Flow nunca se persisten.

## Desarrollo

```bash
bun install
bun run dev
```

También funciona con `npm install` y `npm run dev`.

## Verificación

```bash
bun run test
bun run lint
bun run build
bun run preview
```

## GitHub Pages

El workflow `.github/workflows/deploy-pages.yml` construye y publica `dist` al hacer push a `main`. En GitHub, selecciona **Settings → Pages → Source → GitHub Actions**.

La ruta base de producción está configurada como `/er-diagrams/` en `vite.config.ts`. Si cambia el nombre del repositorio, cambia esa única cadena.
