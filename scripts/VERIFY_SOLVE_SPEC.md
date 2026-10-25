# Проверка новых ИИ-решений (solve/)

Вход: `solve/sNN.json` — объект `{id: {skills, hints, solution, answer, insight, confidence}}`,
условия — в `raw/solve_batches/sNN.json` (поля `id`, `statement`, `matol_comments`).

Для каждой задачи независимо проверь решение: каждый шаг, полноту разбора случаев, верность ответа.
Сверяй ответ с `matol_comments`, если там он есть. Проверяй вычислениями на Python там, где можно
(перебор малых случаев, численная проверка геометрии на случайной конфигурации).

Вердикт: `ok` / `fixed` (дай исправленное полное `solution` и при необходимости `answer`) / `wrong` (неверно и не исправить) / `unsure`.
`note` — одно предложение. Выход: `verify_solve/sNN.json` — `{ id: {verdict, note, solution?, answer?} }`.
Валидный JSON, `ensure_ascii=False`. Не меняй другие файлы. «ok» — только если реально проверил.
