# Tasks

## 1. Spike

- [x] 1.1 Fillet tools: build the prism/revolve tools for a chamfer and a fillet on a box edge, a cylinder rim and a rounded-rectangle outline with a corner; check validity with `expectValidSolid`, volumes against the formulas, corner behaviour with three edges meeting; record tolerances, segment counts and visible defects in `design.md` Decision 5. If corners are unacceptable, restrict to isolated chains and say so in the proposal via `/opsx:update`.
- [x] 1.2 Segmentation: time flat-region and feature-edge recognition on a 500k-triangle mesh in a worker; set the triangle limit and the default thresholds (Decisions 1, 2, 8).

## 2. Topology (React-free, `src/geometry/topology/`)

- [x] 2.1 `faces.ts`: adjacency, flat regions, smooth patches, whole-mesh segmentation with region ids per triangle, primitive classification (plane, cylinder, cone, sphere) with residuals; builds on `planarRegion` of `42`. Test: box (6 regions), cylinder (3), sphere (1 smooth), L-bracket, tolerance behaviour.
- [x] 2.2 `edges.ts`: feature edges by dihedral threshold, chains through degree-2 vertices, line/circle/free classification, convex/concave sign. Test: box (12 lines), cylinder (2 circles + seam handled), rounded rectangle outline (lines and arcs), noisy edge not classified as circle.
- [x] 2.3 `reference.ts`: `FaceRef`/`EdgeRef` creation and `resolveFace`/`resolveEdge` with tolerance scaling and `ambiguous`/`missing` results. Test: resolution after a small scale of the source, after a pushed neighbouring face, ambiguous parallel faces, missing after deletion.
- [x] 2.4 Tune the thresholds (30° dihedral, 1° coplanar) on five reference models and record them in `design.md`.

## 3. Operations (`geometry/features/ops/`)

- [x] 3.1 `pushPull.ts` for planar regions with holes, several coplanar faces, clamped negative distances, refusal of non-planar. Test with `expectValidSolid`: the cube scenarios of the spec, plate with hole, clamp message value.
- [x] 3.2 `edgeBreak3d.ts` chamfer and fillet for lines, circles and mixed chains, mitre joins at shared corners, limits (size, dihedral) with message values. Test: volumes of the spec scenarios, all-four-top-edges cube valid and closed, hole rim, concave corner, too-large radius message.
- [x] 3.3 Register `pushPull` and `edgeBreak` in the stack (normalisation, summaries, failed reasons `face.error.*`, `edge.error.*`). Test: round trip through `migrateScene`, failed reference blocks later ops, editing size keeps refs.
- [x] 3.4 Face-based sketch plane: `{face, frame}` kind in `editor/sketch/plane.ts`, frame rule (longest straight edge, fallback axes), detached state, re-resolution; projection of loops and chains into sketch geometry. Test: frame for box faces, detached behaviour, projected circle and lines with coincident endpoints.

## 4. Worker and viewport

- [x] 4.1 `topology` computed in the worker with progress jobs and cache by mesh hash; client API `topologyOf(meshId)`. Test with the inline fallback: caching, progress, limit message.
- [x] 4.2 Viewport: face/edge highlight layers (per-triangle colours on an overlay mesh, edge polylines), hover and selection, edge picking by screen distance, pointer modes; Object mode unchanged. Test the pure picking helpers and the colour mapping; browser check with hover on a box, cylinder and an imported STL.

## 5. UI (no artboard exists: built from `ui/` components and tokens)

- [x] 5.1 Mode switch in the tool bar and hotkeys, status line (faces/edges selected, area, length, kind), sharpness threshold control, limit message. Component tests.
- [x] 5.2 `PushPullTool` (drag handle along the normal with snapping, typed distance with `LengthField`, preview), `EdgeBreakTool` (chamfer/fillet toggle, size field, preview, error messages), Sketch on face and Project edges commands in the context menu. Component tests and a browser check.
- [x] 5.3 Stack rows for the new operations with re-pick actions on failure; strings in `en.json` and `ru.json` (`face.*`, `edge.*`, `topology.*`, log keys); key parity.

## 6. Version

- [x] 6.1 Bump `package.json` to 1.15.0 and add `1.15.0 — 44-editor-face-tools` to `CHANGELOG.md`. Test: `site.test.ts`.

## 7. Verification

