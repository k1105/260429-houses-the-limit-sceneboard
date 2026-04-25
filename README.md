# HOUSES THE LIMIT — sceneboard

ミュージックビデオ「HOUSES THE LIMIT」（全6章 / 章ごとに DJ が異なる構成）の
**シーン台本・カット割・スタイル設定** を一元管理し、Gemini を使って
リファレンス画像を量産していくための、ローカル専用の制作支援ツールです。

このアプリは、UI から生成ボタンを押す部分は単純な仕組みになっています。
**重要なのは、各カットの英語プロンプト（`scene_en` 等）や共通スタイルを
書き直す作業を、ユーザがエディタ上で AI エージェント（Claude / Cursor 等）
と一緒に行う、という運用です。** この README は主に、

- どのファイルが何のために存在するか
- ユーザが各ファイルにどう「修正方針」を書き残すか
- それを読んだ AI エージェントは何を直して、何を直してはいけないか

を、AI エージェント自身が読んで理解できる形で明文化することを目的としています。

---

## 1. ファイル構成（プロンプトに関わるものだけ）

```
data/
├── scripts/
│   └── script.md                         # 物語全体（人間用の参照台本。生成プロンプトには直接使われない）
├── narratives/
│   └── part-{1..6}.md                    # 章ごとのプロット。フロントマター + ## plot
├── cuts/
│   └── {part}-{seq}.md                   # カット 1 つ = ファイル 1 つ。プロンプト本体はここ
├── common-style/
│   ├── illustration.txt                  # スタイル別の絵作り指示
│   ├── game.txt
│   ├── camera.txt
│   └── negative.txt                      # 全スタイル共通のネガティブプロンプト
└── car-reference.jpeg                    # 主人公の黒いセダン参照画像（生成時に常に同梱）
```

生成画像と生成済みインデックスは `data/images/` 以下にあるが、
**プロンプト書き換え作業では触らない**（.gitignore 対象、UI が管理する）。

---

## 2. カットファイル `data/cuts/{cut_id}.md` のフォーマット

これがエージェントが一番触るファイルです。**フロントマター（YAML）＋ Markdown 本文** の構成で、
本文は `## camera` / `## scene_en` / `## video_prompt_en` の **3 セクション固定** です。

### 2.1 完全な実例

```markdown
---
cut_id: 2-3
part: 2
dj: zukiodayo
setting: 変質の星（反復する団地）
title_jp: 同じ形の団地が地平線まで無数に並びはじめる
summary_jp: 草原の向こうに同じ形のコンクリート団地が無数に並ぶ。どこまで行っても同じ大きさで繰り返される
status: draft
revision_memo: ''
selected_image:
  illustration: 20260425T115247-migrated.png
  game: 20260425T115247-migrated.png
  camera: 20260425T115246-migrated.png
---
## camera

Wide three-quarter view — car on road, infinite danchi repetition

## scene_en

A surreal polygonal landscape: endlessly repeating identical Japanese-style concrete apartment complex buildings (danchi) of pale concrete extending to every horizon. Each building perfectly identical in size, window layout, and external staircase, regardless of distance — not shrinking with perspective, violating natural depth. Narrow strips of grass barely visible between buildings. The black sedan positioned mid-frame on a narrow strip of road threading between rows of buildings. The saturated sky-blue sky still visible above but now narrower, reading as enclosed. The distant red balloon barely visible far away between repeating buildings. Palette: pale concrete grey dominant for buildings, sky-blue narrowing above, red balloon distant accent, traces of deep-green grass between structures.

## video_prompt_en

The buildings and car holding their positions while subtle parallax shifts cycle across the repeating rows in a seamless pattern loop — creating a perceptual sense of motion without actual forward travel; the red balloon bobbing at its fixed distance.
```

### 2.2 フロントマターの各フィールド

