# Nightingale Schema

Editor conceptual de diagramas entidad–relación de Nightingale, con notación académica tipo Chen. El diagrama semántico es la fuente de verdad; React Flow solo representa su proyección visual.

La interfaz está en español e incluye entidades fuertes/débiles, atributos clave, relaciones binarias con cardinalidades, atributos de relación, temas, persistencia local, undo/redo y exportación del diagrama completo como PNG, PDF o imagen en el portapapeles.

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

La aplicación de producción vive en [schema.nightingalelab.org](https://schema.nightingalelab.org/).

## Verificación

```bash
bun run test
bun run lint
bun run build
bun run preview
```

## GitHub Pages

El workflow `.github/workflows/deploy-pages.yml` construye y publica `dist` al hacer push a `main`. La configuración de Pages usa GitHub Actions como fuente de publicación.

La ruta base de producción está configurada como `/entity-relationships/` en `vite.config.ts`. Si cambia el nombre del repositorio, cambia esa única cadena.

## Android releases

El workflow `.github/workflows/android-release.yml` construye el APK desde la misma aplicación web y lo adjunta a un GitHub Release. La versión de `package.json` es la fuente de verdad para el nombre y código de versión Android. Actualiza esa versión, confirma el cambio y crea un tag coincidente:

```bash
git tag v0.1.1
git push origin v0.1.1
```

Por ejemplo, para publicar `v0.1.1`, `package.json` debe contener `"version": "0.1.1"`.

También puede ejecutarse manualmente desde la pestaña **Actions**, indicando el tag del release. No se sube el APK al repositorio; queda disponible como asset en **Releases**.
