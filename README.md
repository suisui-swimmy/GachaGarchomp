# GachaGarchomp

スマホ寄りの、仮素材つきガチャマシーンモーション試作です。

## 使い方

GitHub Pages ではリポジトリ直下を公開すればそのまま動く静的構成です。

ローカル確認ではJSONを読み込むため、`index.html` を直接開くのではなくHTTPサーバー経由で開いてください。

```powershell
npx serve .
```

または、Node.jsだけで一時サーバーを立てる場合は以下でも確認できます。

```powershell
node -e "const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();http.createServer((req,res)=>{let url=req.url.split('?')[0];if(url==='/')url='/index.html';const file=path.join(root,decodeURIComponent(url));fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('not found');return;}res.end(data);});}).listen(4173,'127.0.0.1',()=>console.log('http://127.0.0.1:4173'))"
```

## 素材の差し替え

`app.js` の `ASSETS` を差し替えると、後からPNG素材に置き換えられます。

```js
const ASSETS = {
  bodyClosed: "./assets/garchomp-body.svg",
  bodyOpen: "./assets/garchomp-mouthopen.svg",
  armIdle: "./assets/garchomp-arm-idle.svg",
  armPulled: "./assets/garchomp-arm-pulled.svg",
  ball: "./assets/pokeball.png",
  steam: "./assets/steam.png",
};
```

本体と腕は、同じキャンバスサイズのSVG/透明PNGで書き出すと位置合わせが安定します。ガブリアス本体レイヤーは `1024 x 1024` 前提です。

ボールの開始位置は `styles.css` の `.ball` と `@keyframes dispenseBall` にある `left: 72.36%; top: 27.25%;` で指定しています。これはFigma座標 `x=741, y=279` を `1024 x 1024` 基準の比率に変換した値です。

# 著作権
ゲーム内の画像、ポケモンの名称、その他関連する著作物・商標は、任天堂 / クリーチャーズ / ゲームフリークに帰属します。
本リポジトリは非公式のファンプロジェクトであり、任天堂 / クリーチャーズ / ゲームフリークとは一切関係ありません。