| フィールド | 意味 | エージェントが触ってよいか |
|---|---|---|
| `cut_id` | カット識別子。**ファイル名（拡張子を除く）と必ず一致させる** | 値の書き換えは原則しない（リネームしたいときは §2.5 の手順） |
| `part` | 章番号（1〜7） | 触らない |
| `dj` | 担当 DJ。章ごとに固定 | 触らない |
| `setting` | 舞台の和文ラベル | ユーザ指示があれば編集可 |
| `title_jp` | カットの和文タイトル（人間用） | ユーザ指示があれば編集可 |
| `summary_jp` | 和文要約（人間用） | ユーザ指示があれば編集可 |
| `status` | `draft` / `reviewing` / `approved` のいずれか | **エージェントは変更しない**。人間がレビュー結果として動かす |
| `revision_memo` | **修正指示の置き場（後述）** | ここを **読んで** 本文を直す。空文字 `''` に戻すかどうかは §4 のルール参照 |
| `selected_image` | スタイル別に「採用中」のファイル名 | **絶対に触らない**。サーバが自動更新する |
| `include_car_reference` | このカットで車（黒いセダン）を登場させるか。`true`/`false`。**未指定時は `true` 扱い**。`false` のとき、`car-reference.jpeg` の同梱と `common-style/car-clause.txt` の連結をスキップする | ユーザ指示があれば編集可（クローズアップ・車のないシーン等で `false` に） |

### 2.3 本文セクションの役割

| セクション | 内容 | Gemini に送られるか |
|---|---|---|
| `## camera` | 撮影意図のメモ（誰がどこから見ている画か）。日本語混在可、長文不要 | **送られない**（人間とエージェントへのヒント） |
| `## scene_en` | **画像生成プロンプトの本体**。これと common-style と negative が連結されて Gemini に送られる | **送られる** |
| `## video_prompt_en` | 後段の動画化（Veo 等）用プロンプト。今のアプリでは生成には使われない | 現状送られない |

つまり「絵を変える」ためにエージェントが書き換えるべきは
**ほぼ常に `scene_en`**、必要なら `camera` と整合を取る、という関係です。

### 2.4 セクションの書き方規約（守ること）

- `## camera` / `## scene_en` / `## video_prompt_en` の **見出し名・順番・スペル** は固定。
  サーバの `splitSections()` が見出しテキストでセクションを切り出している（`server/cache.ts`）ので、
  名前を変えるとパースが壊れます。
- 各セクションは見出しの下に空行 1 行 → 本文 → 空行 1 行、という形を維持してください。
- `scene_en` は **英語の単一段落**。改行は入れないのが既存の慣例です（モデルは英語のほうが安定）。
- `scene_en` の中で **車を出す場合**、`common-style/car-clause.txt` に「the exact black sedan shown in the reference image」
  という固定文があり、`include_car_reference: true`（既定値）のときに stylePrompt に連結されます。
  車の色や車種を `scene_en` 内で別設定で書き直さないでください（矛盾するとモデルが片方を採用してしまう）。
- 車のないクローズアップや、舞台に車が存在しない章のカットでは
  frontmatter に `include_car_reference: false` を立てる。サーバ側で `car-reference.jpeg` の同梱と
  `car-clause.txt` の連結が自動でスキップされます（`scene_en` に「No car visible…」のような否定文を書き足す必要はありません）。

### 2.5 カットの追加・削除・分割・リネーム

カット数は固定ではありません。章の構成を見直す中でカットが増えたり減ったり、
1 つを 2 つに割ったり（`2-1` → `2-1` + `2-1b`）することがあります。
仕組みとしては **`data/cuts/` 配下に正しい命名で `.md` を置く / 消すだけ** で、
サーバ側（`server/cache.ts` の chokidar watcher）が自動で `add` / `unlink` を拾います。
ただし以下のルールを守ってください。

#### 命名規約（`{part}-{seq}.md`）

`seq` 部分は次のパターンが認識されます（`server/index.ts` の `parseSuffix()`）：

| 形式 | 例 | 用途 |
|---|---|---|
| `{n}` | `2-3` | 通常のシーケンシャルカット |
| `{n}{tail}` | `2-1b`, `2-1c` | 既存カットの直後に挿入する派生カット（分割の片割れ等） |
| `m{n}` | `2-m1`, `2-m2` | クローズアップやインサート等の extra カット（ソート順は通常カットの後ろ） |
| `s{n}` | `2-s1`, `2-s2` | 補助カット（`m` と同様に通常カットの後ろにソートされるが、命名上 `s` を使い分けたい場合） |

