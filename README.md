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
| `cut_id` | カット識別子。ファイル名と一致 | **触らない**（リネームは UI 経由でないと整合性が崩れる） |
| `part` | 章番号（1〜7） | 触らない |
| `dj` | 担当 DJ。章ごとに固定 | 触らない |
| `setting` | 舞台の和文ラベル | ユーザ指示があれば編集可 |
| `title_jp` | カットの和文タイトル（人間用） | ユーザ指示があれば編集可 |
| `summary_jp` | 和文要約（人間用） | ユーザ指示があれば編集可 |
| `status` | `draft` / `reviewing` / `approved` のいずれか | **エージェントは変更しない**。人間がレビュー結果として動かす |
| `revision_memo` | **修正指示の置き場（後述）** | ここを **読んで** 本文を直す。空文字 `''` に戻すかどうかは §4 のルール参照 |
| `selected_image` | スタイル別に「採用中」のファイル名 | **絶対に触らない**。サーバが自動更新する |

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
- `scene_en` の中で **車を出す場合**、共通スタイル側に「the exact black sedan shown in the reference image」
  という固定文があるので、車の色や車種を `scene_en` 内で別設定で書き直さないでください
  （矛盾するとモデルが片方を採用してしまう）。

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

`illustration.txt` / `game.txt` / `camera.txt` の各ファイル末尾には、車のリファレンス画像と
食い違わせないための固定フレーズ（"the exact black sedan shown in the reference image …"）が
入っています。**この一文を消したり、車種を上書きする文を追加したりしないでください**。

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
npm run dev      # サーバ(5174) と Vite を同時起動
npm run server   # サーバのみ
npm run web      # Vite のみ
npm run build    # 本番ビルド
```

---

## 8. エージェント向けチートシート

- ユーザ指示の窓口は **`revision_memo`**。書式自由。読んで意図を解釈する。
- 直すのは原則 **当該カットの `## scene_en`**。必要なら `## camera` も整合を取る。
- 全カット共通の指示なら **`data/common-style/*.txt`**。範囲が広いので必要に応じて確認を取る。
- **触らない**: `cut_id` / `part` / `dj` / `status` / `selected_image` / 車に関する固定フレーズ。
- 修正後 `revision_memo` を **空にしない**。空にするのは人間の役目。
- 曖昧な指示は推測せず聞き返す。