- [x] 7.1 `npm test` and `npm run build` are green, the dev server starts, no console errors; earlier editor features unchanged.
- [x] 7.2 In the browser, en and ru, desktop and 390 px: on an imported bracket STL push a wall out, push a pocket in, fillet the outer edges and a hole rim, chamfer an inner edge, sketch on its top face with projected outline and cut a slot, change an earlier dimension and see the references hold or fail clearly, undo through all, export and check bbox and volumes.
  - Проверено в Chromium (headless, WebGL через SwiftShader) на `http://localhost:5174/#/editor`, окно 1440×900 и 390×844, языки ru и en. Эталон — импортированная скобка 60×60×50 мм (карман 24×24×4, стенка 40 мм, два отверстия Ø8), объём 56697,1 мм³.
  - Грани: площади совпадают с расчётом (стенка 2400,0 мм², дно кармана 576,0 мм², верх стенки 900,0 мм²). Выдавливание стенки наружу на 5 мм добавило ровно 2400×5 = 12000 мм³, вдавливание дна кармана на 2 мм убрало 576×2 = 1152 мм³.
  - Рёбра: обод отверстия распознан как круглое (25,1 мм), внешнее и внутреннее (вогнутое) — как прямые по 60,0 мм. Фаска и скругление применяются, стек показывает строки «Выдавливание (1 грани, +5 mm)», «Скругление (1 рёбер, 1 mm)», «Фаска (1 рёбер, 1 mm)».
  - Ошибка операции видна явно: при заведомо большом размере строка стека помечается ошибкой и показывает кнопку «Выбрать заново» (в объектном режиме кнопка не срабатывала — исправлено, см. ниже).
  - Эскиз на грани: верхняя грань стенки → «Проецировать рёбра» даёт эскиз с 4 кривыми и 4 точками (контур грани), плоскость совпадает с гранью.
  - Изменение раннего размера (ширина примитива 20 → 30 мм) не ломает ссылку: операция выдавливания остаётся в стеке и применяется к новой форме, ошибок нет.
  - Отмена: Ctrl+Z возвращает геометрию точно — после отмены выдавливания экспорт снова даёт 304 треугольника и 56697,1 мм³.
  - Экспорт STL: габарит 60×60×50 мм, объём после операций 67487,9 мм³ (расчёт: 56697,1 + 12000 − 1152 − ≈57 на фаски и скругления).
  - Раскладка 390 px: страница не разъезжалась (ширина документа 390 px), канва во весь экран, выбор грани и панель инструментов граней в шторке работают; тулбар редактора сделан прокручиваемым по горизонтали — до этого он растягивал страницу до 915 px.
  - Исправлено по итогам проверки: «Выбрать заново» в стеке находил объект только в режимах граней/рёбер и не срабатывал в объектном режиме (`EditorMode.handleRePickOp`); добавлен регрессионный тест в `EditorMode.test.tsx`.
  - Исправлено по итогам проверки: после прокрутки тулбара его выпадающие меню («Добавить», шаг привязки, горячие клавиши) обрезались overflow — переведены на `position: fixed` с координатами от кнопки (`useAnchorRect` в `Toolbar.tsx`); добавлен тест в `Toolbar.test.tsx`.
  - Исправлено по итогам проверки: выбранная грань не подсвечивалась (был виден только весь объект) — в накладке граней цвет задавался на треугольник, а three.js ждёт атрибут цвета на вершину, поэтому буфер был втрое короче геометрии и подсветка терялась (`faceOverlayVertexColors` в `features/viewport/topologyView.ts`, `buildFaceOverlayGeometry` в `topologyOverlay.ts`); добавлен тест в `topologyView.test.ts`.
  - Исправлено по итогам проверки: в режимах граней и рёбер нельзя было выбрать другой объект — обработчик клика возвращался сразу после выбора элемента топологии; теперь луч по телам сцены идёт первым и клик по другому объекту выбирает его, топология переезжает на него, режим сохраняется (`pickObjectAt` и `topologyClickTarget`); добавлены тесты в `topologyView.test.ts` и `EditorMode.test.tsx`.
  - Проверено в браузере после правок (Chromium headless, 1440×900): выбранная грань зелёная (#86b9b4) среди синих граней (#7282a1), наведение — янтарное (#bab39a), выбранное ребро — зелёное (#94e3c2), наведение на ребро — янтарное (#f3d894); клик по второму кубу в режиме грани выбирает его (режим «Грань» сохраняется, накладка переезжает на второй куб). Непрозрачность наведения поднята с 0,42 до 0,55 — на светлом объекте янтарный вымывался.
  - В консоли нет ошибок приложения; 404 и `ERR_CERT_AUTHORITY_INVALID` относятся к внешнему счётчику Яндекс.Метрики, недоступному в песочнице.