並び順は「`part` 昇順 → main(`{n}`/`{n}{tail}`) → extra(`m{n}`) → 数値昇順 → tail 文字列昇順」です。
新カットの ID を決めるときは、章内の既存ファイルを `ls data/cuts/{part}-*.md` で確認してから命名してください。

#### 追加するとき（新規カット）

1. ファイル名 `data/cuts/{cut_id}.md` を決める。**フロントマターの `cut_id` とファイル名（`.md` を除く）を一致させる。**
2. 既存カットを 1 つコピーしてフロントマターを書き換えるのが安全：
   - `cut_id` をファイル名と揃える
   - `part` / `dj` / `setting` を該当章に合わせる（`dj` は章ごとに固定。`data/narratives/part-{N}.md` の `dj` と同じ値）
   - `title_jp` / `summary_jp` を新カット用に書き直す
   - `status: draft`、`revision_memo: ''`
   - **`selected_image` は `{ illustration: '', game: '', camera: '' }` と空文字で初期化**（既存カットの値をコピーしないこと。別カットの画像が誤採用される）
3. 本文の `## camera` / `## scene_en` / `## video_prompt_en` を埋める。
4. UI を再読み込みすれば章ビューに新カットが現れます（chokidar が拾うので再起動不要）。

#### 削除するとき

1. `data/cuts/{cut_id}.md` を消す。
2. 生成済み画像 `data/images/gemini/*/{cut_id}/` と `data/images/thumbs/*/{cut_id}/` は **自動では消えない**。
   不要なら手で消してください（残しておいても UI からは見えなくなるだけで害はない）。
3. このカットを参照している `revision_memo` が他にないか、`npm run feedback` で確認しておくと安全です。

#### 分割するとき（例: `2-1` を `2-1` + `2-1b` に割る）

1. `data/cuts/2-1.md` をコピーして `data/cuts/2-1b.md` を作る。
2. 両方の `cut_id` をそれぞれ `2-1` / `2-1b` に修正。
3. **`selected_image` を空文字にリセット**（`2-1` の生成済み画像が `2-1b` にも採用された状態になるのを防ぐ）。
4. `scene_en` を「前半」「後半」に書き分ける。`title_jp` / `summary_jp` も合わせる。
5. 元の `2-1` の `revision_memo` に分割の旨を残しておくとレビューが楽です（任意）。

#### リネームするとき（`cut_id` を変えたい）

ファイル名と `cut_id` は必ず一致するので、両方を同時に変える必要があります。
さらに **画像ディレクトリも `cut_id` をパスに含む** ため、生成済み画像を保持したい場合は手作業の移動が要ります。

1. `data/cuts/{old}.md` の中の `cut_id: {new}` に書き換える。
2. ファイル名を `data/cuts/{new}.md` にリネーム。
3. 画像を残したい場合：
   - `data/images/gemini/{style}/{old}/` を `data/images/gemini/{style}/{new}/` に移動（3 スタイル分）
   - `data/images/thumbs/{style}/{old}/` も同様に移動
4. リネーム後に UI から該当カットを開いて、採用画像が正しく表示されているか確認。
5. リネームは整合性を崩しやすいので、**避けられるなら新規追加 + 旧削除のほうが安全**。

---

## 3. 章ファイル `data/narratives/part-{N}.md` のフォーマット

```markdown
---
part: 1
dj: HTK
setting_name: 銀座（出発）
concept_keyword: ラグジュアリーからの脱走
status: draft
revision_memo: ''
---
## plot

夜の銀座。銀のメルセデスベンツが目抜き通りを気取ってゆっくり走る。…
```

- 本文は `## plot` セクションのみ。
- `revision_memo` の使い方はカットと同じ（§4）。
- カットの `setting` / `title_jp` の元ネタとなる章コンセプトがここに書かれているので、
  カットの修正をするときは **必ず該当章の `## plot` を先に読む** こと。

---

## 4. `revision_memo` ＝ ユーザからエージェントへの修正指示

これがこのアプリの**ヒューマン↔エージェント間の主要なインターフェース**です。
ユーザは UI の「修正方針」テキストエリア（あるいは直接 Markdown を編集）に
**自然文で「この絵をこう変えてほしい」を書き残します**。

