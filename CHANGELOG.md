# CHANGELOG

sw25-ce is a community edition of [sw25-fvtt](https://github.com/jeannjeann/sw25-fvtt) by Jean.N. Versions 2.4.1 and
older are the original system's history, kept as it was written. The 3.0.0-ce.* entries are sw25-ce's changes.
Builds ce.10 to ce.18 were **test pre-releases** (`-test` tags on GitHub). **ce.19 is the first full release.**
All builds are framework only, and no rulebook content packs are included.

## 3.0.0-ce.19 (2026-10-28) — first full release
- First full (non-test) release of sw25-ce. It includes everything from ce.10 to ce.18 below.
- Installs from the "latest" manifest now update automatically: `https://github.com/CrestedEcho/sw25-ce/releases/latest/download/system.json`.
- Stat-block skills: the Declaration tooltip now says it is "declared as part of the attack or action it modifies" (it used to say "declared at turn start").
- English manual: the timing symbols now match the sheet (○ Constant, ► Major Action, ⏩ Minor Action, △ Combat Preparation, 🗨 Declaration). It also notes that spells don't show timing icons, since casting is normally a Major Action.

## 3.0.0-ce.18-test (2026-10-28)
- Gear is never auto-equipped when it lands on a character (drops, compendium, grants). Dropping it onto a slot still equips it.
- Accessory items now show as **"Equippable Gear"** ("Gear" for short). The manual is updated.
- Item sheets: label boxes are readable on both the parchment and dark themes.
- Magic tab: no more "Magic Power NaN", and resistance is shown in English words instead of raw keys.
- Magic tab: column headers line up with the spell rows, and imported spell ranges are shown.
- Magic tab: if a school's drop-down is left empty, it uses your casting class automatically ("Auto (Class)").
- The "Show All Spells" list now looks like the school sections and uses the same Cast button.
- Spells with Active Effects or an Item Macro get **Apply Effect** / **Macro** buttons next to Cast.
- Check cards: the target's token art no longer looks like the speaker.
- **Classes card**: a class × stat table with die buttons and breakdown tooltips.

## 3.0.0-ce.17-test (2026-10-28)
- Power rolls are built in, so the "Chat Commander" module is no longer needed: `/rp k10@9+3 Sword`, `/r p10 @9 +3`, `/gmr k20`, and the aliases /powerroll /powroll /powr /rollpower /rollpow /rpow /pow. The result is the new damage card with the Apply panel, posted as a roll message. Plain `/r 2d6` is unchanged.
- The bundled **unofficial community power table** (Power 0–100, `module/data/power-table.mjs`) is now the default for every power lookup. A filled row in the world's "Reference Power Table" journal still takes priority for that Power. A natural 2 is still an automatic failure with no damage.
- Spell MP costs are calculated and paid correctly.
- Monsters and NPCs get a **Magic** section and can cast spells from the stat block. Spells dropped on them go into Magic.
- The weapons list uses the new power roll.
- The **Sword Shards** boost works, NPCs included.
- Unique skill editor on the stat block.
- Monsters and NPCs no longer get default Resist/Attack items. Existing ones are left alone.
- Stat-block resist rolls. For multi-part monsters, the Evasion button asks which part dodges, and the Apply panel has a part picker (Defense, HP and healing go to that part).
- The round portrait shows the token art. Click it to change the token art.
- Rolls are real roll messages (dice sound, Dice So Nice!, roll mode).

## 3.0.0-ce.16-test (2026-10-28)
- **Attack card**: clicking a weapon's Accuracy posts one card with Accuracy, Evasion and Damage buttons. HIT / MISS shows once both rolls are in. A tie misses, and a natural 2 / 12 on a rolled check auto-fails / auto-succeeds.
- Monsters roll 2d6 + Standard Value (fixed value − 7). The stat block has an Attack card button for each part.
- Evasion: players roll with their assigned character, and the GM rolls with the selected token.
- Damage card: a big total, the power and critical rolls, the bonus (added once), and a source breakdown you can expand.
- **Apply panel**: Physical / Magic / Fixed, HP / MP, and ×−1 (heal) / ×0 / ×¼ / ×½ / ×1 / ×2 for each target. Defense only applies to physical damage, and halves round up after Defense. Applying to tokens you don't own needs a GM online.
- Token HUD conditions (tracking only).
- Shift-click Accuracy / Damage keeps the old rolls.

## 3.0.0-ce.15-test (2026-10-26)
- Combat feats: drag and drop works for feats and belt slots. The Activate checkbox puts the feat in a slot or takes it out. Combat feats show again in the Classes & Feats tab.
- Click an empty belt slot to pick a consumable, or an empty unlocked feat slot to pick a feat.
- New **Consumable** item type (potions, herbs, bandages, scrolls, ammo, mako stones), so they can go on the belt.
- Removed the old actor-list target dialog.

## 3.0.0-ce.14-test (2026-10-26)
- Damage table fix: weapon damage reads its Power table in one place and adds the bonus once.
- Clickable monster/NPC portrait, with the type icon as a corner badge.
- Monster/NPC sheet: Play/Edit lock, fixed and 2d6 dice buttons for every check, HP/MP damage and heal boxes, inventory, GM-only loot roll, and a Cast button for each spell.
- A consumable belt shared by PC, NPC and monster sheets.
- Friendly damage card with labelled rows (Dice / Table result / Bonus / Crits) and spelled-out buttons.
- A "Target:" row with token portraits on damage and attack cards.

## 3.0.0-ce.13-test (2026-10-25)
- Damage shown as "Power / Crit / Bonus" on the sheet tile, the weapon card and the power chat header.

## 3.0.0-ce.12-test (2026-10-25)
- Weapon power tables and crits, Apply damage/healing buttons, monster spellcasting and spell damage cards, and a Resisted button.
- Weakness reveal, a Dead / Mark Defeated fix, and "Recalc w/o Crit" on crit cards.
- Defaults for checks and initiative, and the round number on cards.

## 3.0.0-ce.11-test (2026-10-25)
- New styled NPC/Monster **stat-block sheet**, with HP/MP for each part.
- **Fellow card** for NPCs who join the party (1d action roll, MP bar).
- Hostile / Neutral toggle for monsters, which sets the token disposition.
- Cast button and MP deduction for NPC/monster magic skills.
- Clicking a class row opens the class item. The Combat and non-combat feats are split.

## 3.0.0-ce.10-test (2026-10-25)
- **Rules engine** for class items (`system.rules`), with class grants (by level, with choices), per-field overrides, and a rules/grants editor on the skill sheet.
- NPC/Monster stat-block data (`system.sb`).
- Developer tooling (pack JSON tools, a compendium builder for your own data). No content packs are shipped.

## 3.0.0-ce.9
- Fix (v14): `SW25Actor.prepareBaseData` / `prepareDerivedData` (and Item / ActiveEffect `prepareDerivedData`) now call `super`. Core v14 `Actor#prepareBaseData` initialises and resets the per-cycle ActiveEffect phase state; skipping it caused "Cannot set properties of undefined (setting 'initial')" on construction and "phase initial/final has already completed" on every re-preparation (updateSource, updates, drops).
- Dark-leather theme: readable light-parchment text for the Weapons table, the Money line and the Equipment Card / feat / belt labels.

## 3.0.0-ce.8
- Fix (v14): creating a character failed ("Cannot set properties of undefined (setting 'initial')", repeated "ActiveEffect application phase … has already completed"). Combat feat preparation called `item.update()` inside data preparation; the constant/declaration/main flags are now derived in memory only.
- Equipment Card / auto-feat sync hooks: skip our own writes, require persisted ids, and run serially per actor (no re-entrancy); new `createActor` hook slots gear that was created together with the actor.

## 3.0.0-ce.7
- Equipment Card panel docked to the left of the character sheet (header toggle, remembered per user; auto-hides on narrow windows): 13 equipment slots, drop validation, replace/unequip, two-handed weapons lock the Off Hand, kept in sync with item equip state; Other Accessories list; Defense/Evasion chips.
- Portrait on the card (cover-fit, top-anchored) with a pan/zoom/fit portrait editor (stored in `flags.sw25-ce.equipPortrait`).
- Combat tab reorganised: Money/Deposit/Debt, combat tiles, Weapons, Combat Feats slots (Lv1–15, unlocked by level) with Auto/Racial lists, Consumables Belt (world setting 4–10 slots, default 6; ticks, chat message on use, shift-click to restore). Old Equipped Gear panel removed.
- Labels renamed to the wiki's English terms (see ce7-renames.md); Defence→Defense, Armour→Armor.
- Framework hooks for future class compendiums: `system.rules` and `system.autoFeats` on class (skill) items, generic Minimum Strength warning. No class-specific modifiers are shipped.
- Item `uses` (value/max) field for consumables.
- Fix: `Number(x) ?? 0 + …` precedence bugs in magic power / cast calculations.
- One-time non-destructive migration of equipped gear and feats into the new slots.

## 2.4.1
- Korean support  by [CC8788](https://github.com/CC8788)

## 2.4.0
- ビブリオマンサー対応  by [keyslock](https://github.com/keyslock)  from [#50](https://github.com/jeannjeann/sw25-fvtt/pull/50)
- UXアップデート  by [keyslock](https://github.com/keyslock)  from [#50](https://github.com/jeannjeann/sw25-fvtt/pull/50)

## 2.3.2
- loot count bug fix & daemon cancel Mp add  by [keyslock](https://github.com/keyslock)  from [#49](https://github.com/jeannjeann/sw25-fvtt/pull/49)

## 2.3.1
- UXアップデート  by [keyslock](https://github.com/keyslock)  from [#48](https://github.com/jeannjeann/sw25-fvtt/pull/48)
- Bug fix  by [keyslock](https://github.com/keyslock)  from [#48](https://github.com/jeannjeann/sw25-fvtt/pull/48)

## 2.3.0
- UXアップデート  by [keyslock](https://github.com/keyslock)  from [#47](https://github.com/jeannjeann/sw25-fvtt/pull/47)

## 2.2.2
- bug fix

## 2.2.1
- English localize update  by [kuouvadis](https://github.com/kuouvadis)  from [#44](https://github.com/jeannjeann/sw25-fvtt/pull/44)
- bug fix  by [keyslock](https://github.com/keyslock)  from [#45](https://github.com/jeannjeann/sw25-fvtt/pull/45)

## 2.2.0
- UXアップデート  by [keyslock](https://github.com/keyslock)  from [#42](https://github.com/jeannjeann/sw25-fvtt/pull/42)
- 複数の機能追加  by [keyslock](https://github.com/keyslock)  from [#42](https://github.com/jeannjeann/sw25-fvtt/pull/42)
- 各アイテムデータ構造変更  by [keyslock](https://github.com/keyslock)  from [#42](https://github.com/jeannjeann/sw25-fvtt/pull/42)
- bug fix  by [keyslock](https://github.com/keyslock)  from [#42](https://github.com/jeannjeann/sw25-fvtt/pull/42)

**！注意！**  アイテムデータの変更が行われており、自動または手動でのデータ変換をできるようにしています。しかし、データ破損の可能性もあるため、ワールドデータや辞典データはバックアップを行ってから導入してください。

## 2.1.5
- bug fix

## 2.1.4
- bug fix

## 2.1.3
- bug fix

## 2.1.2
- bug fix

## 2.1.1
- bug fix  by [keyslock](https://github.com/keyslock)  from [#40](https://github.com/jeannjeann/sw25-fvtt/pull/40)

## 2.1.0
- v13一部対応  by [Ryotai](https://github.com/ryotai-trpg)  from [#38](https://github.com/jeannjeann/sw25-fvtt/pull/38)
- bug fix

## 2.0.0  Rquire Foundry VTT ver.12 or newer
- v12互換性向上  by [Ryotai](https://github.com/ryotai-trpg)  from [#35](https://github.com/jeannjeann/sw25-fvtt/pull/35)
- v11非互換
- bug fix

## 1.4.1
- UX修正  by [keyslock](https://github.com/keyslock)  from [#37](https://github.com/jeannjeann/sw25-fvtt/pull/37)
- bug fix  by [keyslock](https://github.com/keyslock)  from [#37](https://github.com/jeannjeann/sw25-fvtt/pull/37)
- bug fix

## 1.4.0
- 複数のUX修正  by [keyslock](https://github.com/keyslock)  from [#34](https://github.com/jeannjeann/sw25-fvtt/pull/34)
- 複数のアイテムの仕様変更  by [keyslock](https://github.com/keyslock)  from [#34](https://github.com/jeannjeann/sw25-fvtt/pull/34)
- bug fix  by [keyslock](https://github.com/keyslock)  from [#34](https://github.com/jeannjeann/sw25-fvtt/pull/34)

## 1.3.0
- 複数のUX修正  by [keyslock](https://github.com/keyslock)  from [#33](https://github.com/jeannjeann/sw25-fvtt/pull/33)

## 1.2.1
- ローカライズ修正  by [Ryotai](https://github.com/ryotai-trpg)

## 1.2.0
- アイテムのデフォルトアイコンを設定  by [Ryotai](https://github.com/ryotai-trpg)
- MP消費のキャンセル機能追加  by [keyslock](https://github.com/keyslock)
- 適用時のチャット表示変更  by [keyslock](https://github.com/keyslock)
- 「種族特徴」アイテムに詳細を追加  by [keyslock](https://github.com/keyslock)
- HPとMPが上限を越えないように修正  by [keyslock](https://github.com/keyslock)
- 魔物アクターの召還魔神化に対応  by [keyslock](https://github.com/keyslock)
- ターゲット未選択時のダイアログ表示機能を追加  by [keyslock](https://github.com/keyslock)
- ロール結果およびバフを適用後にターゲットを解除するよう挙動を変更
- 同梱マニュアルを削除してリンク先を参照するよう変更
- 同梱サンプルとマクロを削除
- bug and UX fix  by [keyslock](https://github.com/keyslock)
- bug fix  by [Ryotai](https://github.com/ryotai-trpg)
- bug fix

## 1.1.0
- フェロー、魔神行動表に対応
- NPC設定項目追加
- UX fix
- bug fix  by [keyslock](https://github.com/keyslock)
- bug fix

## 1.0.0
- 魔装、蛮族特殊能力、奈落魔法、操気に対応
- UX Fix by [Airamhh](https://github.com/Airamhh)
- bug fix
- β表記を削除

## 0.13.0
- 複数のターゲットへの適用機能を追加
- bug fix

## 0.12.2
- UI fix by [Airamhh](https://github.com/Airamhh)
- bug fix

## 0.12.1
- bug fix

## 0.12.0
- 武器の矢弾消費機能を追加  by [Airamhh](https://github.com/Airamhh)
- bug fix

## 0.11.1
- bug fix

## 0.11.0
- リソースの上限と下限の設定を追加
- NPCに言語の項目を追加
- Polyglotモジュールに対応
- bug fix

## 0.10.6
- bug fix

## 0.10.5
- 適用ボタンのカスタム機能を追加  by [Airamhh](https://github.com/Airamhh)
- bug fix

## 0.10.4
- 判定結果の微調整機能と適用あり時の半減機能を追加  by [keyslock](https://github.com/keyslock)
- バフ・デバフ「魔法行使」「魔法威力」に「すべて」を追加
- bug fix

## 0.10.3
- 魔法リストの折りたたみ機能を追加
- 魔物能力の威力ロールに魔力バフが影響するよう修正
- 能力値バフが命中とダメージに反映されない問題を修正
- bug fix

## 0.10.2
- バフ・デバフ「魔法行使」と「魔法威力」を追加
- バフ・デバフ「特技等」を追加し、「呪歌・終律 / 演奏」「呪歌・終律 / 威力」「賦術」を追加
- 成長ロール機能を調整  by [keyslock](https://github.com/keyslock)
- bug fix

## 0.10.1
- 半減後修正の計算ロジック変更
- バフ・デバフ「戦闘関連」に「武器半減後修正」「魔法半減後修正」を追加
- 技能による判定アイテムのグループ化を追加
- ゆとシートインポートマクロを削除
- update English manual by [kuouvadis](https://github.com/kuouvadis)
- bug fix

## 0.10.0
- ロール要求機能を追加
- 威力ロール結果の微調整機能を追加
- 成長ロール機能を追加  by [keyslock](https://github.com/keyslock)
- バフ参照元を修正  by [keyslock](https://github.com/keyslock)
- マニュアルアップデート
- UI fix
- bug fix

## 0.9.2
- 戦利品ロールに対応
- バフ・デバフの「判定」カテゴリに「戦利品」を追加
- 汎用の「その他の特技」アイテムを追加
- ゆとシートIIインポートマクロ更新  by [keyslock](https://github.com/keyslock)
- マニュアルアップデート
- bug fix

## 0.9.1
- バフ・デバフ「MP軽減」に「すべて」を追加（練技アイテムのMP消費再設定が必要）
- ゆとシートIIインポートマクロ更新  by [keyslock](https://github.com/keyslock)
- マニュアルアップデート
- update English manual by [kuouvadis](https://github.com/kuouvadis)
- bug fix

## 0.9.0
- 薬草、ポーション、修理具における判定と威力ロールの技能、能力値のデフォルト値を設定
- MP消費機能を追加
- バフ・デバフに「MP軽減」を追加（魔法アイテムのMP消費再設定が必要）
- 魔法の属性に「精神効果、毒」を追加
- ゆとシートIIインポートマクロ更新  by [keyslock](https://github.com/keyslock)
  - 複数部位魔物対応
  - 魔物特殊能力対応（β版）
- マニュアルアップデート
- bug fix

## 0.8.1
- Token Action HUDサポート
- バフ・デバフ参照元表示修正
- Add English sample
- bug fix

## 0.8.0
- v12サポート（α版、警告残存）
- Minor bug fix

## 0.7.5
- bug fix (Monster sheet, NPC sheet, Monster effect)

## 0.7.4
- UI fix by [HikariNoTsurugi](https://github.com/HikariNoTsurugi)
- UI minor fix
- bug fix

## 0.7.3
- UI fix by [HikariNoTsurugi](https://github.com/HikariNoTsurugi)

## 0.7.2
- ゆとシートIIインポートマクロ更新
- 武器カテゴリに投擲追加
- 武器と魔法における判定と威力ロールの技能、能力値のデフォルト値を設定
- マニュアルアップデート
- UI fix
- bug fix


## 0.7.1
- バフ・デバフ属性キーに魔法C値修正を追加
- 装備品の装備チェックとバフ・デバフの連動機能追加
- 威力ロール後の操作ボタンにクリティカル有効な半減ボタンを追加
- 威力ロールのクリレイパラメーターにオプション追加（運命変転に対応）
- キャラクターのイニシアチブロールを設定
- ゆとシートIIインポートマクロの機能更新
- マニュアルアップデート
- update English localization by [kuouvadis](https://github.com/kuouvadis)
- update English manual by [kuouvadis](https://github.com/kuouvadis)
- UI fix
- bug fix

## 0.7.0
- UIを一部変更
- ゲーム設定を新設（バフ・デバフ用の設定項目を追加）
- バフ・デバフの属性キーを拡張
- 魔物へのバフ・デバフの適用項目を拡大
- 一部バフの挙動変更（バフ・デバフ属性キーの再設定が必要な項目あり）
- マニュアルアップデート
- bug fix

## 0.6.7
- マニュアルアップデート
- update English localization by [kuouvadis](https://github.com/kuouvadis)
- update English manual by [kuouvadis](https://github.com/kuouvadis)
- bug fix

## 0.6.6
- 威力ロール用チャットコマンドを追加（要「Chat Commander」モジュール）
- マニュアルアップデート

## 0.6.5
- PC作成時にデフォルトの判定アイテムを追加
- 魔物作成時にデフォルトの魔物能力を追加
- コマ設定の初期値を調整
- マニュアルアップデート

## 0.6.4
- ロール結果適用に確定ダメージボタンを追加
- bug fix（魔法データ処理）

## 0.6.3
- バフ・デバフにおいて各能力値のボーナスだけを変化させる属性キーを追加
- 魔物へのバフ・デバフにおいて、一部の属性キー（最大HP、最大MP、防護点、魔法防御、ダメージ軽減）が適用可能に変更
- UI改良（魔物能力一覧に修正値入力欄追加）
- マニュアルアップデート
- bug fix

## 0.6.2
- bug fix（他キャラクターへのロール結果適用とバフ適用のバグフィックス）

## 0.6.1
- update English localization by [kuouvadis](https://github.com/kuouvadis)
- update English manual by [kuouvadis](https://github.com/kuouvadis)

## 0.6.0
- バフ・デバフ機能実装
- マニュアルアップデート
- bug fix（威力ロール計算ロジック他）
- beta version

## 0.5.2
- ゆとシートIIから一部データをインポートするマクロを同梱
- マニュアルアップデート

## 0.5.1
- English localization by [kuouvadis](https://github.com/kuouvadis)
- add English manual by [kuouvadis](https://github.com/kuouvadis)

## 0.5.0
- 汎用威力表に対応
- 威力ロールでの首切り刀対応
- マニュアルアップデート

## 0.4.0
- ロール結果をターゲットアクターに適用する機能を追加
- マニュアルアップデート
- bug fix

## 0.3.0
- キャラクターシートの一覧で、技能、判定、リソース、言語を除くアイテムの名前クリックで説明展開
- キャラクターシートの一覧に編集、削除ボタンがないリストで、説明展開時に各ボタンを表示
- 各アイテムでのアイコンクリック時の選択肢に「すべて」を追加
- 「すべて」選択時に説明と有効にしているロールを行うボタンを表示
- 威力ロール結果のチャット表示部分に「半減」「Cなし」ボタンを追加
- マニュアルアップデート

## 0.2.0
- 限定的権限での表示内容を調整
- 魔物の防護点項目を独立
- サンプルデータの不具合修正
- マニュアルアップデート

## 0.1.0
- first release, alpha version