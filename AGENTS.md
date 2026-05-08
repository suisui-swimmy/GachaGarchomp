# AGENTS.md

## プロジェクト概要

`GachaGarchomp` は、ガブリアス風のガチャマシーンを引いて、ポケモンの抽選結果を表示するジョーク寄りのフロントエンドアプリ。

- GitHub Pages想定
- フロントエンドのみ
- スマホ表示を優先
- 現状はビルド不要の静的構成
  - `index.html`
  - `styles.css`
  - `app.js`
  - `assets/`

## 実装方針

- 大きな設計変更より、まず動く演出を優先する
- ジョークアプリなので、厳密なゲーム実装や複雑な状態管理にしすぎない
- 既存のHTML/CSS/JS構成をなるべく維持する
- 画像素材は `assets/` 配下に置き、`app.js` の `ASSETS` から差し替えやすくする
- アニメーションは基本CSS keyframesで実装する
- スマホで破綻しないことを優先し、PCは崩れない程度でOK

## 現在のガチャ演出

ガブリアス素材は `1024 x 1024` のFigma座標を基準にしている。

- 原点: 左上 `(0, 0)`
- x: 右方向がプラス
- y: 下方向がプラス
- CSSでは `x / 1024 * 100%`、`y / 1024 * 100%` に変換して配置する

現在のレイヤー想定:

1. アイドル状態
   - `garchomp-body.svg`
   - `garchomp-arm-idle.svg`
2. レバーを引いた状態
   - `garchomp-body.svg`
   - `garchomp-arm-pulled.svg`
3. ボール排出状態
   - `garchomp-mouthopen.svg`
   - `garchomp-arm-pulled.svg`
   - `pokeball.svg`

ボールの起点は口内座標:

```txt
(741, 279)
```

ボール軌道は `styles.css` の `@keyframes dispenseBall` で調整する。

## 次にやりたい演出

ガチャ排出後、以下の流れを追加したい。

1. `dispenseBall` の `100%` 到達時に、モンスターボールを開く
   - `pokeball.svg` から `pokeball-open.svg` に差し替える想定
   - `pokeball-open.svg` は後から `assets/` に追加される
   - 開いたボールの中心位置は、`dispenseBall` の終点と同じ座標を起点にする

2. 開いたモンスターボールの中心から光が広がる
   - 白の円形発光でOK
   - 厳密なエフェクト素材がなくても、CSSの疑似要素や追加divで実装してよい
   - 光はボール中心から拡大し、画面全体を覆う

3. 画面全体を真っ白にフェードアウトする
   - ガチャ本体や結果パネルを白で覆う
   - `opacity` と `transform: scale(...)` のCSSアニメで十分
   - 演出時間はテンポ優先。長すぎないようにする

4. 画面中心に抽選結果をフェードインする
   - ポケモン画像は `assets/sprites/` 配下に置く想定
   - 名前と画像を中央に表示する
   - 画像素材は後から用意される
   - 最初は仮データ/仮画像でもOK

## 結果表示の方向性

結果表示は派手すぎなくてよいが、「おみくじアプリとして結果が出た」ことは分かりやすくする。

表示例:

```txt
今日のメガシンカ
メガリザードンX
[sprite image]
```

既存の `RESULTS` 配列に `sprite` を追加する形が扱いやすい。

```js
{
  pokemonName: "メガリザードンX",
  sprite: "./assets/sprites/charizard-mega-x.png",
}
```

## 状態遷移の目安

既存の `data-state` を増やすなら、以下のような流れが分かりやすい。

```txt
idle
pulling
dispensing
opening
flash
result
```

厳密にこの名前でなくてもよいが、CSS側で状態ごとの表示切り替えが追いやすい名前にする。

## 注意点

- ユーザーが軌道座標を指定した場合は、Figma座標 `1024 x 1024` 基準として扱う
- `pokeball` のサイズ変化を触らないでほしい依頼がある場合は、`scale(...)` を維持して `left/top` だけ調整する
- 画面外座標は使ってOK。原点と座標系が同じなら `1024` を超えても問題ない
- スマホで見切れすぎないかは軽く確認する
- 素材が未準備の場合は、仮SVG/仮PNG/プレースホルダーで先に動きを作ってよい