### 4.1 想定されるエントリ例

```yaml
revision_memo: '車の位置を画面右下にずらしたい。あと夜寄りに'
```

```yaml
revision_memo: |
  ・団地の繰り返しが弱い。地平線まで縮まずに同じ大きさで並ぶ感じを強めたい
  ・赤い気球をもっと小さく、画面奥の隙間に追いやる
  ・空の青みを下げて、徐々にアスファルトに侵食される予兆を入れたい
```

```yaml
revision_memo: 'illustration だけ色が浅い。共通スタイル側ではなくこのカットだけの問題っぽい'
```

書式は決まっていません。**箇条書き / 単一行 / 自由記述いずれも来得る** ので、
エージェントは内容を読んで意図を汲み取ってください。

### 4.2 エージェントの読み取り方とアクションの指針

1. **対象スコープを判定する**
   - 「○章全体で…」「全カット共通で…」のような指示は **`common-style/*.txt`** の修正候補。
     （例: 「全カットで明度を下げたい」→ `illustration.txt` / `game.txt` / `camera.txt`）
   - 「このカットだけ」「○-○ で…」のような指示は **当該 `cuts/{cut_id}.md` の `scene_en`** を直す。
   - ネガ方向（「映ってほしくないもの」）の指示は `common-style/negative.txt` を検討。
     ただし他カットへの影響が大きいので、特定カット限定の場合は `scene_en` 末尾に書く方が安全。

2. **`scene_en` 内のどこを直すか**
   - 既存の `scene_en` は基本「**シーンの構造 → 細部 → palette**」の順で書かれている。
     新しい要素を足すときも、構造（構図・カメラ位置）→ 物体細部 → 色彩、の順序を保つ。
   - 既存の文をいじるのではなく、**指示と矛盾しない部分はできるだけ温存** する
     （ユーザがすでに採用画と紐付けて記憶しているため、無関係箇所を改稿すると混乱する）。
   - 車については §2.4 の規約を厳守。

3. **`camera` セクションの整合**
   - `scene_en` でカメラの画角や位置を変えたら、`## camera` のメモも対応するように更新する。
     片方だけ変えると次回の修正のときに別の作業者が混乱する。

4. **修正完了の合図**
   - エージェントが `scene_en` を直し終えたら、`revision_memo` は **そのまま残す**。
     （変更履歴として、また次の生成・採用のレビュー材料として人間が見るため）
   - ユーザがその修正を確認して採用画像も差し替えたあと、ユーザ自身が
     `revision_memo: ''` に戻すか、新しい修正指示で上書きする運用です。
   - **エージェントの判断で `revision_memo` を空にしないこと。**

5. **触ってはいけないもの**
   - `selected_image` は触らない。サーバが自動で更新する。
   - `cut_id` / `part` / `dj` は触らない。
   - `status` は触らない（人間のレビュー進行を表すフィールド）。

### 4.3 指示が曖昧で判断できないとき

`revision_memo` が短すぎる・対象が曖昧（例: 「ちょっと違う」「もっと良く」）な場合は、
**勝手に書き換えず、ユーザに何を変えたいか聞き返す**。
このプロジェクトのカット数（70+）からして、エージェントが推測で広範囲を書き換えると
チェック負荷が爆発するためです。

### 4.4 まとめて取り出す: `npm run feedback`

カットや章をひとつずつ開いて `revision_memo` を読むのは効率が悪いので、
**空でない `revision_memo` を全件 Markdown で吐き出すスクリプト** を用意してあります。

```bash
npm run feedback                 # 標準出力に Markdown を出す
npm run feedback -- -o todo.md   # ファイルに書き出す
```

出力は章ごとにまとまった形式です：

```markdown
# Revision feedback (collected)

Generated: 2026-04-25T04:25:19.848Z
Found: narratives=0, cuts=2

## Part 1

### 1-m1 — 中央大噴水のクローズアップ _(status: draft)_

> 噴水のみのカットでok. 車は登場させない。

### 1-m2 — はりぼて宮殿のゴシック柱頭クローズアップ _(status: draft)_

> 車は登場させない。
```

