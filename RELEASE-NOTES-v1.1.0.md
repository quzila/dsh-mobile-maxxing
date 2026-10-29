# quzila fork v1.1.0

This release builds on [kuraneko1/dsh-mobile-maxxing v1.0.0](https://github.com/kuraneko1/dsh-mobile-maxxing/releases/tag/v1.0.0). The original project remains credited in the package author field and license. The new ideas are based on [T2 Code](https://github.com/ashutoshpw/t2code) and [Hermes Agent](https://github.com/NousResearch/hermes-agent); no source from either project was copied.

## 変更

- iPad 幅のモバイル表示で、セッションのサイドバーをチャットの横に固定。セッション切替では自動で閉じず、明示的な閉じる操作でのみ畳む。
- T2 Code の prompt links に着想を得た下書き共有リンク。開いた側が採用するまで入力欄を変更せず、送信もしない。
- Hermes の memory に着想を得た任意の `dsh-bounded-memory` パッケージ。ユーザーの明示依頼で短い内容を保存し、DSH 既存の `AGENTS.md` 読み込みを利用する。常駐サービスは追加しない。
- フォークの更新機能、インストーラー、パッケージメタデータを quzila のリリースに向ける。

## 確認

- `npm test`: 665 件中 651 成功、14 スキップ、失敗 0。
- `npm run test:locale`: 40 件中 38 成功、2 スキップ、失敗 0。
- `node scripts/pack-all.mjs --require-locale`: 4 パッケージ、5 tarball を生成。
- DSH デスクトッププロファイルで `dsh-mobile-maxxing` v1.1.0 と `dsh-bounded-memory` v0.1.0 が実行中。
- Codex ブラウザーの iPad UA・1024px 幅で、サイドバー、チャット、セッション切替、明示的な開閉を確認。
- 下書きリンクを実画面でコピー・再読込し、明示的な取り込みのみが起きることを確認。テスト用の下書きは消去済み。

## 導入

本体のみ:

```sh
dsh plugin --profile web add github:quzila/dsh-mobile-maxxing#v1.1.0
```

メモリ機能も使う場合:

```sh
dsh plugin --profile web add https://github.com/quzila/dsh-mobile-maxxing/releases/download/v1.1.0/dsh-bounded-memory-0.1.0.tgz
```

既存の DSH で作業中のセッションを確認し、導入後に再起動する。メモリは新しいセッションから有効になる。
