# Changelog / Журнал изменений

## 2.0.1 - 2026-10-17

- Ramps to the trains were see-through: the slope's faces were wound inside out and were not drawn. / Пандусы к поездам были прозрачными: грани склона были вывернуты наизнанку и не рисовались.
- The overhead wires hung at 5.85 m: on a train roof the camera sat right above the wire and the black wire covered the runner, a jump went through the wires. Now the catenary hangs at 10.2 m, above the runner, the jetpack and the camera. / Провода висели на 5,85 м: на крыше поезда камера оказывалась прямо над проводом, чёрный провод закрывал бегуна, прыжок проходил сквозь провода. Теперь контактная сеть на 10,2 м - выше бегуна, ранца и камеры.
- In the tunnel the vault was too low (7.3 m): a super jump from a train roof put the camera inside the ceiling ribs (the whole screen went brown for a moment), and on the jetpack the camera flew above the tunnel roof - the runner was not seen at all for several seconds. Now the vault is at 10.9 m, above the wires, the runner and the camera. / В туннеле свод был слишком низко (7,3 м): суперпрыжок с крыши поезда загонял камеру в рёбра потолка (весь экран на миг становился коричневым), а на ранце камера вылетала над крышей туннеля - бегуна несколько секунд не было видно. Теперь свод на 10,9 м - выше проводов, бегуна и камеры.
- A key found during a run did not help in that run: after a crash the game offered to continue only with the keys saved before the run ("Your keys: 0"), the new key was added only after the results. Now a found key goes into the stock at once and can pay for a continue right away (and is counted once). / Ключ, найденный в забеге, в этом забеге не помогал: после аварии продолжить предлагали только за ключи, накопленные до забега («У вас ключей: 0»), новый ключ добавлялся лишь в итогах. Теперь найденный ключ сразу идёт в запас и им можно продолжить (считается один раз).
- Achievements: the name "Путешественник" did not fit its card and stuck out of it (on a phone it was cut off together with the description); renamed to "Турист" / "Tourist", long words in the cards now wrap. / Достижения: название «Путешественник» не влезало в карточку и вылезало за край (на телефоне обрезалось вместе с описанием); теперь «Турист», длинные слова в карточках переносятся.
- Settings: the hint said "Auto" lowers the quality below 60 frames a second, really it is below 45 (as in the README). The best score in the results is written with spaces between thousands, as in the menu. / Настройки: подсказка обещала, что «Авто» снижает качество ниже 60 кадров в секунду, на деле - ниже 45 (как в README). Рекорд в итогах пишется с пробелами между тысячами, как в меню.
- Laws: the ramp's faces look outwards; the catenary and the tunnel vault are higher than the runner and the camera (roof, super jump from a roof, jetpack); a key found in a run pays for a continue; no text sticks out of the cards on any screen size; 8 new mutants are caught. / Законы: грани пандуса смотрят наружу; провода и свод туннеля выше бегуна и камеры; найденным ключом можно продолжить; текст не вылезает из карточек ни на одном размере экрана; 8 новых мутантов пойманы.

## 2.0.0 - 2026-10-17

A real runner instead of a demo. / Настоящий раннер вместо пробы.

- Five districts one after another in a run - the city by day, the industrial zone at sunset,
  the bridge over the river, the tunnel, the neon city at night - with their own light, sky,
  weather (rain, fog), scenery (houses, stations, signals, catenary, graffiti, billboards,
  warehouses, chimneys with smoke, cranes, the bridge truss, neon signs) and music.
  / Пять районов друг за другом: город днём, промзона на закате, мост над рекой, туннель,
  неоновый город ночью - со своим светом, небом, погодой (дождь, туман), окружением и музыкой.
- Detailed trains (cars with windows, doors, bogies, cabs, lights, pantographs; freight
  locomotives, box and tank cars). New obstacles: fences, repair pits, freight trains rolling
  away; hopping from roof to roof onto the train on the next track. / Детальные поезда, новые
  препятствия: ограждения, ямы-ремонт, уезжающие товарные поезда; переход с крыши на крышу.
- New power-up: the jetpack (flight over the trains along a trail of coins); spring boots became
  super sneakers (also over fences); the hoverboard can be switched on from a stock (B, E or the
  on-screen button). / Новый ускоритель - реактивный ранец; супер-кроссовки; доска по кнопке.
- Six characters on joints with animated run, jump, slide, fall, flight and hoverboard stance;
  six hoverboards; a shop with a 3D preview, upgrades, keys and spare boards. / Шесть персонажей
  на суставах с анимацией, шесть досок, магазин с просмотром в 3D.
- Tricks and combo, missions (three at a time, the score multiplier up to x30, skipping for
  keys), the daily challenge with a streak, 22 achievements with badges, the ten best runs and
  statistics, continuing a run after a crash for keys. / Трюки и комбо, задания и множитель,
  испытание дня, достижения, рекорды и статистика, продолжение за ключи.
- The tutorial in the first run; "juice": particles, camera shake, flashes, slow motion at a
  crash, a smooth camera, music by district that speeds up with the run. / Обучение в первом
  забеге; частицы, тряска, вспышки, замедление при аварии, музыка по районам.
- Settings: graphics quality "Auto" (keeps 60 fps by the frame time), high, medium, low; shadows;
  particles; camera shake. / Настройки: качество «Авто» и три уровня, тени, частицы, тряска.
- A 1.0 save is migrated with nothing lost (a law checks it). / Сохранение 1.0 переезжает без
  потерь (проверяет закон).
- Laws: 61 for the rules and progress, 30 player scenarios in headless Chromium, 3 for the app,
  64 mutants. / Законы: 61 правил и прогресса, 30 сценариев страницы, 3 программы, 64 мутанта.

## 1.0.0 - 2026-10-16

First release. / Первый выпуск.

- An endless 3D run along three railway tracks: hurdles to jump, bars to slide under,
  standing trains, trains with ramps to run onto the roof, oncoming trains with a horn.
  / Бесконечный 3D-бег по трём путям: барьеры, перекладины, стоящие поезда, поезда с пандусом
  на крышу, встречные поезда с гудком.
- The level generator always leaves a passable track and time to reach it (checked on 300
  worlds and by an autopilot with the real physics). / Генератор всегда оставляет проходимый
  путь и время до него перейти (проверено на 300 мирах и автопилотом с настоящей физикой).
- Coins, four power-ups (magnet, double score, spring boots, hoverboard shield) and upgrades
  bought with coins; the speed grows with distance. / Монеты, четыре ускорителя (магнит, двойные
  очки, ботинки-прыгуны, ховерборд-щит) и улучшения за монеты; скорость растёт с дистанцией.
- Keyboard (arrows, WASD, Space), swipes, taps and mouse drags; pause with P, Esc or the
  button; every key can be reassigned, the hints follow. / Клавиатура (стрелки, WASD, пробел),
  свайпы, касания и мышь; пауза P, Esc или кнопкой; клавиши переназначаются, подсказки за ними.
- Light, dark and system themes; Russian and English; synthesised sound and music; the best
  score, coins, upgrades and settings are saved. / Светлая, тёмная и системная темы; русский и
  английский; звук и музыка синтезом; рекорд, монеты, улучшения и настройки сохраняются.
- The Windows app (installer and portable) remembers its window; F11 - full screen.
  / Программа для Windows (установщик и portable) запоминает окно; F11 - во весь экран.