エージェントとの作業セッションを始めるときに、このスクリプトの出力を冒頭に貼り付けて
「これ全部こなして」と渡すのが基本フローになります。スクリプトは `data/cuts/*.md` と
`data/narratives/*.md` を直接読むだけなので、サーバが起動していなくても動きます。
実装は `scripts/collect-feedback.ts`。

---

## 5. 共通スタイル `data/common-style/*.txt`

各ファイルは **改行なしの英語単一パラグラフ** が慣例です（短文の積み重ねで OK）。
スタイル名と内容のおおまかな対応：

| ファイル | 内容の方向性 |
|---|---|
| `illustration.txt` | 彩度高めのデジタルペインティング、ベタ塗りと筆致、シンボル性 |
| `game.txt` | PS1 期のローポリ 3D、ピクセルテクスチャ、ドローディスタンスの霧 |
| `camera.txt` | 90 年代後半〜2000 年代初頭のフィルム写真風、粒子・ハレーション・ブルーム |
| `negative.txt` | 全スタイル共通で「避けたい絵」リスト（写実、PBR、アニメ調、判読可能な日本語など） |
| `car-clause.txt` | 車のリファレンス画像と食い違わせないための固定フレーズ（"the exact black sedan shown in the reference image …"）。`include_car_reference: true`（既定値）のときに当該 style の本文の末尾に連結される |

`car-clause.txt` の文面は、車のリファレンス画像との整合を保つための拘束です。
**この一文を消したり、車種を上書きする文を追加したりしないでください**。
車を映さないカットでは個別カットの frontmatter で `include_car_reference: false` を立てて
`car-clause.txt` ごとリクエストから外す運用です（§2.4 末尾参照）。

ユーザの指示が「全カットでこう」「あるスタイル全体でこう」のときに、ここを編集します。
編集はすべての関連カットの生成結果に波及するので、影響範囲をユーザに確認してから
変更する方が安全です。

---

## 6. UI とサーバ（参考情報）

エージェントとしての作業は §1〜§5 のファイル編集が中心ですが、ユーザとの会話で
出てくる用語のために最小限の構造を載せておきます。

- **フロント**: `app/`（React + Vite）。サイドバーで「脚本全体 / common-style / Part N」を切り替え、
  Part N のビューでカットの行ごとにプロンプト編集と画像生成を行う。
- **サーバ**: `server/`（Express）。Markdown を読み書きし、chokidar でファイル監視、
  Gemini を呼んで `data/images/gemini/{style}/{cut_id}/` に保存する。
- **生成リクエストの中身**（参考）: `scene_en` ＋ 該当 style の `common-style/*.txt` ＋
  `Negative: common-style/negative.txt` を結合したテキストと、`car-reference.jpeg` を
  毎回同梱して送られる。**履歴はなく、1 セル = 1 ショット**。

ファイルを編集すれば即座にキャッシュが更新されるので、エディタで直接 `.md` を書き換えても
UI 側に反映されます。逆に、UI とエディタで同じカットを同時に編集すると最後の書き込みが勝ちます。

---

## 7. セットアップ

```bash
npm install
```

`.env`：

```
GOOGLE_API_KEY=xxxxxxxx        # または GEMINI_API_KEY
```

開発起動：

```bash
npm run dev        # サーバ(5174) と Vite を同時起動
npm run server     # サーバのみ
npm run web        # Vite のみ
npm run build      # 本番ビルド
npm run feedback   # 全カット/章の revision_memo を Markdown で出力（§4.4）
```

---

## 8. エージェント向けチートシート

- ユーザ指示の窓口は **`revision_memo`**。書式自由。読んで意図を解釈する。
- まとめて拾うときは **`npm run feedback`**（§4.4）。
- 直すのは原則 **当該カットの `## scene_en`**。必要なら `## camera` も整合を取る。
- 全カット共通の指示なら **`data/common-style/*.txt`**。範囲が広いので必要に応じて確認を取る。
- **触らない**: `cut_id` / `part` / `dj` / `status` / `selected_image` / 車に関する固定フレーズ。
- 修正後 `revision_memo` を **空にしない**。空にするのは人間の役目。
- 曖昧な指示は推測せず聞き返す。
- カットの追加・削除・分割・リネームの手順は §2.5。`selected_image` の初期化忘れに注意。
