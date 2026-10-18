# Changelog / Журнал изменений

## 2.0.4 - 2026-10-18

- On a phone the numbers in the start menu broke in the middle: at 360 px a best score of 1 234 567 showed as "1 234 / 567", 154 320 coins as "154 3 / 20" (the fourth box, "Boards", made the others narrower). Now a number is never broken: if the four boxes do not fit in a row, the numbers get a little smaller (not below 15 px); if that is not enough, the boxes stand in two rows of two, the name and the number side by side; for very large numbers on the narrowest screens - the name above the number. / На телефоне числа в стартовом меню рвались посередине: на 360 px рекорд 1 234 567 выглядел как «1 234 / 567», 154 320 монет - как «154 3 / 20» (четвёртая плашка «Доски» сузила остальные). Теперь число никогда не переносится: если четыре плашки не помещаются в ряд, числа чуть мельче (не меньше 15 px); если и так тесно - плашки встают в два ряда по две, подпись и число рядом; для очень больших чисел на самых узких экранах - подпись над числом.
- The same in the shop (coins, keys, boards) and in the results of a run (score, coins, distance, combo); the results now write thousands with spaces, as the menu does. In the achievements "10 000" and "50 000" no longer break between the digits (English: "10,000"). / То же в магазине (монеты, ключи, доски) и в итогах забега (очки, монеты, дистанция, комбо); итоги теперь пишут тысячи с пробелами, как меню. В достижениях «10 000» и «50 000» больше не рвутся между цифрами (по-английски - «10,000»).
- Every box in the start menu has its icon: a cup for the best score, a coin, a key and a board. / У каждой плашки стартового меню своя иконка: кубок у рекорда, монета, ключ и доска.
- Laws: a page scenario - at 320, 360, 390, 768 and 1280 px, in Russian and English, with usual and very large numbers, no number on the menu, achievements, records, shop and results screens is on two lines, the boxes are inside the screen and not on each other, the name and the number are inside their box. On 2.0.3 it fails (the best score and the coins of the menu at 360 px among others). 5 new mutants caught (89 in all). / Законы: сценарий страницы - на 320, 360, 390, 768 и 1280 px, по-русски и по-английски, с обычными и очень большими числами ни одно число на экранах меню, достижений, рекордов, магазина и итогов не стоит на двух строках, плашки внутри экрана и не налезают друг на друга, подпись и число внутри своей плашки. На 2.0.3 закон падает (в том числе на рекорде и монетах меню на 360 px). 5 новых мутантов пойманы (всего 89).

## 2.0.3 - 2026-10-17

- The start menu shows how many hoverboards the player has, next to the coins and keys, in the same box with a board icon. The number is the stock of the save: 3 after the gift, one more after a purchase in the shop, one less after a board spent in a run. / Стартовое меню показывает, сколько у игрока досок, - рядом с монетами и ключами, в такой же плашке, с иконкой доски. Число - запас из сохранения: 3 после подарка, на одну больше после покупки в магазине, на одну меньше после доски, потраченной в забеге.
- Laws: a page scenario (the menu number equals the save after the gift for a new and an old save, after a purchase and after a run; the box is in one row with the others), 2 new mutants caught (84 in all). / Законы: сценарий страницы (число в меню равно сохранению после подарка новому и старому сохранению, после покупки и после забега; плашка в одном ряду с остальными), 2 новых мутанта пойманы (всего 84).

## 2.0.2 - 2026-10-17

- Clipping an obstacle with an edge is a knock, as in the classic runners, not a crash: a late jump that catches the top of a hurdle with the toes, an early one that lands on its back edge, a late dodge that clips a corner of a hurdle, a fence or a train. If the player is never deeper than 10 % of the obstacle's height or width, they stumble (2.5 s, the combo is lost, no trick for that obstacle); a second knock or side hit in that time is a crash, a head-on run into it is a crash as before. Measured: the knock adds about 34 ms at the start speed and 17 ms at full speed on each side of the jump window. / Задеть препятствие краем - ушиб, как в классических раннерах, а не авария: поздний прыжок, когда носки цепляют верх барьера, ранний, когда приземляешься на его задний край, поздний уход в сторону, когда задеваешь угол барьера, ограждения или поезда. Если игрок ни разу не оказался глубже 10 % высоты или ширины препятствия, он спотыкается (2,5 с, комбо сгорает, трюка за это препятствие нет); второй ушиб или удар боком за это время - авария, бег в лоб - авария, как раньше. Замер: ушиб прибавляет около 34 мс на стартовой скорости и 17 мс на полной с каждой стороны окна прыжка.
- The hitboxes of hurdles, bars and fences were deeper along the track than their models (0.3 / 0.4 / 0.35 m against 0.1 / 0.25 / 0.08 m seen): a jump that visibly cleared the hurdle could still hit it. Now the hitbox is the model: 0.1 / 0.25 / 0.1 m. / Хитбоксы барьера, перекладины и ограждения были глубже по ходу, чем их модели (0,3 / 0,4 / 0,35 м против видимых 0,1 / 0,25 / 0,08 м): прыжок, который на глаз проходил барьер, мог в него врезаться. Теперь хитбокс равен модели: 0,1 / 0,25 / 0,1 м.
- A new player starts with three hoverboards; an existing save with fewer than three gets them topped up to three once, on the first start of 2.0.2. / Новый игрок начинает с тремя досками; у сохранения, где досок меньше трёх, их один раз, при первом запуске 2.0.2, становится три.
- Coins of a run: checked every way to go on with the same run (pause and "Continue", settings from the pause, a lost focus, continuing after a crash for a key or for coins) - the coins of the run stay, the results put them into the bank; "Restart" and "Menu" start a new game. A law keeps it so. / Монеты забега: проверены все способы продолжить тот же забег (пауза и «Продолжить», настройки с паузы, потеря фокуса, продолжение после аварии за ключ и за монеты) - монеты забега остаются, итоги кладут их в банк; «Заново» и «В меню» начинают новую игру. Закон это держит.
- Laws: 4 new rules laws (knock bands at three speeds, second knock, corners; the gift), 4 page scenarios (coins of a continued run, the gift for a new and an old save, hitboxes against the models), 10 new mutants caught (82 in all). / Законы: 4 новых закона правил, 4 сценария страницы, 10 новых мутантов пойманы (всего 82).

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
